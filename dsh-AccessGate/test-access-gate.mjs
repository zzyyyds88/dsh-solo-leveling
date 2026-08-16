#!/usr/bin/env node
/**
 * test-access-gate.mjs — 独立集成测试（不启动 dsh，不碰真实会话）
 *
 * 用真实代码做黑盒验证：
 *   - 导入安装包/测试环境里的 dsh-host-webserver（需含「请求门闸」registerGate，
 *     来自本项目 packages/ 的 fork 或旧的安装包补丁）；
 *   - 导入 profile node_modules 里的 dsh-host-access-gate 插件（真实副本）；
 *   - 场景 A（普通鉴权）：挂载 webserver(127.0.0.1:0) + auth(mode:on, 显式口令)，
 *     跑登录/401/302/WebSocket 全流程；
 *   - 场景 B（首次设置）：额外挂载真实 dsh-settings-file（临时 YAML），
 *     auth(mode:on, 无口令) → 进入首次设置模式：全部跳 /setup、短口令被拒、
 *     设置口令后写入 settings.yaml（access-gate 命名空间）、用新口令登录成功。
 *
 * 用法：node test-access-gate.mjs
 * 退出码：0 = 全部通过；1 = 有失败项。
 */
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import os from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";

const FAIL = [];
const PASS = [];

function check(label, ok, detail = "") {
  if (ok) PASS.push(label);
  else FAIL.push(`${label}${detail ? ` —— ${detail}` : ""}`);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? `（${detail}）` : ""}`);
}

const DSH_ROOT = process.env.DSH_ROOT ?? "/usr/lib/node_modules/@deepseek-ai/dsh";
const WEBSERVER_PATH = join(DSH_ROOT, "node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js");
const SETTINGS_FILE_PATH = join(DSH_ROOT, "node_modules/@deepseek-ai/dsh-settings-file/lib/index.js");
const profileDir = process.env.DSH_PROFILE ?? join(process.env.DSH_HOME ?? join(os.homedir(), ".dsh"), "profiles/web");
const AUTH_PLUGIN_PATH = join(profileDir, "node_modules/dsh-host-access-gate/lib/index.js");

const TEST_PASSWORD = "test-pass-123";

const { Context } = await import(pathToFileURL(join(DSH_ROOT, "node_modules/@deepseek-ai/cordis/lib/index.js")));
const { default: WebServer } = await import(pathToFileURL(WEBSERVER_PATH));
const { default: SettingsFile } = await import(pathToFileURL(SETTINGS_FILE_PATH));
const { Config: AuthConfig, apply: authApply, inject: authInject, name: authName } = await import(pathToFileURL(AUTH_PLUGIN_PATH));
const auth = { name: authName, inject: authInject, Config: AuthConfig, apply: authApply };

const require = createRequire(join(DSH_ROOT, "package.json"));
const { WebSocket: WsClient, WebSocketServer } = require("ws");

/** Boot one isolated test server: webserver + optional settings + auth. */
async function bootServer({ password, mountSettings = false, settingsPath }) {
  const ctx = new Context();
  if (mountSettings) {
    const f = ctx.plugin(SettingsFile, { path: settingsPath });
    await f;
  }
  const webFiber = ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  await webFiber;
  for (let i = 0; i < 50 && ctx.webServer?.port === void 0; i++) await new Promise((r) => setTimeout(r, 50));
  const port = ctx.webServer?.port;
  if (port === void 0) throw new Error("webserver 未监听（port 未解析）");
  const authConfig = { mode: "on" };
  if (password !== void 0) authConfig.password = password;
  const authFiber = ctx.plugin(auth, authConfig);
  await authFiber;
  return { ctx, port, authFiber, webFiber };
}

// ---------------------------------------------------------------- 场景 A：普通鉴权
console.log("== 场景 A：普通鉴权（显式口令）==");
{
  const { ctx, port } = await bootServer({ password: TEST_PASSWORD });
  const base = `http://127.0.0.1:${port}`;
  console.log(`测试服务已监听：${base}`);
  ctx.webServer.registerFallback(async (req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<html><body>SPA-INDEX</body></html>");
  });
  ctx.webServer.register({
    kind: "prefix",
    path: "/api",
    handler: async (req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: new URL(req.url ?? "/", "http://x").pathname }));
    },
  });
  const wss = new WebSocketServer({ noServer: true });
  ctx.webServer.registerUpgrade({
    path: "/api/events.mux",
    handler: (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.send("hello-authed");
        ws.close();
      });
    },
  });

  let cookie = "";
  {
    const res = await fetch(`${base}/`, { redirect: "manual" });
    check("A 未登录 GET / → 302 跳转登录页", res.status === 302 && (res.headers.get("location") ?? "").startsWith("/login"), `status=${res.status}`);
  }
  {
    const res = await fetch(`${base}/login`, { redirect: "manual" });
    const body = await res.text();
    check("A GET /login → 200 且包含口令表单", res.status === 200 && body.includes("访问口令") && body.includes("type=\"password\""), `status=${res.status}`);
  }
  {
    const res = await fetch(`${base}/api/ping`, { redirect: "manual" });
    const body = await res.text();
    check("A 未登录 GET /api/ping → 401 JSON", res.status === 401 && body.includes("unauthorized"), `status=${res.status}`);
  }
  {
    const res = await fetch(`${base}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "password=wrong-password",
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    check("A 错误口令 → 302 回登录页且不种 Cookie", res.status === 302 && (res.headers.get("location") ?? "").includes("error=wrong") && !setCookie.includes("dsh_session="), `status=${res.status}`);
  }
  {
    const res = await fetch(`${base}/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `password=${encodeURIComponent(TEST_PASSWORD)}`,
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    cookie = (setCookie.match(/dsh_session=[^;]+/) ?? [""])[0];
    check("A 正确口令 → 302 到 / 且种 Cookie", res.status === 302 && res.headers.get("location") === "/" && cookie.startsWith("dsh_session="), `status=${res.status}`);
  }
  {
    const res = await fetch(`${base}/`, { redirect: "manual", headers: { cookie } });
    const body = await res.text();
    check("A 带 Cookie GET / → 200 正常返回 SPA", res.status === 200 && body.includes("SPA-INDEX"), `status=${res.status}`);
  }
  {
    const res = await fetch(`${base}/api/ping`, { redirect: "manual", headers: { cookie } });
    const body = await res.text();
    check("A 带 Cookie GET /api/ping → 200 JSON", res.status === 200 && body.includes('"ok":true'), `status=${res.status}`);
  }
  // WebSocket：等待第一个终态（message / error / close / timeout）
  const wsTry = (ws) => new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      resolve(result);
    };
    ws.once("message", (data) => finish({ kind: "message", data: String(data) }));
    ws.once("error", (err) => finish({ kind: "error", message: String(err?.message ?? err) }));
    ws.once("close", (code, reason) => finish({ kind: "close", code, reason: String(reason) }));
    setTimeout(() => finish({ kind: "timeout" }), 3000);
  });
  {
    const ws = new WsClient(`ws://127.0.0.1:${port}/api/events.mux`);
    const result = await wsTry(ws);
    check("A 未登录 WebSocket 升级被拒绝", result.kind === "error" || (result.kind === "close" && result.reason.includes("403")), JSON.stringify(result));
    try { ws.terminate(); } catch {}
  }
  {
    const ws = new WsClient(`ws://127.0.0.1:${port}/api/events.mux`, { headers: { cookie } });
    const result = await wsTry(ws);
    check("A 带 Cookie WebSocket 升级成功并收到消息", result.kind === "message" && result.data === "hello-authed", JSON.stringify(result));
    try { ws.terminate(); } catch {}
  }
}

// ---------------------------------------------------------------- 场景 B：首次设置
console.log("\n== 场景 B：首次设置（无任何口令）==");
{
  const tmpHome = mkdtempSync(join(os.tmpdir(), "dsh-access-gate-test-"));
  const settingsPath = join(tmpHome, "settings.yaml");

  let server;
  try {
    server = await bootServer({ password: void 0, mountSettings: true, settingsPath });
    const base = `http://127.0.0.1:${server.port}`;
    server.ctx.webServer.registerFallback(async (req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><body>SPA2</body></html>");
    });

    {
      const res = await fetch(`${base}/`, { redirect: "manual" });
      check("B 无口令时 GET / → 302 到 /setup", res.status === 302 && (res.headers.get("location") ?? "").startsWith("/setup"), `status=${res.status} loc=${res.headers.get("location")}`);
    }
    {
      const res = await fetch(`${base}/setup`, { redirect: "manual" });
      const body = await res.text();
      check("B GET /setup → 200 首次设置页（无任何安装码输入框）", res.status === 200 && body.includes("首次设置") && !body.includes("安装码"), `status=${res.status}`);
    }
    {
      const res = await fetch(`${base}/api/ping`, { redirect: "manual" });
      check("B 无口令时 /api → 401 JSON", res.status === 401, `status=${res.status}`);
    }
    {
      const res = await fetch(`${base}/setup`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "password=abc&confirm=abc",
      });
      check("B 过短口令被拒绝", res.status === 302 && (res.headers.get("location") ?? "").includes("error=short"), `status=${res.status} loc=${res.headers.get("location")}`);
    }
    {
      const res = await fetch(`${base}/setup`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "password=first-setup-pass&confirm=first-setup-pass",
      });
      check("B 设置口令 → 302 到 /login", res.status === 302 && res.headers.get("location") === "/login", `status=${res.status} loc=${res.headers.get("location")}`);
    }
    {
      const saved = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : "";
      check("B 口令已写入 settings.yaml（access-gate 命名空间）", saved.includes("access-gate") && saved.includes("first-setup-pass"), saved.length > 0 ? "settings.yaml 已生成" : "settings.yaml 缺失");
    }
    {
      const res = await fetch(`${base}/`, { redirect: "manual" });
      check("B 设置完成后 GET / → 302 到 /login", res.status === 302 && (res.headers.get("location") ?? "").startsWith("/login"), `status=${res.status} loc=${res.headers.get("location")}`);
    }
    {
      const res = await fetch(`${base}/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "password=first-setup-pass",
      });
      const setCookie = res.headers.get("set-cookie") ?? "";
      const cookie = (setCookie.match(/dsh_session=[^;]+/) ?? [""])[0];
      const res2 = await fetch(`${base}/`, { redirect: "manual", headers: { cookie } });
      const body = await res2.text();
      check("B 用新口令登录成功并访问 SPA", res.status === 302 && cookie.startsWith("dsh_session=") && res2.status === 200 && body.includes("SPA2"), `login=${res.status} home=${res2.status}`);
    }
  } finally {
    rmSync(tmpHome, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- 收尾
console.log(`\n结果：${PASS.length} 通过 / ${FAIL.length} 失败`);
for (const f of FAIL) console.log(`  FAIL: ${f}`);
process.exit(FAIL.length === 0 ? 0 : 1);
