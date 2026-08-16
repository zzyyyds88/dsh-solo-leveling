#!/usr/bin/env bash
# install-to-test-env.sh —— 把 dsh-task-suite 套件装进工作区测试环境（只写 test-env*，不碰正式）。
# 前置：已构建（bash build.sh）；测试环境已初始化（scripts/test-env-init.sh）。
# 用法：SKIN=maid-atelier TEST_ENV_INDEX=1 bash install-to-test-env.sh
#       SKIN=null（不启用皮肤）
# 之后：scripts/test-env-stop.sh && scripts/test-env-start.sh，再 bash verify.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS_ROOT="$(cd "$HERE/.." && pwd)"
source "$WS_ROOT/scripts/test-env-common.sh"
resolve_test_env

echo "== 测试环境：$TEST_ENV（TEST_ENV_INDEX=${ENV_INDEX:-1}，端口 $PORT）=="
echo "  声明状态：$(usage_status)"
[ -d "$TEST_ENV/profiles/web/node_modules" ] || { echo "✗ 测试环境未初始化，先跑 scripts/test-env-init.sh"; exit 1; }

echo "== 安装 dsh-task-suite 到测试 profile =="
node "$HERE/install-suite-plugin.mjs" \
  --profile-dir "$TEST_ENV/profiles/web" \
  --dsh-home "$TEST_ENV" \
  --skin "${SKIN:-maid-atelier}"

# host 端插件的运行时第三方依赖（schemastery/zod）须落在 profile node_modules
# （@deepseek-ai/* 由 loader 从全局安装回退解析，无需装）。hoisted 布局与官方
# profile 一致；已存在则跳过。
echo "== 运行时第三方依赖（schemastery / zod）=="
if [ -d "$TEST_ENV/profiles/web/node_modules/schemastery" ] && [ -d "$TEST_ENV/profiles/web/node_modules/zod" ]; then
  echo "  （已存在，跳过）"
else
  (cd "$TEST_ENV/profiles/web" && pnpm add schemastery@^3.18.0 zod@^4.4.3) || {
    echo "✗ pnpm add 运行时依赖失败（网络？）—— 也可手动从官方 profile 复制对应包"; exit 1; }
fi

echo
echo "完成。下一步："
echo "  scripts/test-env-stop.sh && scripts/test-env-start.sh"
echo "  bash $HERE/verify.sh"
