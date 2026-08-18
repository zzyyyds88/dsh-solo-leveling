#!/usr/bin/env bash
# package-npm.sh —— 把「大宝贝定制版」dsh CLI 及其 workspace 依赖打包成 npm tarball。
#
# 用途：完成定义 §8 的「打包成 npm 包」步骤。产出 dsh CLI tarball（含第一方插件
# 装配在 dsh-web-app bundle 里）。本地给用户测试可先 tarball 安装；正式发布需先
# 换个人 scope（@deepseek-ai 归官方所有，无法发布），见 docs/整合迁移路线图.md §8。
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

echo "== 2/3 打包 dsh CLI =="
rm -rf dist/npm && mkdir -p dist/npm
# 先 pack dsh CLI 自身；其 workspace:^ 依赖由 pnpm 解析成实际版本号。
pnpm --filter "@deepseek-ai/dsh" pack --pack-destination dist/npm

echo "== 3/3 打包 workspace 依赖（dsh-web-app / dsh-base / 第一方插件 / 8 fork）=="
# dsh CLI 的依赖树：bundle 层（web-app 装配第一方插件）+ 第一方插件 + 8 个 fork 包。
# 逐个 pack（workspace 依赖会被解析成版本号，但 tarball 需一起提供给用户安装）。
for pkg in \
  "@deepseek-ai/dsh-web-app" "@deepseek-ai/dsh-base" \
  "@deepseek-ai/dsh-host-access-gate" "@deepseek-ai/dsh-host-git-graph" "@deepseek-ai/dsh-host-aionui-panel" \
  "@deepseek-ai/dsh-client-ui-access-gate" "@deepseek-ai/dsh-client-ui-defaults" \
  "@deepseek-ai/dsh-client-ui-mobile-adapt" "@deepseek-ai/dsh-client-ui-pet" \
  "@deepseek-ai/dsh-client-ui-task-board" "@deepseek-ai/dsh-client-ui-live-stats" \
  "@deepseek-ai/dsh-client-ui-describe-image" "@deepseek-ai/dsh-client-ui-git-graph" \
  "@deepseek-ai/dsh-client-ui-aionui-panel" "@deepseek-ai/dsh-client-ui-skin-maid-atelier" \
  "@deepseek-ai/dsh-client-ui-skin-center" "@deepseek-ai/dsh-defaults" \
  "@deepseek-ai/dsh-host-webserver" "@deepseek-ai/dsh-host-apiproxy" \
  "@deepseek-ai/dsh-client-connection" "@deepseek-ai/dsh-client-ui-settings" \
  "@deepseek-ai/dsh-host-directory-picker-browse" "@deepseek-ai/dsh-llm" \
  "@deepseek-ai/dsh-llm-deepseek" "@deepseek-ai/dsh-llm-pi-ai"; do
  pnpm --filter "$pkg" pack --pack-destination dist/npm 2>/dev/null || echo "  （跳过 $pkg：无该包）"
done

echo
echo "== 完成。tarball 列表：=="
ls -1 dist/npm/*.tgz | sed 's/^/  /'
echo
echo "本地测试（用户侧）："
echo "  npm i -g ./dist/npm/*.tgz   # 或逐个安装"
echo "  dsh web --port 3090"
echo "正式发布：换个人 scope（--scope @zzyyyds88）后 pnpm publish 全部 tarball；"
echo "  @deepseek-ai scope 归官方所有，无法发布（见 docs/整合迁移路线图.md §8）。"
