/**
 * dsh-web-app — 默认 HTTPS 材料（tls.ts）单元测试：纯 JS 自签生成、校验、
 * 磁盘复用、自有证书优先、回退自签。
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureWebTls,
  generateSelfSignedCert,
  validateTlsMaterial,
} from '../src/tls.ts'

let home: string | undefined
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-web-tls-'))
  process.env.DSH_HOME = home
})

afterEach(() => {
  if (home !== undefined) rmSync(home, { recursive: true, force: true })
  home = undefined
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
})

describe('self-signed certificate generation and validation', () => {
  it('generates a parseable cert/key pair covering its hosts', () => {
    const material = generateSelfSignedCert(['dsh.example.com', '192.168.1.5'])
    expect(material.cert).toContain('BEGIN CERTIFICATE')
    expect(material.key).toContain('BEGIN')
    const check = validateTlsMaterial(material.cert, material.key, ['dsh.example.com', '192.168.1.5'])
    expect(check.ok).toBe(true)
  })

  it('rejects a cert that does not cover a requested host', () => {
    const material = generateSelfSignedCert(['a.example.com'])
    const check = validateTlsMaterial(material.cert, material.key, ['b.example.com'])
    expect(check.ok).toBe(false)
    expect(check.error).toContain('不覆盖')
  })

  it('rejects a mismatched key and garbage PEM', () => {
    const first = generateSelfSignedCert(['x.example.com'])
    const second = generateSelfSignedCert(['x.example.com'])
    expect(validateTlsMaterial(first.cert, second.key, []).ok).toBe(false)
    expect(validateTlsMaterial('not-a-cert', 'not-a-key', []).ok).toBe(false)
  })
})

describe('ensureWebTls', () => {
  it('generates a self-signed pair under $DSH_HOME/https and reuses it', () => {
    const first = ensureWebTls()
    expect(readFileSync(join(home!, 'https', 'dsh-https.crt'), 'utf8')).toBe(first.cert)
    expect(readFileSync(join(home!, 'https', 'dsh-https.key'), 'utf8')).toBe(first.key)
    const second = ensureWebTls()
    expect(second.cert).toBe(first.cert)
    expect(second.key).toBe(first.key)
  })

  it('prefers a valid uploaded custom cert and falls back when it is invalid', () => {
    const custom = generateSelfSignedCert(['my.example.com'])
    mkdirSync(join(home!, 'https'), { recursive: true })
    writeFileSync(join(home!, 'https', 'custom.crt'), custom.cert)
    writeFileSync(join(home!, 'https', 'custom.key'), custom.key)
    const material = ensureWebTls()
    expect(material.cert).toBe(custom.cert)
    expect(material.key).toBe(custom.key)

    // Corrupt the custom key: ensureWebTls must fall back to self-signed.
    writeFileSync(join(home!, 'https', 'custom.key'), 'not-a-key')
    const fallback = ensureWebTls()
    expect(fallback.cert).not.toBe(custom.cert)
    expect(fallback.key).not.toBe('not-a-key')
  })
})
