#!/usr/bin/env bash
# install-to-test-env.sh —— 把 deepseek-pet 桌宠插件装进工作区测试环境（只写 test-env*，不碰正式）。
# 流程：
#   1) 前置校验：测试环境已初始化（profiles/web/node_modules 存在）；
#   2) 用 install-pet-plugin.mjs 把插件包 + cordis.patch.yml 写入测试 profile。
# 用法：TEST_ENV_INDEX=2 bash install-to-test-env.sh
# 之后：TEST_ENV_INDEX=2 scripts/test-env-start.sh
#       TEST_ENV_INDEX=2 bash verify.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS_ROOT="$(cd "$HERE/.." && pwd)"
source "$WS_ROOT/scripts/test-env-common.sh"
resolve_test_env

echo "== 测试环境：$TEST_ENV（TEST_ENV_INDEX=${ENV_INDEX:-1}，端口 $PORT）=="
echo "  声明状态：$(usage_status)"
[ -d "$TEST_ENV/profiles/web/node_modules" ] || { echo "✗ 测试环境未初始化，先跑 scripts/test-env-init.sh"; exit 1; }

echo "== 安装 deepseek-pet 到测试 profile =="
node "$HERE/install-pet-plugin.mjs" \
  --profile-dir "$TEST_ENV/profiles/web" \
  --dsh-home "$TEST_ENV"

echo
echo "完成。下一步："
echo "  TEST_ENV_INDEX=${ENV_INDEX:-1} scripts/test-env-start.sh"
echo "  TEST_ENV_INDEX=${ENV_INDEX:-1} bash $HERE/verify.sh"
