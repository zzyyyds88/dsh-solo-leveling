#!/usr/bin/env bash
# 把构建好的 dsh-mobile-adapt 装进工作区测试环境（只写 test-envs/，不碰正式环境）。
# 标准插件包安装：npm pack → dsh plugin --profile web add（bundles 挂载，包内
# cordis.patch.yml 承担挂载清单）；不再手工拷目录/写用户层 patch 行。
# 用法：bash install-to-test-env.sh            # 默认 TEST_ENV_INDEX=1
#       TEST_ENV_INDEX=2 bash install-to-test-env.sh
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

PROFILE="$TEST_ENV/profiles/web"
[ -d "$PROFILE/node_modules" ] || { echo "✗ 测试环境未初始化，先跑 scripts/test-env-init.sh"; exit 1; }

# 已标准安装（bundles 含包名）→ 跳过
if node -e "const p=require('$PROFILE/package.json'); process.exit((p.dsh?.profile?.bundles ?? []).includes('dsh-mobile-adapt')?0:1)" 2>/dev/null; then
  echo "✓ dsh-mobile-adapt 已标准安装（bundles 已含，跳过）"
else
  echo "== 标准安装 dsh-mobile-adapt（npm pack → dsh plugin add）=="
  PACK_DIR="$(mktemp -d)"
  TGZ="$(cd "$PROJECT_DIR" && npm pack --pack-destination "$PACK_DIR" --silent 2>/dev/null | tail -1)"
  [ -n "$TGZ" ] && [ -f "$PACK_DIR/$TGZ" ] || { echo "✗ npm pack 失败"; exit 1; }
  DSH_HOME="$TEST_ENV" dsh plugin --profile web add "$PACK_DIR/$TGZ"
  echo "  ✓ dsh-mobile-adapt 已装进 $TEST_ENV（bundles 挂载，重启后生效）"
fi

echo
echo "完成。重启测试实例生效："
echo "  scripts/test-env-stop.sh && scripts/test-env-start.sh"
