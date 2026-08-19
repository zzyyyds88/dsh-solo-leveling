/**
 * dsh-host-access-gate — 进程内 HTTPS 反向代理（取代旧版内置 caddy 二进制）。
 *
 * TLS 终结、HTTP 转发与 WebSocket 隧道全部用 Node 内置模块实现，随 dsh 进程
 * 生灭：无外部二进制、无子进程、无 openssl 命令，天然跨平台、多实例隔离
 * （每个 dsh 实例的 DSH_HOME 不同 → 证书目录不同）。
 *
 * 行为对齐旧 caddy 反代（`reverse_proxy` 默认语义）：
 *   - 保留客户端原始 Host 头，仅追加 X-Forwarded-For / X-Forwarded-Proto:
 *     https / X-Forwarded-Host；
 *   - 自签证书（纯 JS 生成，SAN = lanHost + localhost + 127.0.0.1，RSA 2048，
 *     10 年有效期，与旧 openssl 生成参数一致）；
 *   - WebSocket upgrade 走双向 socket 管道，字节级透传；
 *   - 支持用户上传自有证书（custom 模式）：校验 PEM 可解析、私钥匹配、
 *     有效期充足、SAN 覆盖 lanHost，任一不满足即拒绝启用并给出原因。
 * @module dsh-host-access-gate/proxy
 */

import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createProbeServer } from 'node:net'
import { createPrivateKey, X509Certificate } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Duplex } from 'node:stream'
import selfsigned from 'selfsigned'

/** 证书剩余有效期低于该值（30 天）即视为不适用、触发重新生成。 */
const MIN_VALID_MS = 30 * 24 * 3600 * 1000

/** One PEM cert/key pair for the HTTPS listener. */
export interface TlsMaterial {
  /** PEM certificate (leaf). */
  cert: string
  /** PEM private key (unencrypted). */
  key: string
}

/** Validation result for a cert/key pair against the served host. */
export interface CertCheck {
  ok: boolean
  /** Human-readable reason when `ok` is false. */
  error?: string
}

/** Options for {@link startReverseProxy}. */
export interface ReverseProxyOptions {
  /** Host the certificate must cover and the access URL advertises. */
  lanHost: string
  /** External HTTPS listen port. */
  httpsPort: number
  /** Internal dsh web HTTP port to forward to (127.0.0.1). */
  targetPort: number
  /** TLS material for the HTTPS listener. */
  tls: TlsMaterial
}

/** Running in-process reverse proxy with a close handle. */
export interface ReverseProxyHandle {
  /** The listening https server. */
  server: HttpsServer
  /** Port the server listens on. */
  httpsPort: number
  /** Close the listener and destroy all connections (incl. upgraded tunnels). */
  close(): Promise<void>
}

/** Whether a host string is a dotted-IPv4 literal (certs need IP SANs then). */
function isIpLiteral(host: string): boolean {
  return /^[0-9.]+$/.test(host)
}

/** SAN list for a self-signed cert: lanHost (+ localhost + loopback always). */
function sanAltNames(lanHost: string): Array<{ type: number; value?: string; ip?: string }> {
  return [
    ...(isIpLiteral(lanHost) ? [{ type: 7, ip: lanHost }] : [{ type: 2, value: lanHost }]),
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
  ]
}

/**
 * Generate a self-signed RSA-2048 cert for `lanHost` in pure JS (no openssl).
 * Backed by `selfsigned@2.x` (node-forge, sync API; the dependency is pinned
 * to the 2.x line whose option shape this function uses).
 * @param lanHost - host or IP the cert must cover.
 * @returns the PEM pair.
 */
export function generateSelfSignedCert(lanHost: string): TlsMaterial {
  const pems = selfsigned.generate([{ name: 'commonName', value: lanHost }], {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: sanAltNames(lanHost) },
    ],
  })
  return { cert: pems.cert, key: pems.private }
}

/**
 * Validate a PEM cert/key pair against the served host: parseable, key matches
 * the cert, at least 30 days of validity left, and SAN covers `lanHost`.
 * @returns `{ ok: true }` or `{ ok: false, error }` with a user-facing reason.
 */
export function validateTlsMaterial(certPem: string, keyPem: string, lanHost: string): CertCheck {
  if (certPem.trim().length === 0 || keyPem.trim().length === 0) {
    return { ok: false, error: '证书或私钥为空' }
  }
  let cert: X509Certificate
  try {
    cert = new X509Certificate(certPem)
  } catch (error) {
    return { ok: false, error: `证书解析失败：${error instanceof Error ? error.message : String(error)}` }
  }
  try {
    if (!cert.checkPrivateKey(createPrivateKey(keyPem))) return { ok: false, error: '私钥与证书不匹配' }
  } catch {
    return { ok: false, error: '私钥解析失败（需为未加密的 PEM 格式）' }
  }
  const validTo = Date.parse(cert.validTo)
  if (!Number.isFinite(validTo) || validTo <= Date.now() + MIN_VALID_MS) {
    return { ok: false, error: `证书有效期不足（${cert.validTo} 到期，需剩余 ≥ 30 天）` }
  }
  const covered = isIpLiteral(lanHost) ? cert.checkIP(lanHost) : cert.checkHost(lanHost, { subject: 'always' })
  if (!covered) return { ok: false, error: `证书不覆盖 ${lanHost}（SAN 不匹配）` }
  return { ok: true }
}

/**
 * Return a valid self-signed cert for `lanHost`, reusing the on-disk pair at
 * `certDir` when it still validates, otherwise generating and persisting a new
 * one. File names mirror the old caddy scheme so existing deployments keep
 * their certificates.
 * @param certDir - per-instance cert directory (e.g. `$DSH_HOME/caddy/certs`).
 * @param lanHost - host or IP the cert must cover.
 */
export function ensureSelfSignedCert(certDir: string, lanHost: string): TlsMaterial {
  mkdirSync(certDir, { recursive: true })
  const base = `dsh-${lanHost.replace(/[^A-Za-z0-9.-]/g, '_')}`
  const certFile = join(certDir, `${base}.crt`)
  const keyFile = join(certDir, `${base}.key`)
  if (existsSync(certFile) && existsSync(keyFile)) {
    try {
      const cert = readFileSync(certFile, 'utf8')
      const key = readFileSync(keyFile, 'utf8')
      const check = validateTlsMaterial(cert, key, lanHost)
      if (check.ok) return { cert, key }
      console.log(`[dsh-host-access-gate] 现有自签证书不适用（${check.error}），重新生成`)
    } catch (error) {
      console.error('[dsh-host-access-gate] 读取现有证书失败，重新生成:', error instanceof Error ? error.message : String(error))
    }
  }
  const material = generateSelfSignedCert(lanHost)
  try {
    writeFileSync(certFile, material.cert, { mode: 0o644 })
    writeFileSync(keyFile, material.key, { mode: 0o600 })
    chmodSync(keyFile, 0o600)
  } catch (error) {
    console.error('[dsh-host-access-gate] 写入证书文件失败（本次运行仍使用内存中的证书）:', error instanceof Error ? error.message : String(error))
  }
  console.log(`[dsh-host-access-gate] 已生成自签证书（SAN: ${lanHost}）`)
  return material
}

/**
 * HTTP request forwarder: relays the request to the internal web server,
 * preserving the original Host header and adding X-Forwarded-* headers.
 */
function makeHttpHandler(targetPort: number): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const headers: Record<string, string | string[] | undefined> = { ...req.headers }
    // Node already answered `Expect: 100-continue` with 100 on our behalf
    // (default server behavior without a checkContinue listener), so the body
    // is flowing; forwarding the expectation to the backend would make it wait.
    delete headers['expect']
    const xff = headers['x-forwarded-for']
    const client = req.socket.remoteAddress ?? ''
    headers['x-forwarded-for'] = typeof xff === 'string' && xff.length > 0 ? `${xff}, ${client}` : client
    headers['x-forwarded-proto'] = 'https'
    headers['x-forwarded-host'] = headers['host'] ?? ''
    const proxyReq = httpRequest({
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: targetPort,
      method: req.method,
      path: req.url,
      headers,
    }, (proxyRes) => {
      const responseHeaders = { ...proxyRes.headers }
      // Node manages chunking and keep-alive on the client side itself.
      delete responseHeaders['connection']
      delete responseHeaders['transfer-encoding']
      res.writeHead(proxyRes.statusCode ?? 502, responseHeaders)
      proxyRes.pipe(res)
    })
    proxyReq.on('error', (error) => {
      if (res.headersSent) {
        res.destroy()
        return
      }
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end(`Bad Gateway: ${error.message}`)
    })
    req.pipe(proxyReq)
  }
}

/**
 * WebSocket upgrade forwarder: relays the upgrade handshake to the backend and
 * pipes the two sockets bidirectionally (byte-level transparent tunneling).
 * Tunnels are tracked as pairs so close() can tear down both ends.
 */
function makeUpgradeHandler(
  targetPort: number,
  tunnels: Set<{ client: Duplex; backend: Duplex }>,
): (req: IncomingMessage, clientSocket: Duplex, head: Buffer) => void {
  return (req, clientSocket, head) => {
    const proxyReq = httpRequest({
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: targetPort,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        connection: 'Upgrade',
        upgrade: req.headers.upgrade ?? 'websocket',
      },
      // One dedicated connection per tunnel: never pool upgraded sockets.
      agent: false,
    })
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      const tunnel = { client: clientSocket, backend: proxySocket }
      tunnels.add(tunnel)
      const dropTunnel = (): void => { tunnels.delete(tunnel) }
      // Whichever side closes first, tear down the peer too — otherwise the
      // backend-side socket lingers half-open and the backend never sees FIN.
      const closePeer = (peer: Duplex): (() => void) => () => { peer.destroy() }
      clientSocket.once('close', dropTunnel)
      proxySocket.once('close', dropTunnel)
      clientSocket.once('close', closePeer(proxySocket))
      proxySocket.once('close', closePeer(clientSocket))
      const teardown = (): void => {
        clientSocket.destroy()
        proxySocket.destroy()
      }
      clientSocket.on('error', teardown)
      proxySocket.on('error', teardown)
      // Relay the backend's 101 (or rejection status) verbatim to the client.
      const statusLine = `HTTP/1.1 ${proxyRes.statusCode ?? 101} ${proxyRes.statusMessage ?? 'Switching Protocols'}\r\n`
      const headerLines = Object.entries(proxyRes.headers)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}\r\n`)
        .join('')
      clientSocket.write(`${statusLine}${headerLines}\r\n`)
      if (proxyHead.length > 0) proxySocket.unshift(proxyHead)
      proxySocket.pipe(clientSocket)
      clientSocket.pipe(proxySocket)
    })
    proxyReq.on('error', () => { clientSocket.destroy() })
    if (head.length > 0) proxyReq.write(head)
    proxyReq.end()
  }
}

/**
 * Start the in-process HTTPS reverse proxy: TLS termination on `httpsPort`
 * (all interfaces), forwarding to `127.0.0.1:targetPort`.
 * @param opts - proxy parameters.
 * @returns a handle exposing the server and a close() that also tears down
 * upgraded WebSocket tunnels.
 */
export function startReverseProxy(opts: ReverseProxyOptions): ReverseProxyHandle {
  const tunnels = new Set<{ client: Duplex; backend: Duplex }>()
  const server = createHttpsServer({ key: opts.tls.key, cert: opts.tls.cert }, makeHttpHandler(opts.targetPort))
  server.on('upgrade', makeUpgradeHandler(opts.targetPort, tunnels))
  server.on('error', (error) => {
    // EADDRINUSE and friends surface here; the dsh web instance itself keeps
    // running — the operator sees the reason in the log and can change ports.
    console.error(`[dsh-host-access-gate] HTTPS 反代监听失败（端口 ${opts.httpsPort}）:`, error.message)
  })
  server.listen(opts.httpsPort)
  return {
    server,
    httpsPort: opts.httpsPort,
    close: () => new Promise<void>((resolve) => {
      // Tear down both ends of every tunnel so the backend sees FIN too
      // (Node does not include upgraded sockets in closeAllConnections()).
      for (const tunnel of tunnels) {
        tunnel.client.destroy()
        tunnel.backend.destroy()
      }
      tunnels.clear()
      server.closeAllConnections()
      server.close(() => { resolve() })
    }),
  }
}

/**
 * Probe whether a port is currently occupied by any process (including our own
 * proxy): binds a throwaway listener and reports any bind failure as occupied.
 * @param port - port to probe.
 * @returns true when the port cannot be bound.
 */
export function checkPortOccupied(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createProbeServer()
    probe.once('error', () => { resolve(true) })
    probe.once('listening', () => probe.close(() => { resolve(false) }))
    probe.listen(port, '0.0.0.0')
  })
}
