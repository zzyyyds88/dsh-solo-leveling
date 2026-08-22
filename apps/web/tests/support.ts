// Shared plumbing for the web smoke tests (dist location, free port, failure shots).
import { existsSync, mkdirSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'

/** The built page under test; `pnpm run test:web` rebuilds it before running. */
export const DIST_INDEX = fileURLToPath(new URL('../dist/index.html', import.meta.url))

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * Browser language a page must advertise to boot into the product's Chinese
 * surface: with no stored preference the client derives its initial locale
 * from the browser, and Playwright's default browser asks for English.
 */
export const ZH_BROWSER_LOCALE = 'zh-CN'

/**
 * The one password every test scenario uses when the access gate must stay
 * on (docs/工作区/开发规范.md §2.3): `DSH_ACCESS_GATE_PASSWORD=<this>` for spawned
 * hosts, the same value typed into the login page. Never invent another.
 */
export const TEST_ACCESS_GATE_PASSWORD = 'test123456'

/**
 * Open the standard browser-test page advertising English before client boot.
 * This keeps role locators and goldens deterministic while leaving the Host
 * settings document free to override the provisional browser-derived locale;
 * scenarios asserting the Chinese surface advertise
 * {@link ZH_BROWSER_LOCALE} instead. ignoreHTTPSErrors stays on for the
 * fork's self-signed `dsh web` TLS default; it is inert on plain-http lanes.
 * @param browser - Playwright browser owning the page.
 * @param height - Viewport height; width is fixed to the lane baseline.
 * @returns the initialized page.
 */
export async function newEnglishPage(browser: Browser, height = 1000): Promise<Page> {
  return await browser.newPage({ viewport: { width: 1680, height }, locale: 'en-US', ignoreHTTPSErrors: true })
}

/** Fail loud on a stale checkout instead of testing yesterday's bundle. */
export function requireDist(): void {
  if (!existsSync(DIST_INDEX)) {
    throw new Error('web app dist not built — run `pnpm run build` from the repository root (`pnpm run test:web` does this first)')
  }
}

/** OS-assigned free port, released before use (the spawned `dsh web` needs a concrete --port). */
export function probeFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => { reject(new Error('port probe returned no address')) })
        return
      }
      probe.close(() => { resolvePort(address.port) })
    })
  })
}

/** One probe response from {@link testHttpProbe}. */
export interface TestHttpResponse {
  /** HTTP status code. */
  status: number
  /** Location header (redirect probes). */
  location: string | undefined
  /** Response body text. */
  body: string
}

/**
 * Test-only HTTP probe that tolerates the fork's self-signed TLS: `dsh web`
 * defaults to auto self-signed HTTPS, which Node's native fetch rejects
 * (DEPTH_ZERO_SELF_SIGNED_CERT). Browser pages ride Playwright's
 * ignoreHTTPSErrors instead; this is for the Node-side assertions.
 * @param url - absolute http(s) URL of the spawned test host.
 * @param options - method/headers/body; defaults to a plain GET.
 * @returns status, redirect location, and body text.
 */
export function testHttpProbe(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<TestHttpResponse> {
  return new Promise((resolveProbe, reject) => {
    const target = new URL(url)
    const request = target.protocol === 'https:' ? httpsRequest : httpRequest
    const req = request(target, {
      method: options.method ?? 'GET',
      headers: options.headers,
      rejectUnauthorized: false,
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => { body += chunk })
      res.on('end', () => {
        resolveProbe({
          status: res.statusCode ?? 0,
          location: res.headers.location,
          body,
        })
      })
    })
    req.on('error', reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

/**
 * Drive the hero's workspace picker through the composed directory dialog
 * until the live composer unlocks. A fresh world has no Workspace, so the boot
 * lands in the Workspace-trigger view state (startup auto-selection has nothing to
 * select); every scenario that types into the composer must connect one
 * first. With nothing to list, activating the textarea raises the dialog directly —
 * adding a workspace is the picker's only entry. The directory is staged here
 * and adopted through the path editor, which is idempotent across the repeated
 * connects a scenario may make; creating a folder from inside the dialog (the
 * product's other half of the same route) is covered by
 * workspace-management.e2e.ts. The default name 'workspace' keeps the session
 * header cwd at <root>/workspace, the materialization proof several scenarios
 * assert.
 * @param page - the page under test.
 * @param root - host directory the workspace folder is staged in (the scaffold's `workspaceCwd`).
 * @param name - folder name staged and adopted as the workspace.
 */
export async function connectFreshWorkspace(page: Page, root: string, name = 'workspace'): Promise<void> {
  mkdirSync(join(root, name), { recursive: true })
  await page.getByRole('textbox', { name: 'Choose workspace' }).click()
  const dialog = page.getByRole('dialog', { name: 'Select Workspace Directory' })
  await dialog.waitFor({ timeout: 10_000 })
  await dialog.getByRole('button', { name: 'Edit path' }).click()
  const pathInput = dialog.getByRole('textbox', { name: 'Edit path' })
  await pathInput.fill(join(root, name))
  await pathInput.press('Enter')
  await dialog.getByRole('button', { name: 'Open', exact: true }).click()
  // The pick connected the workspace: the blank session's live composer
  // replaces the locked placeholder and enables.
  await page.locator('textarea:enabled[placeholder="Describe what you want to build"]')
    .waitFor({ timeout: 15_000 })
}

/**
 * {@link connectFreshWorkspace} over a page that advertises
 * {@link ZH_BROWSER_LOCALE}: the English helper's anchors assume the locale
 * most other scenarios boot, so a scenario that deliberately keeps zh needs
 * the localized picker copy.
 * @param page - the browser page under test.
 * @param root - workspace parent directory.
 * @param name - directory created under `root` and connected.
 */
export async function connectFreshWorkspaceZh(page: Page, root: string, name = 'workspace'): Promise<void> {
  mkdirSync(join(root, name), { recursive: true })
  await page.getByRole('textbox', { name: '选择工作区' }).click()
  const dialog = page.getByRole('dialog', { name: '选择工作区目录' })
  await dialog.waitFor({ timeout: 10_000 })
  await dialog.getByRole('button', { name: '编辑路径' }).click()
  const pathInput = dialog.getByRole('textbox', { name: '编辑路径' })
  await pathInput.fill(join(root, name))
  await pathInput.press('Enter')
  await dialog.getByRole('button', { name: '打开', exact: true }).click()
  await page.locator('textarea:enabled[placeholder="描述你想要构建的内容"]')
    .waitFor({ timeout: 15_000 })
}

/** Failure evidence goes to the gitignored .artifacts/ (repo convention). */
export async function saveFailureShot(page: Page, name: string): Promise<void> {
  const dir = fileURLToPath(new URL('../../../.artifacts', import.meta.url))
  mkdirSync(dir, { recursive: true })
  try {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true })
  } catch {
    // Best-effort evidence: a dead page/browser at failure time must not mask the real assertion error.
  }
}

/**
 * The conversation engine's Context key format, restated here rather than
 * imported: these specs live in the Host compiler aggregate, which must not
 * reach the Client plane. The engine's own copy is
 * `conversationContextKey` in dsh-client-runtime; a drift between them makes
 * the key miss its rendered node, so the assertion fails loudly.
 * @param kind - Definition kind.
 * @param id - Definition-local business identity.
 * @returns the engine-owned Context key.
 */
export function conversationContextKey(kind: string, id: string): string {
  return `${kind.length}:${kind}${id}`
}
