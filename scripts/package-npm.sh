#!/usr/bin/env bash
# package-npm.sh —— 把「大宝贝定制版」dsh CLI 及其全部 workspace 依赖打包成 npm tarball。
#
# 用途：完成定义 §8 的「打包成 npm 包」步骤。产出 dsh CLI tarball（含第一方插件
# 装配在 dsh-web-app bundle 里）。
#
# 版本策略（关键）：本仓库所有 workspace 包版本号均带 `-local.1` 本地后缀
# （如 0.1.0-rc.7-local.1）。官方 @deepseek-ai 包已在 registry 发布更高版本
# （如 0.1.0-rc.8），若不区分版本，`npm i -g ./dist/npm/*.tgz` 时 npm 按
# semver「最高版本优先」会从 registry 拉官方包覆盖本仓库的 fork 定制。
# 本地后缀使本地版本恒高于官方（非数字 prerelease 段 > 数字段），且官方不会
# 发布带 `-local.` 后缀的版本 → 安装时必然使用本仓库 tarball。
#
# 用法：
#   bash scripts/package-npm.sh [--scope @zzyyyds88]
#   产出：dist/npm/<name>-<version>.tgz（dsh CLI + 全部 workspace 依赖包）
set -euo pipefail

WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WS_ROOT"

SCOPE="@deepseek-ai"
while [ $# -gt 0 ]; do
  case "$1" in
    --scope) SCOPE="$2"; shift ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
  shift
done

echo "== 1/3 构建（pnpm run build）=="
pnpm run build

echo "== 2/3 打包全部 workspace 包（dsh CLI + vendor fork + packages/*/*）=="
rm -rf dist/npm && mkdir -p dist/npm
# 逐个 pack 整个 workspace（vendor/*、packages/*/*、apps/*、native、website、
# examples）；个别包 pack 失败时跳过（如平台不匹配的 native 构建），其余照常产出。
# 版本号带 -local.1 本地后缀（见文件头说明），确保 npm 安装时不被官方包覆盖。
node -e '
const { execFileSync } = require("node:child_process")
const { globSync } = require("node:fs")
for (const file of globSync("{vendor/*,packages/*/*,apps/*,native/*,native/landlock-run/packages/*,website,examples}/package.json")) {
  try {
    const pkg = JSON.parse(require("node:fs").readFileSync(file, "utf8"))
    if (!pkg.name) continue
    try {
      execFileSync("pnpm", ["--filter", pkg.name, "pack", "--pack-destination", "dist/npm"], { stdio: "ignore" })
    } catch {
      console.log("  （跳过 " + pkg.name + "：pack 失败）")
    }
  } catch { /* 非 JSON 等，忽略 */ }
}
'

echo
echo "== 完成。tarball 列表：=="
ls -1 dist/npm/*.tgz | sed 's/^/  /'
echo
echo "本地测试（用户侧）："
echo "  npm i -g ./dist/npm/*.tgz   # 或逐个安装"
echo "  dsh web                     # 默认 HTTPS：https://0.0.0.0:3080"
echo "正式发布：换个人 scope（--scope @zzyyyds88）后 pnpm publish 全部 tarball；"
echo "  @deepseek-ai scope 归官方所有，无法发布（见 docs/整合迁移路线图.md §8）。"
