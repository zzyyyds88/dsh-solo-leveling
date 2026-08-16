#!/usr/bin/env node
/**
 * install-pet-plugin.mjs — 安装/卸载 deepseek-pet 桌宠插件（幂等，可重复执行）
 *
 * 做两件事：
 *   1) 把 deepseek-pet 包（package.json + lib/ + cordis.patch.yml）复制到
 *      web profile 的 node_modules/deepseek-pet（裸包名，Loader 以 profile
 *      目录为加载基准解析；本包不是 @deepseek-ai/* 前缀，不适用
 *      scripts/test-env-install.sh）。
 *   2) 把 web profile 的 cordis.patch.yml 升级为追加：
 *        - insert: deepseek-pet → 挂载桌宠插件
 *      （等价于上游包自带 cordis.patch.yml 的内容，幂等去重）。
 *
 * YAML 合并用与 dsh 完全相同的 entryListSchema（含 `!!js` 表达式标签），
 * 与「访问门禁」项目的 install-access-gate-plugin.mjs 同一套实现。
 *
 * 用法：
 *   node install-pet-plugin.mjs                # 安装（幂等）
 *   node install-pet-plugin.mjs --dry-run      # 只检查，不写入
 *   node install-pet-plugin.mjs --unpatch      # 卸载：还原 patch 文件(.bak)并删除插件目录
 *   node install-pet-plugin.mjs --profile-dir <路径> # 指定 profile 目录（自动推导时可不填）
 *   node install-pet-plugin.mjs --dsh-home <路径>    # 指定 DSH_HOME（默认 ~/.dsh）
 *   node install-pet-plugin.mjs --allow-formal # 显式允许写入非 test-env* profile（仅用户手动）
 *
 * 退出码：0 = 已是最新/处理完成；2 = 失败（已打印原因）。
 */
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_SRC = HERE; // deepseek-pet 项目根（本脚本所在目录）
const PLUGIN_FILES = ["package.json", "lib/index.js", "lib/client.js", "cordis.patch.yml"];

const DSH_DEFAULT_HOME = process.env.DSH_HOME ?? join(os.homedir(), ".dsh");

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
const optValue = (name) => {
  const at = args.indexOf(name);
  return at !== -1 ? args[at + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const unpatch = args.includes("--unpatch");
const allowFormal = args.includes("--allow-formal");
const dshHome = optValue("--dsh-home") ?? DSH_DEFAULT_HOME;
const profileDir = optValue("--profile-dir") ?? join(dshHome, "profiles", "web");

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(2);
};

// ---------- 安全闸：除显式指定 test-env* 目录外，一律视为正式环境 ----------
// （正式安装本就应由用户在 SSH 终端手动执行，见 AGENTS.md；防止参数笔误误伤正式 profile。）
if (!/test-env[\d-]*[\\/]/.test(profileDir.replace(/\\/g, "/")) && !allowFormal) {
  fail(
    `目标 profile 不是测试环境（${profileDir}），已拒绝写入。\n` +
    "如确认要对正式 profile 安装（请先在 SSH 终端停止 dsh web），加 --allow-formal 参数。"
  );
}

// ---------- YAML（与 dsh 同 schema） ----------
const dshRoot = "/usr/lib/node_modules/@deepseek-ai/dsh";
const require = createRequire(join(dshRoot, "package.json"));
const yaml = require("js-yaml");
const { entryListSchema } = require("@deepseek-ai/cordis-plugin-include");

const patchFile = join(profileDir, "cordis.patch.yml");
if (!existsSync(patchFile)) fail(`找不到 profile patch 文件：${patchFile}`);

console.log(`web profile：${profileDir}`);
console.log(`插件源码：${PLUGIN_SRC}`);
console.log(`模式：${dryRun ? "--dry-run（只检查不写入）" : unpatch ? "卸载（--unpatch）" : "安装"}`);

// ---------- 卸载路径 ----------
if (unpatch) {
  const backup = patchFile + ".bak";
  if (existsSync(backup)) {
    if (!dryRun) {
      cpSync(backup, patchFile);
      console.log(`已还原 ${patchFile} ← ${backup}`);
    } else {
      console.log(`（dry-run）将还原 ${patchFile} ← ${backup}`);
    }
  } else {
    console.log(`没有备份 ${backup}，跳过 patch 文件还原。`);
  }
  const pluginDest = join(profileDir, "node_modules", "deepseek-pet");
  if (existsSync(pluginDest)) {
    if (!dryRun) {
      rmSync(pluginDest, { recursive: true, force: true });
      console.log(`已删除插件目录：${pluginDest}`);
    } else {
      console.log(`（dry-run）将删除插件目录：${pluginDest}`);
    }
  }
  console.log(unpatch && !dryRun ? "== 卸载完成 ==" : "== dry-run 预览结束 ==");
  process.exit(0);
}

// ---------- 1) 复制插件包 ----------
for (const rel of PLUGIN_FILES) {
  const src = join(PLUGIN_SRC, rel);
  if (!existsSync(src)) fail(`插件源码缺失：${src}`);
}
const pluginDest = join(profileDir, "node_modules", "deepseek-pet");
if (!dryRun) {
  mkdirSync(join(pluginDest, "lib"), { recursive: true });
  for (const rel of PLUGIN_FILES) {
    cpSync(join(PLUGIN_SRC, rel), join(pluginDest, rel));
  }
}
console.log(`[1/2] 插件包 → ${pluginDest} ${dryRun ? "（--dry-run，未写入）" : "✓"}`);

// ---------- 2) 合并 cordis.patch.yml ----------
const current = yaml.load(readFileSync(patchFile, "utf8"), { schema: entryListSchema });
if (!Array.isArray(current)) fail(`patch 文件必须是顶层 YAML 数组：${patchFile}`);

// 备份原始 patch（卸载时还原用）；已存在备份则保留首次备份
const backup = patchFile + ".bak";
if (!existsSync(backup) && !dryRun) {
  writeFileSync(backup, readFileSync(patchFile));
  console.log(`[2/2] 备份原始 patch → ${backup}`);
}

const PET_INSERT = {
  insert: [{ id: "deepseek-pet", name: "deepseek-pet" }],
};

/** 已存在 deepseek-pet 挂载行？ */
const hasPetRow = () =>
  current.some((e) => typeof e === "object" && e !== null && Array.isArray(e.insert) &&
    e.insert.some((i) => i && i.id === "deepseek-pet")) ||
  current.some((e) => typeof e === "object" && e !== null && e.id === "deepseek-pet");

let changed = false;
if (hasPetRow()) {
  console.log("[2/2] deepseek-pet 挂载已存在（跳过）");
} else {
  const insertEntry = current.find((e) => typeof e === "object" && e !== null && Array.isArray(e.insert));
  if (insertEntry) {
    insertEntry.insert.push(PET_INSERT.insert[0]);
  } else {
    current.push(PET_INSERT);
  }
  changed = true;
  console.log("[2/2] 追加 deepseek-pet 插件行");
}

if (changed && !dryRun) {
  writeFileSync(patchFile, yaml.dump(current, { schema: entryListSchema, lineWidth: 120 }));
  console.log("  已写入 " + patchFile);
} else if (changed && dryRun) {
  console.log("  （dry-run）将写入 deepseek-pet 插件行");
}

console.log(dryRun ? "== dry-run 预览结束 ==" : "== 完成。重启测试实例生效：scripts/test-env-stop.sh && scripts/test-env-start.sh ==");
process.exit(0);
