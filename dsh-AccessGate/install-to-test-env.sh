#!/usr/bin/env bash
# install-to-test-env.sh —— 把「访问门禁」插件装进工作区测试环境（只写 test-env*，不碰正式）。
# 流程：
#   1) 安装本项目 packages 下的三个 fork（webserver 门闸 / apiproxy 命名空间 / connection 放行）
#      到测试 profile（scripts/test-env-install.sh 显式指定包路径）；
#   2) 用 install-access-gate-plugin.mjs 把两个新插件 + cordis.patch.yml 写入测试 profile，
#      并对测试环境的 settings.yaml 做存量迁移。
# 用法：TEST_ENV_INDEX=1 bash install-to-test-env.sh（环境统一在 test-envs/ 下）
# 之后：DSH_ACCESS_GATE_PASSWORD=test123456 scripts/test-env-start.sh
#       DSH_HOME=$PWD/test-envs/test-env-1 node test-access-gate.mjs
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS_ROOT="$(cd "$HERE/.." && pwd)"
source "$WS_ROOT/scripts/test-env-common.sh"
resolve_test_env

echo "== 测试环境：$TEST_ENV（TEST_ENV_INDEX=${ENV_INDEX:-1}，端口 $PORT）=="
echo "  声明状态：$(usage_status)"
[ -d "$TEST_ENV/profiles/web/node_modules" ] || { echo "✗ 测试环境未初始化，先跑 scripts/test-env-init.sh"; exit 1; }

echo "== [1/2] 安装 fork 包（webserver / apiproxy / connection）到测试 profile =="
mkdir -p "$TEST_ENV/profiles/web/node_modules/@deepseek-ai"
"$WS_ROOT/scripts/test-env-install.sh" \
  "$HERE/packages/dsh-host-webserver" \
  "$HERE/packages/dsh-host-apiproxy" \
  "$HERE/packages/dsh-client-connection"

echo "== [2/2] 安装访问门禁插件 + 合并 cordis.patch.yml + 迁移 settings.yaml =="
node "$HERE/install-access-gate-plugin.mjs" \
  --profile-dir "$TEST_ENV/profiles/web" \
  --dsh-home "$TEST_ENV" \
  --dsh-root /usr/lib/node_modules/@deepseek-ai/dsh

echo
echo "完成。下一步："
echo "  DSH_ACCESS_GATE_PASSWORD=test123456 scripts/test-env-start.sh"
echo "  DSH_HOME=$TEST_ENV node $HERE/test-access-gate.mjs"
echo "  DSH_HOME=$TEST_ENV bash $HERE/verify.sh"
