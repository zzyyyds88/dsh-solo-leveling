#!/usr/bin/env bash
# 把测试环境恢复到「正式克隆基线」：清掉测试期间叠加的改动（fork 覆盖、本地插件、
# patch 配置、测试设置、.bak 残留），重建为从正式 profile 克隆的基线（含已装插件）。
#
# ⚠ 验收门（强制）：必须带 --verified（用户验收通过后才允许清理）。
#   不带参数直接拒绝，防止 Agent 误清未验收环境。
#
# 铁律：只动 test-envs/，绝不触碰正式环境（$HOME/.dsh / 3080 / 全局安装）。
#
# 用法：
#   scripts/test-env-reset.sh --verified   # 用户验收后：重建为正式克隆基线（清测试改动 + 声明）
#   scripts/test-env-reset.sh --check      # 检查当前是否已是基线（实例停、声明空、无残留）
set -euo pipefail

WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$WS_ROOT/scripts/test-env-common.sh"
resolve_test_env
PROFILE="$TEST_ENV/profiles/web"

CHECK=0
VERIFIED=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    --verified) VERIFIED=1 ;;
    *) echo "✗ 未知参数: $arg（支持 --check / --verified）" >&2; exit 1 ;;
  esac
done

# 验收门：清理动作必须 --verified（--check 豁免）
if [ "$CHECK" -ne 1 ]; then
  verified_gate "$@"
fi

if [ "$CHECK" -eq 1 ]; then
  echo "== 检查测试环境是否为基线状态：$TEST_ENV =="
  ISSUES=0
  [ -f "$TEST_ENV/dsh-web.pid" ] && kill -0 "$(cat "$TEST_ENV/dsh-web.pid")" 2>/dev/null \
    && { echo "  ✗ 测试实例运行中（先 stop）"; ISSUES=1; }
  for stray in dsh-web.pid dsh-web.log pet.json; do
    [ -e "$TEST_ENV/$stray" ] && { echo "  ✗ 测试残留: $stray"; ISSUES=1; }
  done
  # 测试期间备份的 fork 残留
  if [ -d "$PROFILE/node_modules/@deepseek-ai" ]; then
    local_pkgs="$(ls -d "$PROFILE/node_modules/@deepseek-ai"/*.bak 2>/dev/null | wc -l || true)"
    [ "$local_pkgs" -gt 0 ] && { echo "  ✗ 有 .bak fork 备份残留"; ISSUES=1; }
  fi
  # 本地插件残留：仅检测「非正式基线」的测试期插件（access-gate /
  # dsh-mobile-adapt 已是正式基线内容，不算残留）
  for pkg in dsh-defaults dsh-client-ui-defaults dsh-deepseekpet; do
    [ -d "$PROFILE/node_modules/$pkg" ] && { echo "  ✗ 本地插件残留: $pkg"; ISSUES=1; }
  done
  if [ -f "$PROFILE/cordis.patch.yml" ]; then
    if grep -qE "dsh-defaults|deepseek-pet" "$PROFILE/cordis.patch.yml" 2>/dev/null; then
      echo "  ✗ cordis.patch.yml 含测试期定制挂载（基线只保留正式环境已有的配置）"
      ISSUES=1
    fi
  fi
  if [ -f "$TEST_ENV/USAGE.md" ]; then
    project="$(grep -E '^项目[:：]' "$TEST_ENV/USAGE.md" | head -1 | sed 's/^项目[:：] *//')"
    if [ -n "$project" ] && ! echo "$project" | grep -q "哪个项目在用它"; then
      echo "  ✗ USAGE.md 仍有使用声明（项目：$project）——验收后声明应已清空"; ISSUES=1
    fi
  fi
  [ "$ISSUES" -eq 0 ] && echo "  ✓ 已是基线状态（正式克隆基线，无测试期改动）" || echo "  ✗ 存在 $ISSUES 处残留（运行 scripts/test-env-reset.sh --verified 重建）"
  exit "$ISSUES"
fi

# ---- 验收通过，重建基线 ----
echo "== 用户已验收，重建测试环境为正式克隆基线：$TEST_ENV =="
[ "$VERIFIED" -eq 1 ] || exit 1   # 防御：上面的 gate 已保证，但保持显式

# 停实例（若有）
if [ -f "$TEST_ENV/dsh-web.pid" ] && kill -0 "$(cat "$TEST_ENV/dsh-web.pid")" 2>/dev/null; then
  echo "  停止测试实例…"
  bash "$WS_ROOT/scripts/test-env-stop.sh"
fi

# 重建：复用 init --force（删除旧环境 → 从正式 profile 克隆基线 + 最小测试设置 + USAGE 模板）
bash "$WS_ROOT/scripts/test-env-init.sh" --force

echo
echo "== 完成。测试环境已重建为正式克隆基线 =="
echo "  - profile 从正式环境克隆（含已装插件/fork，贴近真实环境）"
echo "  - settings.yaml 为最小测试设置（不复制正式口令/密钥）"
echo "  - USAGE.md 使用声明已清空"
echo "  - 启动：scripts/test-env-start.sh（TEST_ENV_INDEX=$ENV_INDEX，端口 $PORT）"
