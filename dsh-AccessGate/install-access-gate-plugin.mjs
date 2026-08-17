#!/usr/bin/env node
/**
 * install-access-gate-plugin.mjs — 安装/卸载「访问门禁」鉴权插件（幂等，可重复执行）
 *
 * 做五件事：
 *   1a) 安装门闸基础 fork（dsh-host-webserver / dsh-host-apiproxy / dsh-client-connection，
 *       源码在本项目 packages/，profile 同名覆盖、升级免疫；缺 access-gate
 *       命名空间暴露时设置卡片不可用，故正式部署必须装 fork）；
 *   1b) 前置校验门闸基础（profile fork 优先，全局旧补丁兜底）：
 *       缺少 registerGate / 命名空间暴露 / settings.* 登录放行时拒绝安装。
 *   2) 标准安装两个插件包（dsh-host-access-gate / dsh-client-ui-access-gate）：
 *       已标准安装（bundles 含包名）则跳过；否则 npm pack 项目包 → dsh plugin --profile web add
 *      （挂载清单由包内 cordis.patch.yml 承担，不再手工拷目录/写用户层 insert 行）。
 *   3) 把 web profile 的 cordis.patch.yml 收敛为仅保留部署配置覆盖：
 *        - id: webserver   → 监听地址 127.0.0.1（回环，HTTPS 反代在前；端口沿用 webStartup ?? 3080）；
 *        - id: connection  → trustedHosts 固化（免 --trusted-host）；
 *      同时移除旧版行（web-auth / ui-web-auth）与残留的 access-gate / ui-access-gate
 *      insert 行（标准安装下挂载在 bundle 层，用户层残留会 duplicate 崩溃）。
 *   4) 存量迁移：
 *        - settings.yaml 里旧命名空间 web-auth: 重命名为 access-gate:（仅当
 *          access-gate: 尚不存在；先备份 settings.yaml.bak）；
 *        - 删除 profile 里旧插件目录 dsh-web-auth / dsh-client-ui-web-auth
 *          （patch 已迁移，旧插件不再挂载）。
 *
 * YAML 合并用与 dsh 完全相同的 entryListSchema（含 `!!js` 表达式标签），
 * 所以 `!!js ctx.webStartup.port ?? 3080` 这类表达式能无损读写。
 *
 * 用法：
 *   node install-access-gate-plugin.mjs                # 安装（幂等）
 *   node install-access-gate-plugin.mjs --dry-run      # 只检查，不写入
 *   node install-access-gate-plugin.mjs --unpatch      # 卸载：还原 patch 文件(.bak)并删除插件目录
 *   node install-access-gate-plugin.mjs --dsh-root <路径>   # 指定 dsh 安装根（自动搜索时可不填）
 *   node install-access-gate-plugin.mjs --profile-dir <路径> # 指定 profile 目录（自动推导时可不填）
 *   node install-access-gate-plugin.mjs --dsh-home <路径>   # 指定 DSH_HOME（settings.yaml 位置，默认 ~/.dsh）
 *
 * 退出码：0 = 已是最新/处理完成；2 = 失败（已打印原因）。
 */
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_SRC = join(HERE, "packages", "dsh-host-access-gate");
const CLIENT_PLUGIN_SRC = join(HERE, "packages", "dsh-client-ui-access-gate");
const PLUGIN_FILES = ["package.json", "lib/index.js", "assets"];
const CLIENT_PLUGIN_FILES = ["package.json", "lib/index.js", "lib/client.js"];

const CANDIDATE_DSH_ROOTS = [
  "/usr/lib/node_modules/@deepseek-ai/dsh",
  "/usr/local/lib/node_modules/@deepseek-ai/dsh",
];

/** 门闸基础标记：profile fork 优先，全局安装（旧补丁）兜底。 */
const GATE_MARKERS = ["registerGate(check) {"];
const APIPROXY_MARKERS = ['exposed.add("access-gate")', 'exposed.add("web-auth")'];
const CONNECTION_MARKERS = ["webAuthAuthed(ctx, request)"];

// ---------------------------------------------------------------- 定位

function findDshRoot(explicit) {
  if (explicit) {
    if (existsSync(join(explicit, "package.json"))) return explicit;
    fail(`指定的 --dsh-root 不存在或缺少 package.json: ${explicit}`);
  }
  for (const root of CANDIDATE_DSH_ROOTS) {
    if (existsSync(join(root, "package.json"))) return root;
  }
  fail("未找到 dsh 安装根。请用 --dsh-root 指定（含 package.json 的 dsh 安装目录）。");
}

function findProfileDir(explicit, dshHome) {
  if (explicit) return explicit;
  const home = dshHome ?? process.env.DSH_HOME ?? join(os.homedir(), ".dsh");
  return join(home, "profiles", "web");
}

function fail(message) {
  console.error(`错误：${message}`);
  process.exit(2);
}

/** 依次检查候选文件里是否含任一标记；返回命中的文件路径或 undefined。 */
function findMarked(markers, ...candidateFiles) {
  for (const file of candidateFiles) {
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf8");
    if (markers.some((m) => src.includes(m))) return file;
  }
  return void 0;
}

// ---------------------------------------------------------------- 主流程

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const unpatch = args.includes("--unpatch");
const allowFormal = args.includes("--allow-formal");
/** 兼容 `--flag=value` 与 `--flag value` 两种写法。 */
function optValue(name) {
  const eq = args.find((a) => a.startsWith(`${name}=`))?.split("=").slice(1).join("=");
  if (eq !== void 0) return eq;
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return void 0;
}
const dshRootOpt = optValue("--dsh-root");
const profileOpt = optValue("--profile-dir");
const dshHomeOpt = optValue("--dsh-home");

const dshRoot = findDshRoot(dshRootOpt);
const profileDir = findProfileDir(profileOpt, dshHomeOpt);
const require = createRequire(join(dshRoot, "package.json"));
const yaml = require("js-yaml");
const { entryListSchema } = require("@deepseek-ai/cordis-plugin-include");

// 安全闸：除显式指定 test-env* 目录外，一律视为正式环境，必须 --allow-formal 才允许写入
// （正式安装本就应由用户在 SSH 终端手动执行，见 AGENTS.md；防止参数笔误误伤正式 profile）。
if (!/test-env[\d-]*[\\/]/.test(profileDir.replace(/\\/g, "/")) && !allowFormal) {
  fail(
    `目标 profile 不是测试环境（${profileDir}），已拒绝写入。\n` +
    "如确认要对正式 profile 安装（请先在 SSH 终端停止 dsh web），加 --allow-formal 参数。"
  );
}

console.log(`dsh 安装根：${dshRoot}`);
console.log(`web profile：${profileDir}`);

if (unpatch) {
  const patchFile = join(profileDir, "cordis.patch.yml");
  const backup = patchFile + ".bak";
  if (existsSync(backup)) {
    cpSync(backup, patchFile);
    console.log(`已还原 ${patchFile} ← ${backup}`);
  } else {
    console.log(`没有备份 ${backup}，跳过 patch 文件还原。`);
  }
  // 标准卸载：dsh plugin remove 同时清理 node_modules 与 profile bundles 条目
  // （直接 rmSync 会残留 bundles 条目，下次启动解析缺失 bundle 失败）。
  const profileName = basename(profileDir);
  const rm = spawnSync("dsh", ["plugin", "--profile", profileName, "remove", "dsh-host-access-gate", "dsh-client-ui-access-gate"], {
    cwd: profileDir,
    env: { ...process.env, DSH_HOME: dshHomeOpt ?? process.env.DSH_HOME ?? join(os.homedir(), ".dsh") },
    encoding: "utf8",
  });
  if (rm.status !== 0) {
    console.log("  （dsh plugin remove 未成功，回退为目录删除兜底）");
  }
  for (const pkg of ["dsh-host-access-gate", "dsh-client-ui-access-gate"]) {
    const dest = join(profileDir, "node_modules", pkg);
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
      console.log(`已删除插件目录 ${dest}`);
    } else {
      console.log(`插件目录不存在，跳过：${dest}`);
    }
  }
  console.log("\n完成。注意：门闸基础（fork 或旧补丁）仍在，如需还原官方行为请按 定制记录 回退。");
  process.exit(0);
}

// 1a) 安装门闸基础 fork（profile 同名覆盖，升级免疫；源码在本项目 packages/）
//     正式 profile 若无 fork，Loader 会回退全局安装——全局 apiproxy 只暴露旧
//     web-auth 命名空间，缺 access-gate，设置卡片将不可读写，故必须装 fork。
const FORK_PKGS = ["dsh-host-webserver", "dsh-host-apiproxy", "dsh-client-connection", "dsh-client-ui-settings"];
const FORKS_ROOT = join(HERE, "packages");
let forkInstalled = 0;
for (const pkg of FORK_PKGS) {
  const srcLib = join(FORKS_ROOT, pkg, "lib");
  const dst = join(profileDir, "node_modules", "@deepseek-ai", pkg);
  if (!existsSync(join(srcLib, "index.js"))) {
    console.log(`  [WARN] fork 未构建（无 lib/），跳过：${pkg}（将回退全局安装）`);
    continue;
  }
  if (!dryRun) {
    // 仅首次备份：保留最初的官方原包，重复执行不覆盖 .bak（否则会丢失官方基线、无法回退）
    if (existsSync(dst) && !existsSync(`${dst}.bak`)) {
      cpSync(dst, `${dst}.bak`, { recursive: true });
      console.log(`  备份旧包 → ${dst}.bak`);
    }
    mkdirSync(dst, { recursive: true });
    rmSync(join(dst, "lib"), { recursive: true, force: true });
    cpSync(srcLib, join(dst, "lib"), { recursive: true });
    cpSync(join(FORKS_ROOT, pkg, "package.json"), join(dst, "package.json"));
  }
  forkInstalled += 1;
  console.log(`  ✓ fork ${pkg} → profile ${dryRun ? "（--dry-run，未写入）" : ""}`);
}
console.log(`[1a/5] 门闸基础 fork 就绪（${forkInstalled}/${FORK_PKGS.length}）`);

// 1) 前置校验：门闸基础（profile fork 优先，全局旧补丁兜底）
const scoped = (pkg) => join(profileDir, "node_modules", "@deepseek-ai", pkg, "lib", "index.js");
const globalScoped = (pkg) => join(dshRoot, "node_modules", "@deepseek-ai", pkg, "lib", "index.js");
const gateHit = findMarked(GATE_MARKERS, scoped("dsh-host-webserver"), globalScoped("dsh-host-webserver"));
if (!gateHit) {
  fail(
    "找不到带「请求门闸」的 dsh-host-webserver（registerGate）。\n" +
    "请先构建并安装 fork：dsh-AccessGate/build.sh + scripts/test-env-install.sh --from-project dsh-AccessGate\n" +
    "（或对全局安装跑旧的 patch-webserver-gate.py）。缺少 registerGate 时启用鉴权会直接报错。"
  );
}
const apiproxyHit = findMarked(APIPROXY_MARKERS, scoped("dsh-host-apiproxy"), globalScoped("dsh-host-apiproxy"));
const connectionHit = findMarked(CONNECTION_MARKERS, scoped("dsh-client-connection"), globalScoped("dsh-client-connection"));
if (!apiproxyHit || !connectionHit) {
  fail(
    "设置面板集成基础未完全就位（需要 apiproxy 暴露 access-gate/web-auth 命名空间 + connection 登录后放行 settings.*）。\n" +
    "请先构建并安装 fork（dsh-AccessGate/build.sh + scripts/test-env-install.sh --from-project dsh-AccessGate），\n" +
    "或对全局安装跑旧的 patch-settings-integration.py。否则 GUI 里的「访问口令」卡片在 LAN 上无法读写。"
  );
}
console.log(`[1b/5] 门闸基础校验就位（webserver: ${gateHit}）`);

// 2) 标准安装/升级插件包（dsh plugin add：装 node_modules + 进 profile bundles，不再手工拷目录/写 insert 行）
//    - 未装（bundles 缺包名）→ npm pack → dsh plugin add（全新安装）
//    - 已装但 lib 内容与项目不一致（源码改过/大版本变更）→ remove + add（升级，
//      解决 pnpm 对同路径同版本 tgz 不刷新的问题）
//    - 已装且为最新 → 跳过
const hasBundleEntry = (name) => {
  try {
    const manifest = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8"));
    return (manifest.dsh?.profile?.bundles ?? []).includes(name);
  } catch { return false; }
};
const stdInstalled = hasBundleEntry("dsh-host-access-gate") && hasBundleEntry("dsh-client-ui-access-gate");
/** 已装包 lib/ 与项目源码内容是否不一致（比较 index.js 与 client.js；不一致 = 需要升级）。 */
const installedDiffers = (name, projectDir) => {
  try {
    for (const rel of ["lib/index.js", "lib/client.js"]) {
      const src = join(projectDir, rel);
      if (!existsSync(src)) continue;
      const installed = join(profileDir, "node_modules", name, rel);
      if (!existsSync(installed)) return true;
      if (readFileSync(installed, "utf8") !== readFileSync(src, "utf8")) return true;
    }
    return false;
  } catch {
    return !existsSync(join(projectDir, "lib", "index.js")) ? false : true;
  }
};
const hostDiffers = installedDiffers("dsh-host-access-gate", PLUGIN_SRC);
const clientDiffers = installedDiffers("dsh-client-ui-access-gate", CLIENT_PLUGIN_SRC);
const needUpgrade = stdInstalled && (hostDiffers || clientDiffers);

if (stdInstalled && !needUpgrade) {
  console.log("[2/5] 插件已标准安装且为最新（bundles 含两包，跳过）");
} else if (dryRun) {
  console.log(`  （--dry-run，将 npm pack 两个插件包 → dsh plugin --profile web ${needUpgrade ? "remove + " : ""}add）`);
} else {
  for (const rel of PLUGIN_FILES) {
    const src = join(PLUGIN_SRC, rel);
    if (!existsSync(src)) fail(`插件源码缺失：${src}`);
  }
  for (const rel of CLIENT_PLUGIN_FILES) {
    const src = join(CLIENT_PLUGIN_SRC, rel);
    if (!existsSync(src)) fail(`客户端插件源码缺失：${src}`);
  }
  const packTmp = mkdtempSync(join(tmpdir(), "access-gate-pack-"));
  const tgzs = [];
  for (const src of [PLUGIN_SRC, CLIENT_PLUGIN_SRC]) {
    const packed = spawnSync("npm", ["pack", "--pack-destination", packTmp, "--silent"], { cwd: src, encoding: "utf8" });
    if (packed.status !== 0) fail(`npm pack 失败（${src}）：${packed.stderr ?? packed.stdout}`);
    const name = packed.stdout.trim().split("\n").pop().trim();
    if (!name.endsWith(".tgz")) fail(`npm pack 输出异常：${name}`);
    tgzs.push(join(packTmp, name));
  }
  const profileName = basename(profileDir);
  const env = { ...process.env, DSH_HOME: dshHomeOpt ?? process.env.DSH_HOME ?? join(os.homedir(), ".dsh") };
  if (needUpgrade) {
    const rm = spawnSync("dsh", ["plugin", "--profile", profileName, "remove", "dsh-host-access-gate", "dsh-client-ui-access-gate"], {
      cwd: profileDir, env, encoding: "utf8",
    });
    if (rm.status !== 0) fail(`dsh plugin remove 失败（exit ${rm.status}）：${rm.stderr ?? rm.stdout}`);
    console.log("  （已移除旧版，重新安装最新构建）");
  }
  const add = spawnSync("dsh", ["plugin", "--profile", profileName, "add", ...tgzs], {
    cwd: profileDir, env, encoding: "utf8",
  });
  if (add.status !== 0) {
    fail(`dsh plugin add 失败（exit ${add.status}）：${add.stderr ?? add.stdout}`);
  }
  console.log(`[2/5] ${needUpgrade ? "升级" : "标准安装"}插件包 → bundles 已更新 dsh-host-access-gate / dsh-client-ui-access-gate ✓`);
}

// 3) 合并 cordis.patch.yml（含旧行 web-auth/ui-web-auth 迁移）
const patchFile = join(profileDir, "cordis.patch.yml");
if (!existsSync(patchFile)) fail(`找不到 profile patch 文件：${patchFile}`);
const current = yaml.load(readFileSync(patchFile, "utf8"), { schema: entryListSchema });
if (!Array.isArray(current)) fail(`patch 文件必须是顶层 YAML 数组：${patchFile}`);

const webserverOverride = {
  id: "webserver",
  config: {
    // HTTPS 反代（caddy/nginx）在前，DSH 自身只监听回环地址；鉴权由 mode: on 强制开启。
    host: "127.0.0.1",
    port: { __jsExpr: "ctx.webStartup.port ?? 3080" },
  },
};

/** 从 settings.yaml 读取 access-gate 反代参数（GUI 卡片保存），供 trustedHosts 默认 host 使用。 */
function readAccessGateSetting(dshHome, key) {
  try {
    const doc = yaml.load(readFileSync(join(dshHome, "settings.yaml"), "utf8"));
    const v = doc?.["access-gate"]?.[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  } catch { /* settings.yaml 缺失/不可读 → 用默认值 */ }
  return void 0;
}
const settingLanHost = readAccessGateSetting(dshHomeOpt ?? process.env.DSH_HOME ?? join(os.homedir(), ".dsh"), "lanHost");

/** 探测本机局域网 IPv4（os.networkInterfaces，过滤回环/内部接口）。 */
function detectLanIps() {
  try {
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === "IPv4" && !net.internal) ips.push(net.address);
      }
    }
    return ips;
  } catch { return []; }
}

// trustedHosts 动态方案（实测 `!!js` 表达式可 require('node:fs') 读 settings.yaml）：
// 1) 启动参数 webRuntime.trustedHosts（--trusted-host）优先；
// 2) 否则动态读设置卡保存的 access-gate.lanHost（改地址重启即生效，无需重跑安装器）；
// 3) 兜底 DSH_WEB_TRUSTED_HOST 环境变量 + 本机探测的局域网 IP（多网卡全量）。
const hostOk = (h) => /^[A-Za-z0-9.:\-[\]]+$/.test(h);
const defaultLanHosts = [...new Set(
  (settingLanHost && hostOk(settingLanHost) ? [settingLanHost] : []).concat(detectLanIps().filter(hostOk))
)];
const fallbackIps = defaultLanHosts.map((h) => `'${h}'`).join(", ");
const connExpr = `ctx.webRuntime.trustedHosts.length > 0 ? ctx.webRuntime.trustedHosts : (() => { try { const m = require('node:fs').readFileSync((process.env.DSH_HOME || require('node:os').homedir() + '/.dsh') + '/settings.yaml', 'utf8').match(/lanHost[\\s]*[:=][\\s]*['"]?([A-Za-z0-9.:\\[\\]-]+)/); return [...new Set([process.env.DSH_WEB_TRUSTED_HOST, m ? m[1] : '', ${fallbackIps}].filter(Boolean))]; } catch (e) { return [...new Set([process.env.DSH_WEB_TRUSTED_HOST, ${fallbackIps}].filter(Boolean))]; } })()`;
if (defaultLanHosts.length === 0) {
  console.warn("  ⚠ 未探测到本机局域网 IP，trustedHosts 依赖设置卡地址或 DSH_WEB_TRUSTED_HOST（否则仅回环可访问）");
}

const connectionOverride = {
  id: "connection",
  config: {
    trustedHosts: {
      __jsExpr: connExpr,
    },
  },
};

/** 移除旧版插件行（id=web-auth / ui-web-auth），返回是否发生过移除。 */
function dropLegacyRows(entries) {
  const ids = new Set(["web-auth", "ui-web-auth"]);
  let dropped = false;
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    if (Array.isArray(entry.insert)) {
      const before = entry.insert.length;
      entry.insert = entry.insert.filter((i) => !(i && ids.has(i.id)));
      if (entry.insert.length !== before) dropped = true;
    }
    if (typeof entry.id === "string" && ids.has(entry.id)) dropped = true;
  }
  return entries.filter((e) => !(typeof e === "object" && e !== null && typeof e.id === "string" && ids.has(e.id)));
}

let changed = false;
const entries = dropLegacyRows(current);
if (entries.length !== current.length) {
  changed = true;
  console.log("[3/5] 已移除旧版插件行（web-auth / ui-web-auth）");
}
current.length = 0;
current.push(...entries);

// 3a) webserver 监听地址覆盖
const wsEntry = current.find((e) => typeof e === "object" && e !== null && e.id === "webserver");
if (wsEntry) {
  if (JSON.stringify(wsEntry.config) === JSON.stringify(webserverOverride.config)) {
    console.log("[3/5] webserver 覆盖已存在且一致（跳过）");
  } else {
    fail(
      `cordis.patch.yml 已存在 id=webserver 的覆盖且与预期不同：${JSON.stringify(wsEntry.config)}\n` +
      "请手动合并（预期监听 127.0.0.1、端口 ctx.webStartup.port ?? 3080），或先 --unpatch 还原。"
    );
  }
} else {
  current.push(webserverOverride);
  changed = true;
  console.log("[3/5] 新增 webserver 覆盖：host=127.0.0.1（回环，HTTPS 反代在前）");
}

// 3a-2) connection trustedHosts 固化（启动免 --trusted-host）
const connEntry = current.find((e) => typeof e === "object" && e !== null && e.id === "connection");
if (connEntry) {
  const same = JSON.stringify(connEntry.config) === JSON.stringify(connectionOverride.config);
  const ours = JSON.stringify(connEntry.config ?? {}).includes("DSH_WEB_TRUSTED_HOST");
  if (same) {
    console.log("[3/5] connection trustedHosts 已固化（跳过）");
  } else if (ours) {
    connEntry.config = connectionOverride.config;
    changed = true;
    console.log("[3/5] connection trustedHosts 已收敛为无端口 host（任意端口放行）");
  } else {
    fail(
      `cordis.patch.yml 已存在 id=connection 的覆盖且非本脚本托管结构：${JSON.stringify(connEntry.config)}\n` +
      "请手动合并，或先 --unpatch 还原。"
    );
  }
} else {
  current.push(connectionOverride);
  changed = true;
  console.log("[3/5] 固化 connection trustedHosts（免 --trusted-host；DSH_WEB_TRUSTED_HOST 可覆盖默认 IP）");
}

// 3b) 收敛用户层 patch：移除 access-gate / ui-access-gate 插件行
//     （标准插件包安装下挂载由 bundle 层 dsh.bundle.patch 承担；
//       用户层残留行会与 bundle 层重复挂载导致启动崩溃 duplicate entry id）
const dropGateRows = (entries) => {
  const ids = new Set(["access-gate", "ui-access-gate"]);
  let dropped = 0;
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    if (Array.isArray(entry.insert)) {
      const before = entry.insert.length;
      entry.insert = entry.insert.filter((i) => !(i && ids.has(i.id)));
      dropped += before - entry.insert.length;
    }
    if (typeof entry.id === "string" && ids.has(entry.id)) dropped++;
  }
  return { dropped, kept: entries.filter((e) => !(typeof e === "object" && e !== null && typeof e.id === "string" && ids.has(e.id))) };
};
const gateDrop = dropGateRows(current);
if (gateDrop.dropped > 0) {
  current.length = 0;
  current.push(...gateDrop.kept);
  changed = true;
  console.log(`[3/5] 已移除用户层 patch 中的 access-gate/ui-access-gate 插件行（${gateDrop.dropped} 处；标准安装由 bundle 层挂载）`);
} else {
  console.log("[3/5] 用户层 patch 无 access-gate/ui-access-gate 残留行（标准安装模式）");
}

if (changed && !dryRun) {
  // 先备份再写
  const backup = patchFile + ".bak";
  if (!existsSync(backup)) {
    cpSync(patchFile, backup);
    console.log(`  已备份原 patch 文件 → ${backup}`);
  }
  const header = `# 本文件由 install-access-gate-plugin.mjs 管理（首次写入时备份为 cordis.patch.yml.bak）。
# 项目：访问门禁。手动编辑请保留下列条目结构；重跑安装脚本会幂等跳过。
`;
  const body = yaml.dump(current, { schema: entryListSchema, noRefs: true, lineWidth: 120 });
  writeFileSync(patchFile, header + body);
  console.log(`  已写入 ${patchFile}`);
} else if (changed && dryRun) {
  console.log("  （--dry-run，未写入 patch 文件）");
}

// 4) 存量迁移：settings.yaml 旧命名空间 web-auth: → access-gate:（文本级，仅改顶层键）
const dshHome = dshHomeOpt ?? process.env.DSH_HOME ?? join(os.homedir(), ".dsh");
const settingsFile = join(dshHome, "settings.yaml");
if (existsSync(settingsFile)) {
  const raw = readFileSync(settingsFile, "utf8");
  const hasOld = /^web-auth:\s*(.*)$/m.test(raw);
  const hasNew = /^access-gate:\s*(.*)$/m.test(raw);
  if (hasOld && !hasNew && !dryRun) {
    const backup = settingsFile + ".bak";
    if (!existsSync(backup)) {
      cpSync(settingsFile, backup);
      console.log(`  已备份 settings.yaml → ${backup}`);
    }
    // 兼容两种写法：单独成行 `web-auth:` 与行内对象 `web-auth: { password: ... }`
    const migrated = raw.replace(/^web-auth:(\s*.*)$/m, "access-gate:$1");
    writeFileSync(settingsFile, migrated);
    console.log("[4/5] settings.yaml：旧命名空间 web-auth: 已重命名为 access-gate:（口令保留）");
  } else if (hasOld && !hasNew) {
    console.log("[4/5] settings.yaml：检测到旧命名空间 web-auth:（--dry-run，未写入）");
  } else {
    console.log("[4/5] settings.yaml：无需迁移（access-gate: 已存在或没有旧 web-auth:）");
  }
} else {
  console.log(`[4/5] settings.yaml 不存在，跳过迁移：${settingsFile}`);
}

// 5) 删除旧插件目录（patch 已迁移，旧插件不再挂载；目录留着只会造成困惑）
for (const pkg of ["dsh-web-auth", "dsh-client-ui-web-auth"]) {
  const oldDest = join(profileDir, "node_modules", pkg);
  if (existsSync(oldDest)) {
    if (!dryRun) {
      rmSync(oldDest, { recursive: true, force: true });
      console.log(`[5/5] 已删除旧插件目录 ${oldDest}`);
    } else {
      console.log(`[5/5] 检测到旧插件目录 ${oldDest}（--dry-run，未删除）`);
    }
  }
}

if (!changed) {
  console.log("\n无变更，已是最新状态。");
  process.exit(0);
}
if (dryRun) {
  console.log("\n（--dry-run，未写入任何文件）");
  process.exit(0);
}

console.log("\n完成。生效方式：需要重启 dsh web（后端模块已加载进进程）。");
console.log("重启时请设置环境变量 DSH_ACCESS_GATE_PASSWORD=<口令>（旧名 DSH_WEB_PASSWORD 兼容）；");
console.log("mode: on 下未配置口令会进入 /setup 首次设置页。");
