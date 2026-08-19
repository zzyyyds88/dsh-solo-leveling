/**
 * dsh-host-access-gate — proxy 模块冒烟测试（进程内 HTTPS 反代）。
 *
 * 覆盖：纯 JS 自签证书生成/校验、HTTP 转发（Host 保留 + X-Forwarded-* +
 * 大 body 流式）、WebSocket upgrade 隧道、端口占用探测、证书文件复用。
 * 不依赖 caddy/openssl/外部进程。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { createServer as createNetServer } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  checkPortOccupied,
  ensureSelfSignedCert,
  generateSelfSignedCert,
  startReverseProxy,
  validateTlsMaterial,
  type ReverseProxyHandle,
} from '../src/proxy.ts'

/** One-shot HTTPS GET/POST against a self-signed listener. */
function httpsOnce(
  port: number,
  options: RequestOptions & { body?: string | Buffer },
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      host: '127.0.0.1',
      port,
      rejectUnauthorized: false,
      method: options.method ?? 'GET',
      path: options.path ?? '/',
      headers: options.headers,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    req.on('error', reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

/** Raw WebSocket-style upgrade over the proxy: sends bytes, collects echoed bytes. */
function wsEchoOnce(proxyPort: number, path: string, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      host: '127.0.0.1',
      port: proxyPort,
      path,
      rejectUnauthorized: false,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
      },
    })
    req.on('upgrade', (_res, socket) => {
      const chunks: Buffer[] = []
      socket.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        const total = Buffer.concat(chunks)
        if (total.length >= payload.length) {
          socket.destroy()
          resolve(total.toString('utf8'))
        }
      })
      socket.on('error', reject)
      socket.write(payload)
    })
    req.on('error', reject)
    req.end()
  })
}

describe('self-signed certificate generation and validation', () => {
  it('generates a cert covering an IP literal and validates it', () => {
    const material = generateSelfSignedCert('192.168.1.100')
    expect(material.cert).toContain('BEGIN CERTIFICATE')
    expect(material.key).toContain('BEGIN')
    const check = validateTlsMaterial(material.cert, material.key, '192.168.1.100')
    expect(check.ok).toBe(true)
  })

  it('generates a cert covering a hostname (DNS SAN) and validates it', () => {
    const material = generateSelfSignedCert('dsh.example.com')
    const check = validateTlsMaterial(material.cert, material.key, 'dsh.example.com')
    expect(check.ok).toBe(true)
  })

  it('rejects a cert that does not cover the host', () => {
    const material = generateSelfSignedCert('a.example.com')
    const check = validateTlsMaterial(material.cert, material.key, 'b.example.com')
    expect(check.ok).toBe(false)
    expect(check.error).toContain('不覆盖')
  })

  it('rejects a mismatched key', () => {
    const first = generateSelfSignedCert('x.example.com')
    const second = generateSelfSignedCert('x.example.com')
    const check = validateTlsMaterial(first.cert, second.key, 'x.example.com')
    expect(check.ok).toBe(false)
    expect(check.error).toContain('不匹配')
  })

  it('rejects garbage PEM', () => {
    const check = validateTlsMaterial('not-a-cert', 'not-a-key', 'x.example.com')
    expect(check.ok).toBe(false)
  })

  it('ensureSelfSignedCert reuses a still-valid on-disk pair', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-proxy-cert-'))
    try {
      const first = ensureSelfSignedCert(dir, 'reuse.example.com')
      const second = ensureSelfSignedCert(dir, 'reuse.example.com')
      expect(second.cert).toBe(first.cert)
      expect(second.key).toBe(first.key)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('in-process HTTPS reverse proxy', () => {
  let backend: HttpServer | undefined
  let backendPort = 0
  let proxy: ReverseProxyHandle | undefined
  let proxyPort = 0
  const backendUpgraded = new Set<import('node:stream').Duplex>()

  beforeEach(async () => {
    backend = createHttpServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      req.on('end', () => {
        if (req.url === '/status404') {
          res.writeHead(404, { 'content-type': 'text/plain' })
          res.end('nope')
          return
        }
        const body = Buffer.concat(chunks).toString('utf8')
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          method: req.method,
          url: req.url,
          host: req.headers.host,
          xff: req.headers['x-forwarded-for'],
          xproto: req.headers['x-forwarded-proto'],
          xhost: req.headers['x-forwarded-host'],
          bodyLen: body.length,
          bodyPrefix: body.slice(0, 32),
        }))
      })
    })
    backend.on('upgrade', (_req, socket) => {
      // Minimal echo tunnel: accept any upgrade, echo bytes back verbatim.
      backendUpgraded.add(socket)
      socket.once('close', () => { backendUpgraded.delete(socket) })
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n')
      socket.on('data', (chunk: Buffer) => { socket.write(chunk) })
    })
    await new Promise<void>((resolve) => { backend!.listen(0, '127.0.0.1', resolve) })
    backendPort = (backend.address() as { port: number }).port
    const material = generateSelfSignedCert('127.0.0.1')
    proxy = startReverseProxy({ lanHost: '127.0.0.1', httpsPort: 0, targetPort: backendPort, tls: material })
    await new Promise<void>((resolve) => { proxy!.server.once('listening', resolve) })
    proxyPort = (proxy.server.address() as { port: number }).port
  })

  afterEach(async () => {
    if (proxy !== undefined) await proxy.close()
    proxy = undefined
    for (const socket of backendUpgraded) socket.destroy()
    backendUpgraded.clear()
    if (backend !== undefined) {
      const closing = backend
      await new Promise<void>((resolve) => { closing.close(() => { resolve() }) })
    }
    backend = undefined
  })

  it('forwards GET with preserved Host and X-Forwarded-* headers', async () => {
    const res = await httpsOnce(proxyPort, {
      path: '/hello?x=1',
      headers: { host: 'dsh.lan:5700', 'x-forwarded-for': '10.0.0.9' },
    })
    expect(res.status).toBe(200)
    const json = JSON.parse(res.body) as Record<string, unknown>
    expect(json.method).toBe('GET')
    expect(json.url).toBe('/hello?x=1')
    expect(json.host).toBe('dsh.lan:5700')
    expect(json.xproto).toBe('https')
    expect(json.xhost).toBe('dsh.lan:5700')
    // original XFF entry is preserved, client address appended
    expect(String(json.xff)).toContain('10.0.0.9')
  })

  it('streams a large POST body through', async () => {
    const big = 'a'.repeat(5 * 1024 * 1024)
    const res = await httpsOnce(proxyPort, { method: 'POST', path: '/upload', body: big })
    expect(res.status).toBe(200)
    const json = JSON.parse(res.body) as Record<string, unknown>
    expect(json.method).toBe('POST')
    expect(json.bodyLen).toBe(big.length)
  })

  it('passes through non-200 statuses', async () => {
    const res = await httpsOnce(proxyPort, { path: '/status404' })
    expect(res.status).toBe(404)
    expect(res.body).toBe('nope')
  })

  it('answers 502 when the backend is down', async () => {
    const deadPort = backendPort
    await new Promise<void>((resolve) => { backend!.close(() => { resolve() }) })
    backend = undefined
    // Point a fresh proxy at the now-closed backend port.
    if (proxy !== undefined) await proxy.close()
    const material = generateSelfSignedCert('127.0.0.1')
    proxy = startReverseProxy({ lanHost: '127.0.0.1', httpsPort: 0, targetPort: deadPort, tls: material })
    await new Promise<void>((resolve) => { proxy!.server.once('listening', resolve) })
    proxyPort = (proxy.server.address() as { port: number }).port
    const res = await httpsOnce(proxyPort, { path: '/' })
    expect(res.status).toBe(502)
    expect(res.body).toContain('Bad Gateway')
  })

  it('tunnels WebSocket upgrades bidirectionally', async () => {
    const echoed = await wsEchoOnce(proxyPort, '/ws', 'ping-from-client')
    expect(echoed).toBe('ping-from-client')
  })
})

describe('port occupancy probe', () => {
  it('reports a bound port as occupied and a free one as free', async () => {
    const blocker = createNetServer()
    await new Promise<void>((resolve) => { blocker.listen(0, '127.0.0.1', resolve) })
    const usedPort = (blocker.address() as { port: number }).port
    try {
      expect(await checkPortOccupied(usedPort)).toBe(true)
      const probe = createNetServer()
      await new Promise<void>((resolve) => { probe.listen(0, '127.0.0.1', resolve) })
      const freePort = (probe.address() as { port: number }).port
      await new Promise<void>((resolve) => { probe.close(() => { resolve() }) })
      expect(await checkPortOccupied(freePort)).toBe(false)
    } finally {
      await new Promise<void>((resolve) => { blocker.close(() => { resolve() }) })
    }
  })
})
