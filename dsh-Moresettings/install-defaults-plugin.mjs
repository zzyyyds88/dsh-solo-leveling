#!/usr/bin/env node
/**
 * install-defaults-plugin.mjs — 安装/卸载 dsh-defaults 统一默认值插件（幂等，可重复执行）
 *
 * 做两件事：
 *   1) 把 packages/dsh-defaults（宿主：注册设置命名空间）与
 *      packages/dsh-client-ui-defaults（前端：设置标签页）复制到
 *      web profile 的 node_modules（$DSH_HOME/profiles/web/node_modules/），
 *      使 Loader 以裸包名解析到它们；
 *   2) 把 web profile 的 cordis.patch.yml 合并进两条 insert 行：
 *        - id: dsh-defaults（宿主插件）
 *        - id: dsh-client-ui-defaults（设置标签页插件）
 *      （YAML 合并用与 dsh 完全相同的 entryListSchema，`!!js` 表达式无损读写。）
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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

const hostPluginDest = join(profileDir, "node_modules", "dsh-defaults");
const clientPluginDest = join(profileDir, "node_modules", "dsh-client-ui-defaults");
const patchFile = join(profileDir, "cordis.patch.yml");

if (unpatch) {
  if (existsSync(patchFile + ".bak")) {
    cpSync(patchFile + ".bak", patchFile);
    console.log(`已还原 ${patchFile} ← ${patchFile}.bak`);
  } else {
    console.log(`没有备份 ${patchFile}.bak，跳过 patch 文件还原。`);
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

// 1) 复制插件包到 profile node_modules
for (const rel of PLUGIN_FILES) {
  if (!existsSync(join(HOST_PLUGIN_SRC, rel))) fail(`插件源码缺失：${join(HOST_PLUGIN_SRC, rel)}`);
}
for (const rel of CLIENT_PLUGIN_FILES) {
  if (!existsSync(join(CLIENT_PLUGIN_SRC, rel))) fail(`客户端插件源码缺失：${join(CLIENT_PLUGIN_SRC, rel)}`);
}
if (!dryRun) {
  mkdirSync(join(hostPluginDest, "lib"), { recursive: true });
  for (const rel of PLUGIN_FILES) cpSync(join(HOST_PLUGIN_SRC, rel), join(hostPluginDest, rel));
  mkdirSync(join(clientPluginDest, "lib"), { recursive: true });
  for (const rel of CLIENT_PLUGIN_FILES) cpSync(join(CLIENT_PLUGIN_SRC, rel), join(clientPluginDest, rel));
}
console.log(`[1/2] 插件包 → ${hostPluginDest} / ${clientPluginDest} ${dryRun ? "（--dry-run，未写入）" : "✓"}`);

// 2) 合并 cordis.patch.yml
if (!existsSync(patchFile)) fail(`找不到 profile patch 文件：${patchFile}`);
if (!dryRun && !existsSync(patchFile + ".bak")) {
  cpSync(patchFile, patchFile + ".bak");
  console.log(`  已备份 patch 文件 → ${patchFile}.bak`);
}
const current = yaml.load(readFileSync(patchFile, "utf8"), { schema: entryListSchema });
if (!Array.isArray(current)) fail(`patch 文件必须是顶层 YAML 数组：${patchFile}`);

const defaultsRows = [
  { id: "dsh-defaults", name: "dsh-defaults" },
  { id: "ui-dsh-defaults", name: "dsh-client-ui-defaults" },
];

let changed = false;
// 收集所有 insert 块里的行 + 顶层 id 行（幂等判定要覆盖全部 insert，否则会重复追加）。
const insertBlocks = current.filter((e) => typeof e === "object" && e !== null && Array.isArray(e.insert));
const insertEntry = insertBlocks[0];
const hasRow = (id) =>
  insertBlocks.some((block) => block.insert.some((i) => i?.id === id)) ||
  current.some((e) => typeof e === "object" && e !== null && e.id === id);

for (const row of defaultsRows) {
  if (hasRow(row.id)) {
    console.log(`[2/2] ${row.id} 挂载已存在（跳过）`);
  } else if (insertEntry) {
    insertEntry.insert.push(row);
    changed = true;
    console.log(`[2/2] 追加 ${row.id} 插件行`);
  } else {
    current.push({ insert: [row] });
    changed = true;
    console.log(`[2/2] 新增 insert：${row.id}`);
  }
}

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
