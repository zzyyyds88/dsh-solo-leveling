#!/usr/bin/env node
/**
 * install-defaults-plugin.mjs — 安装/卸载 dsh-defaults 统一默认值插件（幂等，可重复执行）
 *
 * 做两件事：
 *   1) 标准安装 packages/dsh-defaults（宿主：注册设置命名空间）与
 *      packages/dsh-client-ui-defaults（前端：设置标签页）：
 *      已标准安装（bundles 含包名）则跳过；否则 npm pack → dsh plugin --profile web add
 *      （挂载清单由包内 cordis.patch.yml 承担，不再手工拷目录/写用户层 insert 行）；
 *   2) 收敛 web profile 的 cordis.patch.yml：移除 dsh-defaults / ui-dsh-defaults
 *      残留行（标准安装下挂载在 bundle 层，用户层残留会 duplicate 崩溃）。
 *
 * 前置：fork 包（dsh-host-directory-picker-browse / dsh-llm-pi-ai /
 * dsh-host-apiproxy，均在本项目 packages/ 内的本地副本）已构建并覆盖进 profile
 * （由 install-to-*.sh 负责）。
 *
 * 用法：
 *   node install-defaults-plugin.mjs                     # 安装（幂等）
 *   node install-defaults-plugin.mjs --dry-run           # 只检查，不写入
 *   node install-defaults-plugin.mjs --unpatch           # 卸载：还原 patch 文件(.bak)并删除插件目录
 *   node install-defaults-plugin.mjs --profile-dir <路径> # 指定 profile 目录（默认 ~/.dsh/profiles/web）
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
const HOST_PLUGIN_SRC = join(HERE, "packages", "dsh-defaults");
const CLIENT_PLUGIN_SRC = join(HERE, "packages", "dsh-client-ui-defaults");
const PLUGIN_FILES = ["package.json", "lib/index.js"];
const CLIENT_PLUGIN_FILES = ["package.json", "lib/index.js", "lib/client.js"];

const CANDIDATE_DSH_ROOTS = [
  "/usr/lib/node_modules/@deepseek-ai/dsh",
  "/usr/local/lib/node_modules/@deepseek-ai/dsh",
];

function fail(message) {
  console.error(`错误：${message}`);
  process.exit(2);
}

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

function findProfileDir(explicit) {
  if (explicit) return explicit;
  const home = process.env.DSH_HOME ?? join(os.homedir(), ".dsh");
  return join(home, "profiles", "web");
}

/** `--flag=value` 或 `--flag value` 两种写法都接受。 */
function optionValue(args, flag, fallback) {
  const inline = args.find((a) => a.startsWith(`${flag}=`));
  if (inline !== undefined) return inline.slice(flag.length + 1);
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] !== undefined ? args[idx + 1] : fallback;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const unpatch = args.includes("--unpatch");
const profileOpt = optionValue(args, "--profile-dir", undefined);
const dshRootOpt = optionValue(args, "--dsh-root", undefined);

const profileDir = findProfileDir(profileOpt);
const dshRoot = findDshRoot(dshRootOpt);
// js-yaml 与 cordis-plugin-include 从 dsh 安装根解析（与 dsh 自身同源，schema 一致）。
const require = createRequire(join(dshRoot, "package.json"));
const yaml = require("js-yaml");
const { entryListSchema } = require("@deepseek-ai/cordis-plugin-include");

console.log(`dsh 安装根：${dshRoot}`);
console.log(`web profile：${profileDir}`);

// 安全闸：目标 profile 不是 test-env* 时，一律视为正式环境，必须 --allow-formal 才允许写入
// （与 install-access-gate-plugin.mjs / install-pet-plugin.mjs 对齐，防止参数笔误误伤正式 profile）。
if (!/test-env[\d-]*[\\/]/.test(profileDir.replace(/\\/g, "/")) && !args.includes("--allow-formal")) {
  fail(
    `目标 profile 不是测试环境（${profileDir}），已拒绝写入。\n` +
    "如确认要对正式 profile 安装（请先在 SSH 终端停止 dsh web），加 --allow-formal 参数。"
  );
}

const patchFile = join(profileDir, "cordis.patch.yml");
const hostPluginDest = join(profileDir, "node_modules", "dsh-defaults");
const clientPluginDest = join(profileDir, "node_modules", "dsh-client-ui-defaults");

if (unpatch) {
  if (existsSync(patchFile + ".bak")) {
    cpSync(patchFile + ".bak", patchFile);
    console.log(`已还原 ${patchFile} ← ${patchFile}.bak`);
  } else {
    console.log(`没有备份 ${patchFile}.bak，跳过 patch 文件还原。`);
  }
  // 标准卸载：dsh plugin remove 同时清理 node_modules 与 profile bundles 条目
  // （直接 rmSync 会残留 bundles 条目，下次启动解析缺失 bundle 失败）。
  const profileName = basename(profileDir);
  const rm = spawnSync("dsh", ["plugin", "--profile", profileName, "remove", "dsh-defaults", "dsh-client-ui-defaults"], {
    cwd: profileDir,
    env: { ...process.env, DSH_HOME: process.env.DSH_HOME ?? join(os.homedir(), ".dsh") },
    encoding: "utf8",
  });
  if (rm.status !== 0) {
    console.log("  （dsh plugin remove 未成功，回退为目录删除兜底）");
  }
  for (const dest of [hostPluginDest, clientPluginDest]) {
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
      console.log(`已删除插件目录 ${dest}`);
    }
  }
  console.log("\n完成。注意：fork 包（picker-browse / pi-ai / apiproxy）不在此脚本管理范围，");
  console.log("卸载统一插件后它们仍生效；如需整体回退请用 install-to-*.sh 的 --unpatch 流程。");
  process.exit(0);
}

// 1) 标准安装插件包（dsh plugin add：装 node_modules + 进 profile bundles，不再手工拷目录/写 insert 行）
const hasBundleEntry = (name) => {
  try {
    const manifest = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8"));
    return (manifest.dsh?.profile?.bundles ?? []).includes(name);
  } catch { return false; }
};
const stdInstalled = hasBundleEntry("dsh-defaults") && hasBundleEntry("dsh-client-ui-defaults");
if (stdInstalled) {
  console.log("[1/2] 插件已标准安装（bundles 含 dsh-defaults / dsh-client-ui-defaults，跳过）");
} else if (dryRun) {
  console.log("  （--dry-run，将 npm pack 两个插件包 → dsh plugin --profile web add）");
} else {
  for (const rel of PLUGIN_FILES) {
    if (!existsSync(join(HOST_PLUGIN_SRC, rel))) fail(`插件源码缺失：${join(HOST_PLUGIN_SRC, rel)}`);
  }
  for (const rel of CLIENT_PLUGIN_FILES) {
    if (!existsSync(join(CLIENT_PLUGIN_SRC, rel))) fail(`客户端插件源码缺失：${join(CLIENT_PLUGIN_SRC, rel)}`);
  }
  const packTmp = mkdtempSync(join(tmpdir(), "defaults-pack-"));
  const tgzs = [];
  for (const src of [HOST_PLUGIN_SRC, CLIENT_PLUGIN_SRC]) {
    const packed = spawnSync("npm", ["pack", "--pack-destination", packTmp, "--silent"], { cwd: src, encoding: "utf8" });
    if (packed.status !== 0) fail(`npm pack 失败（${src}）：${packed.stderr ?? packed.stdout}`);
    const name = packed.stdout.trim().split("\n").pop().trim();
    if (!name.endsWith(".tgz")) fail(`npm pack 输出异常：${name}`);
    tgzs.push(join(packTmp, name));
  }
  const profileName = basename(profileDir);
  const add = spawnSync("dsh", ["plugin", "--profile", profileName, "add", ...tgzs], {
    cwd: profileDir,
    env: { ...process.env, DSH_HOME: process.env.DSH_HOME ?? join(os.homedir(), ".dsh") },
    encoding: "utf8",
  });
  if (add.status !== 0) fail(`dsh plugin add 失败（exit ${add.status}）：${add.stderr ?? add.stdout}`);
  console.log("[1/2] 标准安装插件包 → bundles 已加入 dsh-defaults / dsh-client-ui-defaults ✓");
}

// 2) 收敛用户层 patch：移除 dsh-defaults / ui-dsh-defaults 残留行
//    （标准插件包安装下挂载由 bundle 层 dsh.bundle.patch 承担；残留行会 duplicate 崩溃）
if (!existsSync(patchFile)) fail(`找不到 profile patch 文件：${patchFile}`);
if (!dryRun && !existsSync(patchFile + ".bak")) {
  cpSync(patchFile, patchFile + ".bak");
  console.log(`  已备份 patch 文件 → ${patchFile}.bak`);
}
const current = yaml.load(readFileSync(patchFile, "utf8"), { schema: entryListSchema });
if (!Array.isArray(current)) fail(`patch 文件必须是顶层 YAML 数组：${patchFile}`);

const REMOVE_IDS = new Set(["dsh-defaults", "ui-dsh-defaults"]);
let changed = false;
for (const entry of current) {
  if (typeof entry !== "object" || entry === null) continue;
  if (Array.isArray(entry.insert)) {
    const before = entry.insert.length;
    entry.insert = entry.insert.filter((i) => !(i && REMOVE_IDS.has(i.id)));
    if (entry.insert.length !== before) { changed = true; console.log(`[2/2] 已移除残留行（${entry.insert.length < before ? "dsh-defaults / ui-dsh-defaults" : ""}）`); }
  }
}
const filtered = current.filter((e) => !(typeof e === "object" && e !== null && typeof e.id === "string" && REMOVE_IDS.has(e.id)));
if (filtered.length !== current.length) { changed = true; console.log("[2/2] 已移除顶层残留行（dsh-defaults / ui-dsh-defaults）"); }
current.length = 0;
current.push(...filtered);

if (!changed) {
  console.log("\n无变更，已是最新状态。");
  process.exit(0);
}
if (dryRun) {
  console.log("\n（--dry-run，未写入 patch 文件）");
  process.exit(0);
}
writeFileSync(patchFile, yaml.dump(current, { schema: entryListSchema, lineWidth: 120 }));
console.log("\n完成。");
console.log("  - 前端（设置标签页）：浏览器刷新即可生效（client bundle 实时读盘 + no-cache）。");
console.log("  - 后端（fork 包）：需要重启 dsh web 才生效。");
