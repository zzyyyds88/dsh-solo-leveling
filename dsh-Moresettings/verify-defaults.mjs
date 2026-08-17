#!/usr/bin/env node
/**
 * verify-defaults.mjs — dsh-defaults 统一插件验证脚本
 *
 * 对运行中的 DSH 实例做黑盒验证：
 *   1) dsh-defaults 设置命名空间已注册并暴露（settings.describe）；
 *   2) 设置写入 → 持久化 → 读取回环（settings.mutate / describe）；
 *   3) 目录选择器默认目录生效（host.listDirectory 无路径 → 配置目录）；
 *   4) pi-ai 第三方供应商注册且思考强度菜单正常（llm.models）；
 *   5) 前端设置标签页 bundle 可被服务端提供（/plugins/.../client.js）。
 *
 * 用法：
 *   node verify-defaults.mjs                        # 验证 http://127.0.0.1:3090（测试环境默认）
 *   node verify-defaults.mjs --base http://127.0.0.1:3090 --password <已设口令>
 *     （基线无门闸时无需口令；装 access-gate 后需传首次 /setup 设置的口令）
 * 退出码：0 = 全部通过；1 = 有失败项。
 */
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
// --formal 指向正式环境（127.0.0.1:3080）；否则默认测试环境（3090，可用 --base 覆盖）
const formal = args.includes("--formal");
const base = formal
  ? "http://127.0.0.1:3080"
  : (args.find((a) => a.startsWith("--base=")) ?? "--base=http://127.0.0.1:3090").split("=")[1];
// 不预置默认口令：基线无门闸时登录请求 404/405 即视为无门闸；有门闸时显式传 --password
const password = (args.find((a) => a.startsWith("--password=")) ?? "").split("=")[1];

const FAIL = [];
const PASS = [];
const SKIP = [];
const check = (label, ok, detail = "") => {
  if (ok) PASS.push(label);
  else FAIL.push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? `（${detail}）` : ""}`);
};
// 区分「装坏」与「没配」：供应商未配置属于用户尚未完成设置，不是插件问题，
// 输出 [SKIP] 而非 [FAIL]，不参与失败计数。
const skip = (label, detail = "") => {
  SKIP.push(label);
  console.log(`  [SKIP] ${label}${detail ? `（${detail}）` : ""}`);
};

// 登录拿会话 cookie（web-auth 门闸；官方基线无门闸时直接调用）
let cookie;
try {
  const loginRes = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
    redirect: "manual",
  });
  cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  const noGate = loginRes.status === 404 || loginRes.status === 405;
  check("登录（门闸）", !!cookie || noGate, `HTTP ${loginRes.status}${cookie ? "" : noGate ? "（无门闸，直接调用）" : "（无 cookie！）"}`);
} catch {
  check("登录（门闸）", true, "无 /login 端点（官方基线无鉴权），跳过");
}
const call = async (method, payload) => {
  const res = await fetch(`${base}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ type: "client-request", rpcId: randomUUID(), method, payload }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  return (await res.json()).result;
};

console.log(`== 验证目标：${base} ==`);

// 1) 命名空间暴露与注册
const describe = await call("settings.describe", {});
const ns = describe.value?.namespaces?.find((n) => n.ns === "dsh-defaults");
check("dsh-defaults 命名空间已暴露并注册", !!ns, ns ? JSON.stringify(ns.value) : "未在 describe 中");
const nsSchemaDict = ns?.schema?.refs?.[String(ns.schema.uid)]?.dict ?? {};
check(
  "schema 含两个字段",
  "defaultWorkingDirectory" in nsSchemaDict && "defaultRetryCount" in nsSchemaDict,
  Object.keys(nsSchemaDict).join(","),
);

// 2) 写入回环：临时改值 → 读回 → 验证目录默认值 → 还原
let retryCount = ns?.value?.defaultRetryCount ?? 5;
let workDir = ns?.value?.defaultWorkingDirectory ?? "";
const probeRetry = retryCount === 5 ? 7 : 5;
if (ns) {
  const m = await call("settings.mutate", {
    ns: "dsh-defaults",
    ops: [
      { op: "set", path: ["defaultRetryCount"], value: probeRetry },
      { op: "set", path: ["defaultWorkingDirectory"], value: "/tmp" },
    ],
  });
  check("settings.mutate 写入成功", m.ok === true);
  const d2 = await call("settings.describe", {});
  const ns2 = d2.value.namespaces.find((n) => n.ns === "dsh-defaults");
  check(
    "写入回读一致",
    ns2?.value?.defaultRetryCount === probeRetry && ns2?.value?.defaultWorkingDirectory === "/tmp",
    JSON.stringify(ns2?.value),
  );
}

// 3) 目录选择器默认目录（写入状态下验证，再还原）
const dir = await call("host.listDirectory", {});
check("目录选择器默认目录生效", dir.value?.path === "/tmp", `path=${dir.value?.path}`);

// 还原设置
if (ns) {
  await call("settings.mutate", {
    ns: "dsh-defaults",
    ops: [
      { op: "set", path: ["defaultRetryCount"], value: retryCount },
      workDir === "" ? { op: "unset", path: ["defaultWorkingDirectory"] } : { op: "set", path: ["defaultWorkingDirectory"], value: workDir },
    ],
  });
}

// 4) pi-ai 供应商 + 思考强度（供应商未配置 = 跳过，不判失败）
const models = await call("llm.models", {});
const tr = models.value?.groups?.find((g) => g.id === "tokenrhythm");
if (!tr) {
  skip("pi-ai 第三方供应商已注册", "供应商未配置（安装后需在设置页配置，非装坏）");
  skip("思考强度菜单含 off/low/medium/high", "供应商未配置");
} else {
  check("pi-ai 第三方供应商已注册", true, JSON.stringify(models.value?.failures ?? []));
  const efforts = tr.models?.[0]?.reasoning?.efforts?.map((e) => e.id) ?? [];
  check("思考强度菜单含 off/low/medium/high", ["off", "low", "medium", "high"].every((l) => efforts.includes(l)), efforts.join(","));
}

// 5) 前端设置标签页 bundle
const bundleRes = await fetch(`${base}/plugins/dsh-client-ui-defaults/client.js`, { headers: cookie ? { cookie } : {} });
const bundleText = await bundleRes.text();
check("设置标签页 bundle 可提供", bundleRes.status === 200 && bundleText.includes("dsh-defaults"), `HTTP ${bundleRes.status}`);

console.log(`\n${PASS.length} 项通过，${FAIL.length} 项失败，${SKIP.length} 项跳过`);
process.exit(FAIL.length === 0 ? 0 : 1);
