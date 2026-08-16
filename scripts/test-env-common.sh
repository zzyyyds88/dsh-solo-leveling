#!/usr/bin/env bash
# test-env-common.sh —— 多测试环境解析（被 scripts/test-env-*.sh source）
#
# 环境清单（TEST_ENV_INDEX 选择，默认 1）：
#   1 → test-env/      端口 3090
#   2 → test-env-2/    端口 3091
#   3 → test-env-3/    端口 3092
#   4 → test-env-4/    端口 3093
# 用法：TEST_ENV_INDEX=2 scripts/test-env-start.sh
# 要求（强制，见 AGENTS.md）：使用某环境前先在该环境 USAGE.md 声明项目与用途；
# 用完后 scripts/test-env-reset.sh 恢复官方基线（并清空声明）。
#
# 调用前需定义 WS_ROOT。

resolve_test_env() {
  ENV_INDEX="${TEST_ENV_INDEX:-1}"
  case "$ENV_INDEX" in
    1) TEST_ENV="$WS_ROOT/test-env"; PORT=3090 ;;
    2) TEST_ENV="$WS_ROOT/test-env-2"; PORT=3091 ;;
    3) TEST_ENV="$WS_ROOT/test-env-3"; PORT=3092 ;;
    4) TEST_ENV="$WS_ROOT/test-env-4"; PORT=3093 ;;
    *) echo "✗ 不支持的环境索引 TEST_ENV_INDEX=$ENV_INDEX（支持 1-4）" >&2; exit 1 ;;
  esac
}

# 读取环境的 USAGE.md 声明（若存在）；输出「已声明 / 未声明」。
usage_status() {
  local usage="$TEST_ENV/USAGE.md"
  if [ -f "$usage" ]; then
    local project
    project="$(grep -E '^项目[:：]' "$usage" | head -1 | sed 's/^项目[:：] *//')"
    if [ -n "$project" ] && ! echo "$project" | grep -q "哪个项目在用它"; then
      echo "已声明：$project（用途：$(grep -E '^用途[:：]' "$usage" | head -1 | sed 's/^用途[:：] *//')）"
    else
      echo "未声明（使用前先填写 $TEST_ENV/USAGE.md）"
    fi
  else
    echo "未声明（无 USAGE.md，先运行 scripts/test-env-reset.sh 生成）"
  fi
}
