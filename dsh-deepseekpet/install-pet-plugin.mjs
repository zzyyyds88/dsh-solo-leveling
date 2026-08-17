#!/usr/bin/env node
/**
 * install-pet-plugin.mjs — 安装/卸载 deepseek-pet 桌宠插件（幂等，可重复执行）
 *
 * 做两件事：
 *   1) 标准安装 deepseek-pet（上游已是标准插件包：dsh.bundle.patch 声明包内
 *      cordis.patch.yml）。已标准安装（bundles 含包名）则跳过；否则
 *      npm pack → dsh plugin --profile web add（不再手工拷目录）。
 *   2) 收敛 web profile 的 cordis.patch.yml：移除 deepseek-pet 残留行
 *      （标准安装下挂载在 bundle 层，用户层残留会 duplicate 崩溃）。
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
 *   node install-pet-plugin.mjs --dsh-root <路径>    # 指定 dsh 安装根（自动搜索时可不填）
 *   node install-pet-plugin.mjs --allow-formal # 显式允许写入非 test-env* profile（仅用户手动）
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
const profileDir = optValue("--profile-dir") ?? join(DSH_DEFAULT_HOME, "profiles", "web");
// DSH_HOME 必须与 --profile-dir 对应（profiles/web 的父父目录），不要用 process.env.DSH_HOME——
// 否则在 DSH_HOME=/root/.dsh 的宿主 shell 里会把 dsh plugin add/remove 误装到正式环境。
const dshHome = optValue("--dsh-home") ?? dirname(dirname(profileDir));

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

// 端口监听硬守卫（红线 4）：正式 profile 安装前必须已停 dsh web。运行中改写
// cordis.patch.yml / settings.yaml 会触发热重载、崩掉承载会话的进程。
function formalWebListening() {
  const r = spawnSync("ss", ["-tlnp"], { encoding: "utf8" });
  return /:(3080)\b/.test((r.stdout ?? "") + (r.stderr ?? ""));
}
if (!/test-env[\d-]*[\\/]/.test(profileDir.replace(/\\/g, "/")) && formalWebListening()) {
  fail(
    "检测到正式 dsh web 仍在运行（端口 3080）。请先停止服务再执行安装：\n" +
    "  （运行中改写 cordis.patch.yml / settings.yaml 会热重载崩掉会话）"
  );
}

// ---------- YAML（与 dsh 同 schema） ----------
const CANDIDATE_DSH_ROOTS = [
  "/usr/lib/node_modules/@deepseek-ai/dsh",
  "/usr/local/lib/node_modules/@deepseek-ai/dsh",
];
const dshRootOpt = optValue("--dsh-root");
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
const dshRoot = findDshRoot(dshRootOpt);
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
  // 标准卸载：dsh plugin remove 同时清理 node_modules 与 profile bundles 条目
  // （直接 rmSync 会残留 bundles 条目，下次启动解析缺失 bundle 失败）。
  if (!dryRun) {
    const profileName = basename(profileDir);
    const rm = spawnSync("dsh", ["plugin", "--profile", profileName, "remove", "deepseek-pet"], {
      cwd: profileDir,
      env: { ...process.env, DSH_HOME: dshHome },
      encoding: "utf8",
    });
    if (rm.status !== 0) {
      console.log("  （dsh plugin remove 未成功，回退为目录删除兜底）");
    }
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

// ---------- 1) 标准安装插件包（dsh plugin add：装 node_modules + 进 profile bundles） ----------
const hasBundleEntry = (name) => {
  try {
    const manifest = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8"));
    return (manifest.dsh?.profile?.bundles ?? []).includes(name);
  } catch { return false; }
};
if (hasBundleEntry("deepseek-pet")) {
  console.log("[1/2] deepseek-pet 已标准安装（bundles 含 deepseek-pet，跳过）");
} else if (dryRun) {
  console.log("  （--dry-run，将 npm pack → dsh plugin --profile web add）");
} else {
  for (const rel of PLUGIN_FILES) {
    const src = join(PLUGIN_SRC, rel);
    if (!existsSync(src)) fail(`插件源码缺失：${src}`);
  }
  const packTmp = mkdtempSync(join(tmpdir(), "pet-pack-"));
  const packed = spawnSync("npm", ["pack", "--pack-destination", packTmp, "--silent"], { cwd: PLUGIN_SRC, encoding: "utf8" });
  if (packed.status !== 0) fail(`npm pack 失败：${packed.stderr ?? packed.stdout}`);
  const tgzName = packed.stdout.trim().split("\n").pop().trim();
  if (!tgzName.endsWith(".tgz")) fail(`npm pack 输出异常：${tgzName}`);
  const profileName = basename(profileDir);
  const add = spawnSync("dsh", ["plugin", "--profile", profileName, "add", join(packTmp, tgzName)], {
    cwd: profileDir,
    env: { ...process.env, DSH_HOME: dshHome },
    encoding: "utf8",
  });
  if (add.status !== 0) fail(`dsh plugin add 失败（exit ${add.status}）：${add.stderr ?? add.stdout}`);
  console.log("[1/2] 标准安装 deepseek-pet → bundles 已加入 ✓");
}

// ---------- 2) 收敛用户层 patch：移除 deepseek-pet 残留行 ----------
//    （标准插件包安装下挂载由 bundle 层 dsh.bundle.patch 承担；残留行会 duplicate 崩溃）
const current = yaml.load(readFileSync(patchFile, "utf8"), { schema: entryListSchema });
if (!Array.isArray(current)) fail(`patch 文件必须是顶层 YAML 数组：${patchFile}`);

// 备份原始 patch（卸载时还原用）；已存在备份则保留首次备份
const backup = patchFile + ".bak";
if (!existsSync(backup) && !dryRun) {
  writeFileSync(backup, readFileSync(patchFile));
  console.log(`[2/2] 备份原始 patch → ${backup}`);
}

let changed = false;
for (const entry of current) {
  if (typeof entry !== "object" || entry === null) continue;
  if (Array.isArray(entry.insert)) {
    const before = entry.insert.length;
    entry.insert = entry.insert.filter((i) => !(i && i.id === "deepseek-pet"));
    if (entry.insert.length !== before) { changed = true; console.log("[2/2] 已移除用户层残留行（deepseek-pet）"); }
  }
}
const filtered = current.filter((e) => !(typeof e === "object" && e !== null && typeof e.id === "string" && e.id === "deepseek-pet"));
if (filtered.length !== current.length) { changed = true; console.log("[2/2] 已移除顶层残留行（deepseek-pet）"); }
current.length = 0;
current.push(...filtered);

if (changed && !dryRun) {
  writeFileSync(patchFile, yaml.dump(current, { schema: entryListSchema, lineWidth: 120 }));
  console.log("  已写入 " + patchFile);
} else if (changed && dryRun) {
  console.log("  （dry-run）将收敛 deepseek-pet 残留行");
} else {
  console.log("[2/2] 用户层 patch 无 deepseek-pet 残留行（标准安装模式）");
}

console.log(dryRun ? "== dry-run 预览结束 ==" : "== 完成。重启测试实例生效：scripts/test-env-stop.sh && scripts/test-env-start.sh ==");
process.exit(0);
