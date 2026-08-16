#!/usr/bin/env bash
# 把本地构建好的插件包装进测试环境 profile（只写 test-envs/，不碰正式环境）。
# 包需已构建（目录含 lib/ 与 package.json，package.json.name 为 @deepseek-ai/* 或 dsh-*）。
# 覆盖前自动备份现有包为 .bak（回退：把 .bak 拷回）。
# 独占纪律：安装前请确认该环境 USAGE.md 无其他项目声明（claim_test_env 在 start 时强制）。
# 用法：
#   scripts/test-env-install.sh dsh-AccessGate/packages/dsh-host-webserver ...
#   scripts/test-env-install.sh --from-project dsh-AccessGate   # 自动装其 packages/* 下所有已构建包
set -euo pipefail

WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$WS_ROOT/scripts/test-env-common.sh"
resolve_test_env
PROFILE="$TEST_ENV/profiles/web"
DST_ROOT="$PROFILE/node_modules/@deepseek-ai"

[ -d "$DST_ROOT" ] || { echo "✗ 测试 profile 未初始化：$PROFILE（先 scripts/test-env-init.sh）"; exit 1; }

SRCS=()
if [ "${1:-}" = "--from-project" ]; then
  PROJ="$WS_ROOT/$2"
  for d in "$PROJ"/packages/*/; do
    [ -d "$d/lib" ] && [ -f "$d/package.json" ] && SRCS+=("$d")
  done
else
  for d in "$@"; do
    [ "${d#/}" = "$d" ] && d="$WS_ROOT/$d"
    SRCS+=("$d")
  done
fi

[ ${#SRCS[@]} -gt 0 ] || { echo "✗ 没有可安装的包（目录需含 lib/ 与 package.json）"; exit 1; }

echo "== 安装到测试 profile：$PROFILE =="
for src in "${SRCS[@]}"; do
  [ -d "$src/lib" ] || { echo "  ✗ 未构建（无 lib/）：$src"; exit 1; }
  name="$(node -e "console.log(require('$src/package.json').name)")"
  dst="$DST_ROOT/${name#@deepseek-ai/}"
  if [ -d "$dst" ]; then
    rm -rf "$dst.bak"
    cp -a "$dst" "$dst.bak"
    echo "  备份旧包 → $dst.bak"
  fi
  mkdir -p "$dst"
  rm -rf "$dst/lib"
  cp -a "$src/lib" "$dst/lib"
  cp "$src/package.json" "$dst/package.json"
  echo "  ✓ $name"
done
echo
echo "完成。重启测试实例生效："
echo "  scripts/test-env-stop.sh && scripts/test-env-start.sh"
echo "回退某包：把 test-env/profiles/web/node_modules/@deepseek-ai/<包名>.bak 拷回 <包名>。"
