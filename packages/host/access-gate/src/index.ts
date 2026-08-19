/**
* dsh-host-access-gate — 访问门禁：登录鉴权插件（本地定制，不随上游分发）
*
* 除登录门闸外还内置「进程内 HTTPS 反向代理」（TLS 终结 + HTTP 转发 +
* WebSocket 隧道，见 proxy.ts）：取代旧版内置 caddy 二进制方案，无外部
* 二进制、无子进程、无 openssl 命令；证书为纯 JS 自签或用户上传的自有证书。
*
* 为 DSH Web GUI 提供「口令登录」门闸 + 口令管理：
*
* 一、门闸（注册到 dsh-host-webserver 的请求门闸钩子上，该钩子由本地
*     dsh-host-webserver fork 提供，profile 同名覆盖、升级免疫），在路由
*     分发之前统一拦截所有 HTTP 请求与 WebSocket 升级：
*       - 已登录（有效会话 Cookie）→ 放行，后续链路完全不变；
*       - 未登录：页面/静态资源 → 302 到 /login；/api/* → 401 JSON；
*         WebSocket 升级 → 拒绝（webserver 回 403）；
*       - 首次运行（尚未设置任何口令）→ 全部跳转到 /setup 首次设置页。
*
* 二、口令来源（按优先级）：
*       1. 插件 config.password（写死在 profile patch 中）；
*       2. settings 命名空间 access-gate.password（GUI「设置 → 插件」里修改，
*          或 /setup 首次设置页写入；存 $DSH_HOME/settings.yaml）；
*       3. 环境变量 DSH_ACCESS_GATE_PASSWORD（兼容旧名 DSH_WEB_PASSWORD）；
*       4. config.passwordFile 指向的文件内容（trim）。
*     GUI 里修改口令后旧会话立即失效（key 随口令轮换），需重新登录。
*
* 三、首次运行（监听 0.0.0.0 / mode:on 且上面 4 个来源都没有口令）：
*       进入「首次设置」模式：所有请求跳转到 /setup 页面，由用户自行
*       设置访问口令（不生成、不打印任何口令/密文），设置完成后进入
*       正常登录模式。若希望跳过该页，直接设置 DSH_ACCESS_GATE_PASSWORD 启动即可。
*
* 四、启用方式（config.mode，默认 auto）：
*       - auto：仅当 webserver 监听 0.0.0.0 时启用；
*       - on：无论监听地址一律启用；
*       - off：彻底关闭（回到无鉴权状态）。
*
* 五、对外服务：提供 webAuth 服务（isAuthenticated(request)），供
*     dsh-client-connection 的受保护方法围栏在「已登录」时放行 settings.*
*     （LAN 用户登录后可以在设置面板里改口令）。
*
* 会话 Cookie：dsh_session_<port> = v1.<expiresMs>.<nonce>.<hmac>，HMAC-SHA256
* 签名（密钥由口令派生），HttpOnly + SameSite=Strict，默认 7 天有效；cookie 名按
* 监听端口派生（dsh_session_3080 / dsh_session_3090 …），同 host 多实例互不覆盖。
* 登录接口带简单限速（按来源 IP）。
* @module dsh-host-access-gate
*/
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace, type SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRequestGate } from '@deepseek-ai/dsh-host-webserver'
import {
  checkPortOccupied,
  ensureSelfSignedCert,
  startReverseProxy,
  validateTlsMaterial,
  type ReverseProxyHandle,
  type TlsMaterial,
} from './proxy.ts'

/** Stable Cordis plugin name. */
export const name = 'access-gate'
/** Services required before the gate can be registered. */
export const inject = ['webServer']

/** The webserver schema's all-interfaces bind literal. */
const ALL_INTERFACES_HOST = '0.0.0.0'
/** Session cookie base name. */
const COOKIE_NAME = 'dsh_session'
/** Full cookie name for an instance, derived from the listening port so that
 *  multiple dsh instances on the same host (different ports) don't collide —
 *  browsers scope cookies by host, not by port. */
function cookieNameFor(port: number): string {
  return `${COOKIE_NAME}_${port}`
}
/** Signed token prefix (bump on format change). */
const TOKEN_PREFIX = 'v1.'
/** Login/logout/setup route paths. */
const LOGIN_PATH = '/login'
const LOGOUT_PATH = '/logout'
const SETUP_PATH = '/setup'
/** Public asset prefix: login/setup pages load the background without a session.
 * 注意：不带尾斜杠——fork 的 prefix 匹配是 `pathname.startsWith(prefix + "/")`。 */
const ASSET_PREFIX = '/access-gate'
/** Asset directory inside this plugin package (installed by install script). */
const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
/** Settings namespace holding the GUI-managed password. */
const SETTINGS_NS = settingsNamespace('access-gate')
/** Static salt for the HMAC key derivation. */
const KEY_SALT = 'dsh-access-gate-key'
/** Cap on login/setup request bodies. */
const MAX_BODY_BYTES = 16 * 1024
/** Minimum length the setup page / settings card enforce for a new password. */
const MIN_PASSWORD_LENGTH = 6
/** webAuth service name the privileged-method fence consults. */
const WEB_AUTH_SERVICE = 'webAuth'

export interface AccessGateConfig {
  password: string
  passwordFile: string
  mode: 'auto' | 'on' | 'off'
  sessionTtlSeconds: number
  lockoutMaxAttempts: number
  lockoutWindowMs: number
}

export const Config: z<AccessGateConfig> = z.object({
  password: z.string(),
  passwordFile: z.string(),
  mode: z.union([z.const('auto'), z.const('on'), z.const('off')]).default('auto'),
  sessionTtlSeconds: z.natural().min(60).default(7 * 24 * 3600),
  lockoutMaxAttempts: z.natural().min(1).default(10),
  lockoutWindowMs: z.natural().min(1000).default(10 * 60 * 1000),
})
/** Resolve the non-settings password sources, or undefined when none. */
function resolveFallbackPassword(config: AccessGateConfig): string | undefined {
  if (typeof config.password === 'string' && config.password.length > 0) return config.password
  const fromEnv = process.env.DSH_ACCESS_GATE_PASSWORD ?? process.env.DSH_WEB_PASSWORD
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  if (typeof config.passwordFile === 'string' && config.passwordFile.length > 0) {
    return readFileSync(config.passwordFile, 'utf8').trim()
  }
  return void 0
}
/** Derive the HMAC key from the password (change password → all sessions die). */
function deriveKey(password: string): string {
  return createHmac('sha256', KEY_SALT).update(password).digest('hex')
}
/** Sign one session token valid until `expiresMs`. */
function signToken(key: string, expiresMs: number): string {
  const nonce = randomBytes(18).toString('base64url')
  const payload = `${TOKEN_PREFIX}${String(expiresMs)}.${nonce}`
  const sig = createHmac('sha256', key).update(payload).digest('hex')
  return `${payload}.${sig}`
}
/** Verify a session token: format, HMAC (constant-time), and expiry. */
function verifyToken(token: string, key: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') return false
  const [, expiresText, nonce, sig] = parts
  const expires = Number(expiresText)
  if (!Number.isFinite(expires) || expires <= Date.now()) return false
  const payload = `${TOKEN_PREFIX}${expiresText}.${nonce}`
  const expected = createHmac('sha256', key).update(payload).digest('hex')
  if (sig === undefined || sig.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'))
}
/** Whether a cookie header value carries a valid session token. */
function sessionFromCookie(cookieHeader: string | undefined, key: string, cookieName: string): boolean {
  if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) return false
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== cookieName) continue
    if (verifyToken(part.slice(eq + 1).trim(), key)) return true
  }
  return false
}
/** node:http request → valid session? */
function sessionFromRequest(req: IncomingMessage, key: string, cookieName: string): boolean {
  return sessionFromCookie(typeof req.headers.cookie === 'string' ? req.headers.cookie : '', key, cookieName)
}
/** Constant-time-ish string comparison (hash-then-compare). */
function safeEqual(a: unknown, b: unknown): boolean {
  const ha = createHmac('sha256', 'dsh-access-gate-compare').update(String(a)).digest()
  const hb = createHmac('sha256', 'dsh-access-gate-compare').update(String(b)).digest()
  return timingSafeEqual(ha, hb)
}
/** Sanitize a redirect target: only simple absolute paths survive. */
function sanitizeNext(raw: unknown): string {
  if (typeof raw !== 'string') return '/'
  const match = /^(\/[A-Za-z0-9._~\-/]*)(\?.*)?$/.exec(raw)
  if (match === null || match[1] === undefined || match[1].startsWith('//')) return '/'
  return match[1]
}
/** Escape one attribute value inside an inline page. */
function escapeHtml(value: unknown): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
/** Read a small request body with a hard cap. */
async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks = []
  let received = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    received += chunk.length
    if (received > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
/** Client address for rate limiting: first X-Forwarded-For entry when proxied, else the socket address. */
function clientAddress(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]
    if (first !== undefined) return first.trim()
  }
  return req.socket.remoteAddress ?? 'unknown'
}
/** Per-source-address failed-attempt limiter. */
interface RateLimiter {
  blocked(address: string): boolean
  fail(address: string): void
  clear(address: string): void
}
function createRateLimiter(maxAttempts: number, windowMs: number): RateLimiter {
  const failures = new Map<string, { count: number; firstAt: number }>()
  return {
    blocked(address) {
      const rec = failures.get(address)
      return rec !== void 0 && rec.count >= maxAttempts && Date.now() - rec.firstAt < windowMs
    },
    fail(address) {
      const now = Date.now()
      const rec = failures.get(address)
      if (rec === void 0 || now - rec.firstAt >= windowMs) failures.set(address, { count: 1, firstAt: now })
      else rec.count += 1
    },
    clear(address) {
      failures.delete(address)
    },
  }
}
/** Shared page head/style used by the login and setup pages (blue liquid glass). */
const PAGE_STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden;
         background: #0b1220 url('/access-gate/bg.webp') center/cover no-repeat fixed;
         color: #eef2fa;
         font-family: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
  /* 液态玻璃氛围：深蓝渐变叠加 + 流动光斑 */
  body::before { content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background:
      radial-gradient(1200px 620px at 12% 8%, rgba(47,107,255,.38), transparent 62%),
      radial-gradient(920px 520px at 88% 88%, rgba(34,211,238,.30), transparent 62%),
      linear-gradient(180deg, rgba(6,10,20,.45), rgba(6,10,20,.72)); }
  .blob { position: fixed; border-radius: 50%; filter: blur(72px); opacity: .5; z-index: 0; pointer-events: none;
          animation: drift 19s ease-in-out infinite alternate; }
  .blob.b1 { width: 430px; height: 430px; left: -90px; top: -70px;
             background: radial-gradient(circle, rgba(47,107,255,.6), transparent 70%); }
  .blob.b2 { width: 370px; height: 370px; right: -70px; bottom: -90px;
             background: radial-gradient(circle, rgba(34,211,238,.55), transparent 70%); animation-delay: -7s; }
  .blob.b3 { width: 260px; height: 260px; left: 56%; top: 28%;
             background: radial-gradient(circle, rgba(129,140,248,.45), transparent 70%); animation-delay: -13s; }
  @keyframes drift { from { transform: translate3d(0,0,0) scale(1); }
                     to { transform: translate3d(64px,-44px,0) scale(1.16); } }
  .card { position: relative; z-index: 1; width: min(92vw, 424px);
          background: rgba(255,255,255,.075);
          border: 1px solid rgba(255,255,255,.24);
          border-radius: 22px; padding: 36px 32px 26px;
          backdrop-filter: blur(24px) saturate(150%); -webkit-backdrop-filter: blur(24px) saturate(150%);
          box-shadow: 0 26px 80px rgba(2,8,23,.6), inset 0 1px 0 rgba(255,255,255,.28), inset 0 -1px 0 rgba(255,255,255,.06); }
  .logo { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .logo-mark { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
               color: #fff; font-weight: 800; font-size: 15px; letter-spacing: .5px;
               background: linear-gradient(135deg, #3b6dff, #22d3ee);
               box-shadow: 0 8px 22px rgba(59,109,255,.5), inset 0 1px 0 rgba(255,255,255,.35); }
  h1 { font-size: 20px; margin: 0; color: #f4f7fd; letter-spacing: .2px; text-shadow: 0 2px 10px rgba(0,0,0,.35); }
  .sub { color: #b3bfd6; font-size: 13px; margin: 10px 0 22px; line-height: 1.7; }
  label { display: block; font-size: 13px; color: #bcc6dc; margin: 16px 0 8px; }
  input { width: 100%; padding: 12px 14px; border-radius: 13px; border: 1px solid rgba(255,255,255,.20);
          background: rgba(9,14,28,.5); color: #eef2fa; font-size: 15px; outline: none;
          transition: border-color .15s, box-shadow .15s; }
  input:focus { border-color: rgba(79,124,255,.95); box-shadow: 0 0 0 3px rgba(79,124,255,.24); }
  button { width: 100%; margin-top: 22px; padding: 12px; border: 0; border-radius: 13px; cursor: pointer;
           color: #fff; font-size: 15px; font-weight: 600; letter-spacing: 4px;
           background: linear-gradient(135deg, #2f6bff, #38bdf8);
           box-shadow: 0 12px 30px rgba(47,107,255,.45), inset 0 1px 0 rgba(255,255,255,.3);
           transition: filter .15s, transform .05s; }
  button:hover { filter: brightness(1.12); }
  button:active { transform: translateY(1px); }
  .error { display: none; margin-top: 16px; padding: 10px 12px; border-radius: 11px;
           background: rgba(255,80,80,.16); border: 1px solid rgba(255,80,80,.42); color: #ffb8b8; font-size: 13px; line-height: 1.5; }
  .foot { margin-top: 26px; text-align: center; color: rgba(212,222,242,.55); font-size: 12px; text-shadow: 0 1px 6px rgba(0,0,0,.4); }
`
/** Login page (normal mode), blue liquid glass. */
const LOGIN_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeepSeek Harness · 登录</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="blob b1"></div>
  <div class="blob b2"></div>
  <div class="blob b3"></div>
  <div class="card">
    <div class="logo"><div class="logo-mark">DSH</div><h1>DeepSeek Harness</h1></div>
    <p class="sub">该服务需要登录后才能使用</p>
    <form method="post" action="/login" autocomplete="off">
      <label for="password">访问口令</label>
      <input id="password" name="password" type="password" placeholder="请输入访问口令" required autofocus>
      <button type="submit">登 录</button>
    </form>
    <div class="error" id="error"></div>
    <div class="foot">DeepSeek Harness Web GUI · 访问门禁</div>
  </div>
  <script>
    var q = new URLSearchParams(location.search);
    if (q.get("error")) {
      var e = document.getElementById("error");
      e.style.display = "block";
      e.textContent = q.get("error") === "locked" ? "尝试次数过多，请稍后再试" : "口令错误，请重试";
    }
    document.getElementById("password").focus();
  <\/script>
</body>
</html>
`
/** First-run setup page (no password configured anywhere yet), blue liquid glass. */
const SETUP_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeepSeek Harness · 首次设置</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="blob b1"></div>
  <div class="blob b2"></div>
  <div class="blob b3"></div>
  <div class="card">
    <div class="logo"><div class="logo-mark">DSH</div><h1>首次设置访问口令</h1></div>
    <p class="sub">尚未设置访问口令，请先设置一个（至少 ${MIN_PASSWORD_LENGTH} 位）。
    设置完成后将跳转到登录页。</p>
    <form method="post" action="/setup" autocomplete="off">
      <label for="password">新访问口令（至少 ${MIN_PASSWORD_LENGTH} 位）</label>
      <input id="password" name="password" type="password" required autofocus>
      <label for="confirm">确认新访问口令</label>
      <input id="confirm" name="confirm" type="password" required>
      <button type="submit">设置口令</button>
    </form>
    <div class="error" id="error"></div>
    <div class="foot">DeepSeek Harness Web GUI · 首次设置</div>
  </div>
  <script>
    var q = new URLSearchParams(location.search);
    if (q.get("error")) {
      var e = document.getElementById("error");
      e.style.display = "block";
      e.textContent = q.get("error") === "locked" ? "尝试次数过多，请稍后再试"
        : q.get("error") === "short" ? "口令至少需要 " + ${MIN_PASSWORD_LENGTH} + " 位"
        : q.get("error") === "mismatch" ? "两次输入的口令不一致" : "设置失败，请重试";
    }
    document.getElementById("password").focus();
  <\/script>
</body>
</html>
`
/** Render the login page with an optional hidden `next` target. */
function renderLoginPage(next: string): string {
  if (next === '/') return LOGIN_PAGE
  return LOGIN_PAGE.replace('</form>', `<input type="hidden" name="next" value="${escapeHtml(next)}"></form>`)
}
/** Serve one whitelisted asset from the plugin's assets directory. */
function makeAssetHandler(root: string): (req: IncomingMessage, res: ServerResponse) => void {
  const TYPES: Record<string, string> = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
  }
  return (req: IncomingMessage, res: ServerResponse): void => {
    try {
      const url = new URL(req.url ?? '/', 'http://x')
      const name = decodeURIComponent(url.pathname.slice(ASSET_PREFIX.length).replace(/^\/+/, ''))
      if (!/^[A-Za-z0-9._-]+$/.test(name)) {
        res.writeHead(404)
        res.end()
        return
      }
      const file = join(root, name)
      if (!file.startsWith(root) || !existsSync(file)) {
        res.writeHead(404)
        res.end()
        return
      }
      const ext = extname(name).toLowerCase()
      res.writeHead(200, {
        'content-type': TYPES[ext] ?? 'application/octet-stream',
        'cache-control': 'public, max-age=3600',
      })
      res.end(readFileSync(file))
    } catch (error) {
      console.error('[dsh-host-access-gate] asset error:', error instanceof Error ? error.stack : String(error))
      res.writeHead(500)
      res.end()
    }
  }
}
/** /login route: GET serves the page, POST validates the password (reads current state). */
function makeLoginHandler(
  state: AuthState,
  ttl: number,
  limiter: RateLimiter,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const password = state.password
    const key = state.key
    if (password === void 0 || key === void 0) {
      res.writeHead(302, { location: SETUP_PATH, 'cache-control': 'no-store' })
      res.end()
      return
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (sessionFromRequest(req, key, state.cookieName)) {
        res.writeHead(302, { location: '/' })
        res.end()
        return
      }
      const url = new URL(req.url ?? '/', 'http://x')
      const next = sanitizeNext(url.searchParams.get('next') ?? '/')
      const body = renderLoginPage(next)
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
      })
      res.end(req.method === 'HEAD' ? void 0 : body)
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const address = clientAddress(req)
    if (limiter.blocked(address)) {
      res.writeHead(302, { location: `${LOGIN_PATH}?error=locked`, 'cache-control': 'no-store' })
      res.end()
      return
    }
    let sentPassword = ''
    let next = '/'
    try {
      const body = await readBody(req)
      const contentType = (req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
      if (contentType === 'application/json') {
        const json = JSON.parse(body.toString('utf8')) as { password?: unknown; confirm?: unknown; next?: unknown }
        if (typeof json.password === 'string') sentPassword = json.password
        next = sanitizeNext(typeof json.next === 'string' ? json.next : '/')
      } else {
        const params = new URLSearchParams(body.toString('utf8'))
        sentPassword = params.get('password') ?? ''
        next = sanitizeNext(params.get('next') ?? '/')
      }
    } catch {
      sentPassword = ''
    }
    if (!safeEqual(sentPassword, password)) {
      limiter.fail(address)
      res.writeHead(302, { location: `${LOGIN_PATH}?error=wrong`, 'cache-control': 'no-store' })
      res.end()
      return
    }
    limiter.clear(address)
    const token = signToken(key, Date.now() + ttl * 1000)
    res.writeHead(302, {
      location: next,
      'set-cookie': `${state.cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${String(ttl)}`,
      'cache-control': 'no-store',
    })
    res.end()
  }
}
/** /logout route: POST clears the session cookie. */
async function handleLogout(req: IncomingMessage, res: ServerResponse, cookieName: string): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405)
    res.end()
    return
  }
  try {
    await readBody(req)
  } catch {
    /* drain or drop; the response below is what matters */
  }
  res.writeHead(302, {
    location: LOGIN_PATH,
    'set-cookie': `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    'cache-control': 'no-store',
  })
  res.end()
}
/**
* /setup route: first-run password setup. GET serves the page; POST writes
* the new password into settings (no secret handshake — the operator sets
* their own key here).
* @param state - mutable auth state; `settings` is the settings provider.
*/
function makeSetupHandler(state: AuthState, limiter: RateLimiter): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (state.password !== void 0) {
        res.writeHead(302, { location: LOGIN_PATH })
        res.end()
        return
      }
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
      })
      res.end(req.method === 'HEAD' ? void 0 : SETUP_PAGE)
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const address = clientAddress(req)
    if (limiter.blocked(address)) {
      res.writeHead(302, { location: `${SETUP_PATH}?error=locked`, 'cache-control': 'no-store' })
      res.end()
      return
    }
    let password = ''
    let confirm = ''
    try {
      const body = await readBody(req)
      const contentType = (req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
      if (contentType === 'application/json') {
        const json = JSON.parse(body.toString('utf8')) as { password?: unknown; confirm?: unknown; next?: unknown }
        password = typeof json.password === 'string' ? json.password : ''
        confirm = typeof json.confirm === 'string' ? json.confirm : ''
      } else {
        const params = new URLSearchParams(body.toString('utf8'))
        password = params.get('password') ?? ''
        confirm = params.get('confirm') ?? ''
      }
    } catch {
      password = ''
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      res.writeHead(302, { location: `${SETUP_PATH}?error=short`, 'cache-control': 'no-store' })
      res.end()
      return
    }
    if (password !== confirm) {
      res.writeHead(302, { location: `${SETUP_PATH}?error=mismatch`, 'cache-control': 'no-store' })
      res.end()
      return
    }
    if (state.settings === void 0) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('settings service unavailable')
      return
    }
    // 写入 settings.access-gate.password → onChange 轮换 key 并退出首次设置模式
    await state.settings.update(SETTINGS_NS, { password })
    limiter.clear(address)
    res.writeHead(302, { location: LOGIN_PATH, 'cache-control': 'no-store' })
    res.end()
  }
}
/** POST /access-gate/restart —— 设置卡「重启」按钮：先回响应，再退出 dsh。
 * 直接 kill 进程（不做脚本式重启），由机器各自的 supervisor（systemd/docker/PM2）
 * 按配置拉起 dsh；反代是进程内的 https server，随 dsh 进程退出，重启后自动恢复。 */
const RESTART_PATH = '/access-gate/restart'
/** POST /access-gate/check-port —— 设置卡保存前检测 HTTPS 端口是否被占用（排除本实例反代自身）。 */
const CHECK_PORT_PATH = '/access-gate/check-port'

/** 端口是否被占用：排除本实例反代自己绑定的端口（其余一律视为占用）。 */
async function checkPortInUse(port: number, ownProxyPort: number | undefined): Promise<boolean> {
  if (ownProxyPort !== undefined && port === ownProxyPort) return false
  return checkPortOccupied(port)
}

function makeCheckPortHandler(state: AuthState): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, body: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST') {
      send(405, { ok: false, error: { code: 'method', message: 'POST only' } })
      return
    }
    if (state.password === void 0 || state.key === void 0 || !sessionFromRequest(req, state.key, state.cookieName)) {
      send(401, { ok: false, error: { code: 'unauthorized', message: 'login required' } })
      return
    }
    let port
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8')) as { port?: unknown }
      port = Number(body.port)
    } catch {
      send(400, { ok: false, error: { code: 'bad-request', message: 'port required' } })
      return
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      send(400, { ok: false, error: { code: 'bad-request', message: 'port must be 1-65535' } })
      return
    }
    // 与当前配置端口相同 → 可能是本实例反代自己绑定（不算占用）；改到新端口才严格检测
    const current = state.readSettings === undefined ? undefined : state.readSettings().httpsPort
    const ownPort = Number.isInteger(Number(current)) && Number(current) > 0 ? Number(current) : undefined
    const inUse = await checkPortInUse(port, ownPort)
    send(200, { ok: true, port, inUse })
  }
}

function makeRestartHandler(state: AuthState): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    if (state.password === void 0 || state.key === void 0 || !sessionFromRequest(req, state.key, state.cookieName)) {
      res.writeHead(401, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: false, error: { code: 'unauthorized', message: 'login required' } }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ok: true, message: "restart requested: this instance's dsh web exits; supervisor brings dsh back up" }))
    setTimeout(() => {
      // 反代是进程内的 https server，随 dsh 进程退出而消亡，无需单独停止
      setTimeout(() => process.exit(0), 250)
    }, 300)
  }
}

// ---- 反向代理自动运行（进程内 HTTPS 反代，无外部二进制 / 无子进程）----
// 每个 dsh 实例在自己的进程里起一个 https server（TLS 终结 + HTTP 转发 +
// WebSocket 隧道，见 proxy.ts），随 dsh 进程生灭：天然多实例隔离、无需 pid
// 文件、无需 spawn/kill、无需 openssl。设置变化（开关/参数/证书）保存后
// 自动热生效，无需重启。

/** 本实例反代目录（$DSH_HOME/caddy，沿用旧名以复用既有证书文件）。 */
function proxyDir(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'caddy')
}

/** 反代管理器：依据当前设置幂等确保/热重配/关闭进程内 https server。 */
interface ProxyManager {
  /** 依据当前设置确保反代在跑（或关掉）；重复调用无副作用。 */
  ensure(): void
  /** 关闭当前反代（插件卸载 / 设置关闭时）。 */
  stop(): Promise<void>
}

function createReverseProxyManager(ctx: Context, state: AuthState): ProxyManager {
  let handle: ReverseProxyHandle | undefined
  let current: { lanHost: string; httpsPort: number; targetPort: number } | undefined
  // 串行化重建动作：证书生成是异步的，避免并发起多个 server。
  let chain: Promise<void> = Promise.resolve()

  const stop = (): Promise<void> => {
    chain = chain.then(async () => {
      if (handle !== undefined) {
        const closing = handle
        handle = undefined
        current = undefined
        await closing.close()
      }
    })
    return chain
  }

  return {
    ensure() {
      try {
        const s = state.readSettings?.() ?? {}
        const lanHost = typeof s.lanHost === 'string' ? s.lanHost.trim() : ''
        const httpsPort = Number(s.httpsPort)
        const targetPort = Number(process.env.DSH_WEB_PORT ?? '') || ctx.webServer.port || 3080
        const enabled = s.proxyEnabled === true
        const configured = enabled && lanHost.length > 0 && Number.isInteger(httpsPort) && httpsPort > 0 && httpsPort < 65536
        if (!configured) {
          if (handle !== undefined) {
            console.log(`[dsh-host-access-gate] 反向代理已关闭（proxyEnabled=${enabled}，未配置反代参数）`)
            void stop()
          }
          return // 开关未开 / 未配置反代（默认不开启）
        }
        if (!/^[A-Za-z0-9._*-]+$/.test(lanHost)) {
          console.error(`[dsh-host-access-gate] lanHost 不合法（${lanHost}），反向代理未启动`)
          if (handle !== undefined) void stop()
          return
        }
        // 参数未变化 → 不动；变化（含证书/端口）→ 重建 https server（热生效）
        const same = current !== undefined
          && current.lanHost === lanHost && current.httpsPort === httpsPort && current.targetPort === targetPort
        if (same && handle !== undefined) return
        chain = chain.then(async () => {
          let tls: TlsMaterial
          if (s.certMode === 'custom' && typeof s.customCert === 'string' && s.customCert.length > 0
            && typeof s.customKey === 'string' && s.customKey.length > 0) {
            const check = validateTlsMaterial(s.customCert, s.customKey, lanHost)
            if (!check.ok) {
              console.error(`[dsh-host-access-gate] 自定义证书无效，反向代理未启动：${check.error}`)
              if (handle !== undefined) {
                const closing = handle
                handle = undefined
                current = undefined
                await closing.close()
              }
              return
            }
            tls = { cert: s.customCert, key: s.customKey }
          } else {
            tls = ensureSelfSignedCert(join(proxyDir(), 'certs'), lanHost)
          }
          if (handle !== undefined) {
            const closing = handle
            handle = undefined
            current = undefined
            await closing.close()
          }
          handle = startReverseProxy({ lanHost, httpsPort, targetPort, tls })
          current = { lanHost, httpsPort, targetPort }
          console.log(`[dsh-host-access-gate] 反向代理已就绪：https://${lanHost}:${httpsPort} → 127.0.0.1:${targetPort}${s.certMode === 'custom' ? '（自定义证书）' : ''}`)
        })
      } catch (error) {
        console.error('[dsh-host-access-gate] 反向代理自动启动失败（不影响 DSH 本体）:', error instanceof Error ? error.message : String(error))
      }
    },
    stop,
  }
}
/**
* Mount the auth gate, routes, settings namespace, and webAuth service.
* @param ctx - plugin context carrying the webServer service.
* @param config - validated {@link Config}.
*/
interface AuthState {
  password: string | undefined
  key: string | undefined
  settings: SettingsProvider | undefined
  readSettings: (() => AccessGateSettings) | undefined
  announcedSetup: boolean
  cookieName: string
}

interface AccessGateSettings {
  password?: string | null
  proxyEnabled?: boolean | null
  lanHost?: string | null
  httpsPort?: string | number | null
  certMode?: 'auto' | 'custom' | null
  customCert?: string | null
  customKey?: string | null
}

/** Resolve the effective gate mode: an explicit env override wins over the composed config. */
function resolveGateMode(configured: AccessGateConfig['mode']): AccessGateConfig['mode'] {
  const fromEnv = process.env.DSH_ACCESS_GATE_MODE
  if (fromEnv === 'auto' || fromEnv === 'on' || fromEnv === 'off') return fromEnv
  return configured
}

export function apply(ctx: Context, config: AccessGateConfig): void {
  const fallbackPassword = resolveFallbackPassword(config)
  const mode = resolveGateMode(config.mode)
  const enabled = mode === 'on' ? true : mode === 'off' ? false : ctx.webServer.host === ALL_INTERFACES_HOST
  if (!enabled) return

  const ttl = config.sessionTtlSeconds
  const limiter = createRateLimiter(config.lockoutMaxAttempts, config.lockoutWindowMs)
  // 会话 cookie 名按监听端口派生：同 host 多实例（正式 3080 / 测试 3090）的 cookie
  // 不会互相覆盖（浏览器 cookie 按 host 隔离、不按端口隔离，故必须用端口区分名字）。
  // 用 config.port（真实部署恒为 3080/3090 非零；测试用 0 → cookie 名 dsh_session_0）。
  const port = ctx.webServer.port
  const cookieName = cookieNameFor(port)
  /** Mutable auth state read by the gate/routes at request time. */
  const state: AuthState = {
    password: fallbackPassword,
    key: fallbackPassword === void 0 ? void 0 : deriveKey(fallbackPassword),
    settings: void 0,
    readSettings: void 0,
    announcedSetup: false,
    cookieName,
  }

  // settings 命名空间：GUI 设置面板（access-gate 卡片）与 /setup 页写口令的落点。
  // onChange 在每个写之后重算口令并轮换 key；清除口令且无任何后备口令时，
  // 回到「首次设置」模式（/setup 页），绝不出现无鉴权裸奔。
  // 反向代理参数（lanHost/httpsPort）默认空 = 未启用；填写后自动确保进程内
  // HTTPS 反代运行，保存即生效（无需重启、无需手动跑脚本）。
  const proxyManager = createReverseProxyManager(ctx, state)
  // 保存反代参数/证书时，去抖 300ms 后热重配（避免一次保存多次 set 触发多轮重建）。
  let proxyEnsureTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleProxyEnsure = (): void => {
    if (proxyEnsureTimer !== undefined) clearTimeout(proxyEnsureTimer)
    proxyEnsureTimer = setTimeout(() => { proxyManager.ensure() }, 300)
  }
  ctx.effect(() => () => {
    if (proxyEnsureTimer !== undefined) clearTimeout(proxyEnsureTimer)
    void proxyManager.stop()
  }, 'access-gate: reverse proxy')
  installSettingsSection(ctx, SETTINGS_NS, z.object({
    password: z.string().role('secret'),
    // 反代独立开关：proxyEnabled=false（默认）不启用反代；true 且 lanHost/httpsPort
    // 非空才启动进程内反代。避免旧版「预填默认参数即视为启用」的误开。
    proxyEnabled: z.boolean().default(false),
    lanHost: z.string().default(''),
    httpsPort: z.union([z.const(''), z.natural().min(1).max(65535)]).default(''),
    // 证书方式：auto = 纯 JS 自签；custom = 使用用户上传的自有证书（PEM）。
    certMode: z.union([z.const('auto'), z.const('custom')]).default('auto'),
    customCert: z.string().role('secret').default(''),
    customKey: z.string().role('secret').default(''),
  }), {
    password: fallbackPassword ?? '',
    proxyEnabled: false,
    lanHost: '',
    httpsPort: '',
    certMode: 'auto',
    customCert: '',
    customKey: '',
  }, {
    setSource: (get: () => AccessGateSettings) => {
      state.readSettings = get
    },
    onChange: () => {
      const stored = state.readSettings === undefined ? undefined : state.readSettings().password
      const password = typeof stored === 'string' && stored.length > 0 ? stored : fallbackPassword
      state.password = password
      state.key = password === void 0 ? void 0 : deriveKey(password)
      if (password === void 0) announceSetup()
      else state.announcedSetup = false
      scheduleProxyEnsure() // 反代开关/参数/证书变更 → 热生效
    },
  })

  // 首次运行（0.0.0.0 且无任何口令来源）→ 提示去 /setup 设置口令
  const announceSetup = () => {
    if (state.password !== void 0 || state.announcedSetup) return
    state.announcedSetup = true
    console.log('')
    console.log('──────────────────────────────────────────────────────────────')
    console.log(' [dsh-host-access-gate] 首次运行：尚未设置访问口令。')
    console.log(' [dsh-host-access-gate]   请打开本机 Web 界面并访问 /setup 页面，')
    console.log(' [dsh-host-access-gate]   设置你自己的访问口令（至少 ' + String(MIN_PASSWORD_LENGTH) + ' 位）。')
    console.log(' [dsh-host-access-gate]   （也可设置环境变量 DSH_ACCESS_GATE_PASSWORD=<口令> 后重启，跳过此页。）')
    console.log('──────────────────────────────────────────────────────────────')
    console.log('')
  }

  // webAuth 服务：供 client-connection 的受保护方法围栏判断「已登录」。
  ctx.provide(WEB_AUTH_SERVICE, {
    isAuthenticated: (request: Request) => {
      const cookie = request.headers.get('cookie') ?? ''
      return state.key !== void 0 && sessionFromCookie(cookie, state.key, state.cookieName)
    },
  })


  // 门闸
  const gate: WebRequestGate = (req, res, pathname) => {
    if (pathname.startsWith(ASSET_PREFIX)) return true // 公共资源（登录页背景等），无需会话
    if (pathname === SETUP_PATH) return true
    if (pathname === LOGIN_PATH || pathname === LOGOUT_PATH) {
      if (state.password === void 0) return res !== null ? redirectTo(res, SETUP_PATH) : false
      return true
    }
    if (state.password === void 0) {
      // 首次设置模式：一律去 /setup
      if (res === null) return false
      if (pathname === '/api' || pathname.startsWith('/api/')) return unauthorized(res)
      return redirectTo(res, SETUP_PATH)
    }
    if (state.key !== undefined && sessionFromRequest(req, state.key, state.cookieName)) return true
    if (res === null) return false
    if (pathname === '/api' || pathname.startsWith('/api/')) return unauthorized(res)
    const target = sanitizeNext(pathname)
    res.writeHead(302, { location: `${LOGIN_PATH}?next=${encodeURIComponent(target)}`, 'cache-control': 'no-store' })
    res.end()
    return false
  }

  ctx.effect(() => ctx.webServer.registerGate(gate), 'access-gate: gate')
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ASSET_PREFIX,
    handler: makeAssetHandler(ASSET_DIR),
  }), 'access-gate: assets route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: LOGIN_PATH,
    handler: makeLoginHandler(state, ttl, limiter),
  }), 'access-gate: /login route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: LOGOUT_PATH,
    handler: (req: IncomingMessage, res: ServerResponse) => handleLogout(req, res, state.cookieName),
  }), 'access-gate: /logout route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SETUP_PATH,
    handler: makeSetupHandler(state, limiter),
  }), 'access-gate: /setup route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: RESTART_PATH,
    handler: makeRestartHandler(state),
  }), 'access-gate: /access-gate/restart route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: CHECK_PORT_PATH,
    handler: makeCheckPortHandler(state),
  }), 'access-gate: /access-gate/check-port route')

  // settings 提供方就绪后挂上引用（供 /setup 写入）；同时延迟启动反向代理
  // ensure（等 webServer.port 与 settings 命名空间就绪），配置过反代参数即
  // 自动确保进程内反代运行——启动命令保持不变（npx @deepseek-ai/dsh web）。
  ctx.inject(['settings'], (sctx) => {
    state.settings = sctx.settings
    sctx.effect(() => () => {
      state.settings = void 0
    })
    setTimeout(() => {
      proxyManager.ensure()
    }, 1200)
  })
}

/** 302 redirect helper shared by the gate. */
function redirectTo(res: ServerResponse, location: string): false {
  res.writeHead(302, { location, 'cache-control': 'no-store' })
  res.end()
  return false
}
/** 401 JSON helper shared by the gate. */
function unauthorized(res: ServerResponse): false {
  res.writeHead(401, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ ok: false, error: { code: 'unauthorized', message: 'login required' } }))
  return false
}
