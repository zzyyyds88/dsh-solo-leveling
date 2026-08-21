/**
 * @deepseek-ai/dsh-web-app — 默认 HTTPS 材料准备（开箱即用 TLS）。
 *
 * 让 `dsh web` 直接以 HTTPS 提供服务，零二次配置：
 *   - 用户上传的自有证书（`$DSH_HOME/https/custom.{crt,key}`，由 access-gate
 *     设置卡写入）优先使用——只做可解析/私钥匹配/有效期校验，SAN 由用户负责；
 *   - 否则自动生成/复用自签证书（纯 JS，RSA 2048，10 年），SAN 覆盖
 *     localhost + 127.0.0.1 + 本机全部非内网 IPv4，保证局域网任意网卡 IP
 *     访问都匹配；每次启动校验，过期或 SAN 不覆盖当前 IP 集则重新生成。
 * 证书目录沿用 `$DSH_HOME/caddy/certs` 的兼容思路，但归置到 `$DSH_HOME/https`。
 * @module @deepseek-ai/dsh-web-app/tls
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { createPrivateKey, X509Certificate } from 'node:crypto'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import selfsigned from 'selfsigned'

/** One PEM key/cert pair feeding the HTTPS listener. */
export interface TlsMaterial {
  key: string
  cert: string
}

/** 证书剩余有效期低于该值（30 天）即视为不适用、重新生成。 */
const MIN_VALID_MS = 30 * 24 * 3600 * 1000

/** 本机非内网 IPv4 地址（局域网访问候选）。
 * @returns the host's non-internal IPv4 addresses (LAN access candidates).
 */
export function lanIpv4s(): string[] {
  return Object.values(networkInterfaces()).flat()
    .filter((iface): iface is NonNullable<typeof iface> => iface !== undefined && iface.family === 'IPv4' && !iface.internal)
    .map(iface => iface.address)
}

/** 自签证书 SAN 覆盖集：localhost + 回环 + 本机全部局域网 IPv4。 */
function defaultAltHosts(): string[] {
  return ['localhost', '127.0.0.1', ...lanIpv4s()]
}

/** 生成覆盖一组 host/IP 的自签 RSA-2048 证书（纯 JS，无 openssl）。
 * @param hosts - host names and/or IPs the certificate's SAN must cover.
 * @returns the generated certificate/key PEM pair.
 */
export function generateSelfSignedCert(hosts: string[]): TlsMaterial {
  const commonName = hosts.find(host => !/^[0-9.]+$/.test(host)) ?? hosts[0] ?? 'localhost'
  const altNames = hosts.map(host => (/^[0-9.]+$/.test(host)
    ? { type: 7, ip: host }
    : { type: 2, value: host }))
  const pems = selfsigned.generate([{ name: 'commonName', value: commonName }], {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ],
  })
  return { cert: pems.cert, key: pems.private }
}

/**
 * 校验 PEM 证书/私钥对：可解析、私钥匹配、剩余有效期 ≥ 30 天。
 * `hosts` 非空时额外要求 SAN 覆盖每一个 host/IP（自签场景）；
 * 自有证书场景传空数组跳过 SAN 校验（SAN 由用户负责）。
 * @param certPem - the certificate PEM text.
 * @param keyPem - the private key PEM text; must match the certificate.
 * @param hosts - host/IP SANs the certificate must cover; pass [] to skip SAN checks.
 * @returns ok=true when the pair is usable, or ok=false with the reason.
 */
export function validateTlsMaterial(certPem: string, keyPem: string, hosts: readonly string[]): { ok: boolean; error?: string } {
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
  for (const host of hosts) {
    const covered = /^[0-9.]+$/.test(host) ? cert.checkIP(host) : cert.checkHost(host, { subject: 'always' })
    if (!covered) return { ok: false, error: `证书不覆盖 ${host}（SAN 不匹配）` }
  }
  return { ok: true }
}

/** 本实例证书目录（$DSH_HOME/https）。
 * @returns the HTTPS material directory under the DSH home.
 */
export function tlsDir(): string {
  return join(resolveDshHome(), 'https')
}

/**
 * 解析本轮启动的 HTTPS 材料：自有证书优先，否则自签（复用/重生成）。
 * @returns key/cert PEM 对。
 */
export function ensureWebTls(): TlsMaterial {
  const dir = tlsDir()
  const customCertFile = join(dir, 'custom.crt')
  const customKeyFile = join(dir, 'custom.key')
  if (existsSync(customCertFile) && existsSync(customKeyFile)) {
    try {
      const cert = readFileSync(customCertFile, 'utf8')
      const key = readFileSync(customKeyFile, 'utf8')
      // 自有证书：SAN 由用户负责，仅做基础校验。
      const check = validateTlsMaterial(cert, key, [])
      if (check.ok) return { cert, key }
      console.error(`[dsh-web-app] 自有证书不适用（${check.error}），回退自签证书`)
    } catch (error) {
      console.error('[dsh-web-app] 读取自有证书失败，回退自签证书:', error instanceof Error ? error.message : String(error))
    }
  }
  return ensureSelfSigned()
}

/** 确保自签证书：复用 $DSH_HOME/https/dsh-https.{crt,key}，否则生成。 */
function ensureSelfSigned(): TlsMaterial {
  const dir = tlsDir()
  mkdirSync(dir, { recursive: true })
  const certFile = join(dir, 'dsh-https.crt')
  const keyFile = join(dir, 'dsh-https.key')
  const hosts = defaultAltHosts()
  if (existsSync(certFile) && existsSync(keyFile)) {
    try {
      const cert = readFileSync(certFile, 'utf8')
      const key = readFileSync(keyFile, 'utf8')
      const check = validateTlsMaterial(cert, key, hosts)
      if (check.ok) return { cert, key }
      console.log(`[dsh-web-app] 现有自签证书不适用（${check.error}），重新生成`)
    } catch (error) {
      console.error('[dsh-web-app] 读取现有自签证书失败，重新生成:', error instanceof Error ? error.message : String(error))
    }
  }
  const material = generateSelfSignedCert(hosts)
  try {
    writeFileSync(certFile, material.cert, { mode: 0o644 })
    writeFileSync(keyFile, material.key, { mode: 0o600 })
    chmodSync(keyFile, 0o600)
  } catch (error) {
    console.error('[dsh-web-app] 写入证书文件失败（本次运行仍使用内存中的证书）:', error instanceof Error ? error.message : String(error))
  }
  console.log(`[dsh-web-app] 已生成默认 HTTPS 自签证书（SAN: ${hosts.join(', ')}）`)
  return material
}
