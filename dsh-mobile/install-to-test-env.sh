#!/usr/bin/env bash
# 把构建好的 dsh-mobile-adapt 装进工作区测试环境（只写 test-envs/，不碰正式环境）。
# 用法：bash install-to-test-env.sh            # 默认 TEST_ENV_INDEX=1
#       TEST_ENV_INDEX=2 bash install-to-test-env.sh
# 覆盖前自动备份现有包为 .bak（回退：把 .bak 拷回 node_modules/dsh-mobile-adapt）。
set -euo pipefail

WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_INDEX="${TEST_ENV_INDEX:-1}"
case "$ENV_INDEX" in
  1) TEST_ENV="$WS_ROOT/test-envs/test-env-1" ;;
  2) TEST_ENV="$WS_ROOT/test-envs/test-env-2" ;;
  3) TEST_ENV="$WS_ROOT/test-envs/test-env-3" ;;
  4) TEST_ENV="$WS_ROOT/test-envs/test-env-4" ;;
  *) echo "✗ 不支持的环境索引 TEST_ENV_INDEX=$ENV_INDEX" >&2; exit 1 ;;
esac

[ -d "$PROJECT_DIR/lib" ] || { echo "✗ 未构建（无 lib/），先 bash build.sh"; exit 1; }

DST="$TEST_ENV/profiles/web/node_modules/dsh-mobile-adapt"
mkdir -p "$DST"

if [ -f "$DST/package.json" ] || [ -d "$DST/lib" ]; then
  rm -rf "$DST.bak"
  cp -a "$DST" "$DST.bak"
  echo "  备份旧包 → $DST.bak"
fi

rm -rf "$DST/lib"
cp -a "$PROJECT_DIR/lib" "$DST/lib"
cp "$PROJECT_DIR/package.json" "$DST/package.json"
echo "  ✓ dsh-mobile-adapt 已装进 $TEST_ENV"

echo
echo "完成。重启测试实例生效："
echo "  scripts/test-env-stop.sh && scripts/test-env-start.sh"
echo "回退：把 $DST.bak 拷回 $DST。"
