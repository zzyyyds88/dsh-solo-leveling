#!/usr/bin/env bash
# test-env-common.sh —— 多测试环境解析（被 scripts/test-env-*.sh source）
#
# 环境清单（TEST_ENV_INDEX 选择，默认 1），统一收纳在 test-envs/ 下：
#   1 → test-envs/test-env-1   端口 3090
#   2 → test-envs/test-env-2   端口 3091
#   3 → test-envs/test-env-3   端口 3092
#   4 → test-envs/test-env-4   端口 3093
# 用法：TEST_ENV_INDEX=2 scripts/test-env-start.sh
#
# 纪律（强制，见 AGENTS.md）：
#   - 独占：同一时刻一个测试环境只允许一个 Agent 使用（USAGE.md 声明 + 端口占用校验）；
#   - 验收门：测试环境恢复基线必须带 --verified（用户验收后才允许清理）；
#   - 基线：从正式 profile 克隆（含已装插件/fork），不是纯官方空模板。
#
# 调用前需定义 WS_ROOT。

resolve_test_env() {
  ENV_INDEX="${TEST_ENV_INDEX:-1}"
  case "$ENV_INDEX" in
    1) TEST_ENV="$WS_ROOT/test-envs/test-env-1"; PORT=3090 ;;
    2) TEST_ENV="$WS_ROOT/test-envs/test-env-2"; PORT=3091 ;;
    3) TEST_ENV="$WS_ROOT/test-envs/test-env-3"; PORT=3092 ;;
    4) TEST_ENV="$WS_ROOT/test-envs/test-env-4"; PORT=3093 ;;
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
    echo "未声明（无 USAGE.md，先运行 scripts/test-env-init.sh 生成）"
  fi
}

# 独占检查：若环境已被其他项目声明使用（USAGE.md 有非空项目且非本项目的），
# 输出错误并退出。参数：$1 = 当前使用项目名（可选，用于豁免本项目已占用）。
# 用法：claim_test_env "dsh-AccessGate"
claim_test_env() {
  local claimer="${1:-}"
  local usage="$TEST_ENV/USAGE.md"
  if [ -f "$usage" ]; then
    local project
    project="$(grep -E '^项目[:：]' "$usage" | head -1 | sed 's/^项目[:：] *//')"
    if [ -n "$project" ] && ! echo "$project" | grep -q "哪个项目在用它"; then
      if [ -n "$claimer" ] && [ "$project" = "$claimer" ]; then
        return 0   # 本项目已声明占用，允许复用
      fi
      echo "✗ 测试环境 $TEST_ENV 已被占用：$project（独占原则：同一时刻一个环境只归一个项目）" >&2
      echo "  请换 TEST_ENV_INDEX 使用其他环境，或先由占用方 scripts/test-env-reset.sh --verified 清理。" >&2
      exit 1
    fi
  fi
}

# 验收门检查：reset/清理操作必须带 --verified（用户验收后才允许清理）。
# 参数：$@ = 脚本全部参数；输出 0 表示允许清理。
verified_gate() {
  for arg in "$@"; do
    [ "$arg" = "--verified" ] && return 0
  done
  echo "✗ 拒绝清理：恢复基线必须带 --verified（用户验收通过后才允许清理测试环境）" >&2
  echo "  用法：scripts/test-env-reset.sh --verified" >&2
  exit 1
}
