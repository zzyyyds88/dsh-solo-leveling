// Web e2e scenario: the fork's access gate (login gate) keeps a password-
// protected deployment sealed until the right password arrives. Fork
// divergence coverage: upstream has no gate, so no upstream scenario exists.
// The test password is the workspace-wide constant test123456
// (docs/开发规范.md §2.3 — never invent another). Zero model calls: the
// scenario spawns a real `dsh web` on a keyless credential and drives the
// gate's plain-HTML login page plus its API seal in a real chromium.
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { REPO_ROOT, TEST_ACCESS_GATE_PASSWORD, requireDist, saveFailureShot, testHttpProbe } from './support.ts'

/** Wait for the spawned host's ready line; the fork may bind plain or TLS. */
function waitForReadyLine(child: ChildProcess): Promise<string> {
  return new Promise((resolveReady, reject) => {
    let out = ''
    const timer = setTimeout(() => { reject(new Error(`dsh web not ready in 90s; output:\n${out}`)) }, 90_000)
    const onData = (chunk: Buffer): void => {
      out += chunk.toString()
      const match = /dsh web: (https?:\/\/[^\s]+)/.exec(out)
      if (match?.[1] !== undefined) {
        clearTimeout(timer)
        resolveReady(match[1])
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`dsh web exited early (code ${code}); output:\n${out}`))
    })
  })
}

describe('web e2e: access gate login', () => {
  let child: ChildProcess
  let world: string
  let baseUrl: string
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    requireDist()
    world = mkdtempSync(join(tmpdir(), 'dsh-web-gate-'))
    const tsxLoader = pathToFileURL(createRequire(join(REPO_ROOT, 'package.json')).resolve('tsx')).href
    child = spawn(
      process.execPath,
      ['--import', tsxLoader, join(REPO_ROOT, 'apps/cli/src/bin.ts'), 'web', '--no-open', '--port', '0'],
      {
        cwd: world,
        env: {
          ...process.env,
          DEEPSEEK_API_KEY: 'keyless-gate-no-call',
          // The workspace-wide test password (docs/开发规范.md §2.3).
          DSH_ACCESS_GATE_PASSWORD: TEST_ACCESS_GATE_PASSWORD,
          DSH_HOME: join(world, '.dsh'),
          DSH_AGENTS_HOME: join(world, '.agents'),
          TSX_TSCONFIG_PATH: join(REPO_ROOT, 'tsconfig.json'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    // Self-signed TLS is possible on this boot; never let the cert block the lane.
    baseUrl = (await waitForReadyLine(child)).replace('0.0.0.0', '127.0.0.1')
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, ignoreHTTPSErrors: true })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    if (child !== undefined && child.exitCode === null) {
      const gone = new Promise<void>(resolveExit => child.once('exit', () => { resolveExit() }))
      child.kill('SIGTERM')
      await Promise.race([gone, new Promise(resolveTimeout => setTimeout(resolveTimeout, 10_000).unref())])
      if (child.exitCode === null) child.kill('SIGKILL')
    }
    if (world !== undefined) rmSync(world, { recursive: true, force: true })
  })

  it('seals the API and redirects pages to the login screen before sign-in', async () => {
    // testHttpProbe rides the fork's self-signed TLS (native fetch rejects it).
    const api = await testHttpProbe(`${baseUrl}/api/session.list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'gate-probe', method: 'session.list', payload: {} }),
    })
    expect(api.status).toBe(401)
    const home = await testHttpProbe(baseUrl)
    expect(home.status).toBe(302)
    expect(home.location).toBe('/login?next=%2F')
  })

  it('rejects a wrong password and admits the workspace test password', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-access-gate-login'))
    await page.goto(baseUrl, { waitUntil: 'load' })
    expect(page.url()).toContain('/login')
    const password = page.locator('#password')
    await password.waitFor({ timeout: 10_000 })

    await password.fill('wrong-password-1')
    await page.getByRole('button', { name: /登\s*录/ }).click()
    await expect.poll(async () => page.locator('#error').evaluate(node => ({
      display: getComputedStyle(node).display,
      text: node.textContent ?? '',
    })), { timeout: 10_000 }).toEqual({ display: 'block', text: '口令错误，请重试' })
    expect(page.url()).toContain('/login')

    await password.fill(TEST_ACCESS_GATE_PASSWORD)
    await page.getByRole('button', { name: /登\s*录/ }).click()
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    expect(page.url()).not.toContain('/login')

    // The signed session cookie now opens the API the gate sealed earlier.
    const api = await page.request.post(`${baseUrl}/api/session.list`, {
      data: { type: 'client-request', rpcId: 'gate-session', method: 'session.list', payload: {} },
    })
    expect(api.status()).toBe(200)
  }, 90_000)
})
