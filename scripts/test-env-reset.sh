#!/usr/bin/env bash
# 把测试环境恢复到「官方基线」：移除所有本地定制痕迹（fork 包、本地插件、
# cordis.patch.yml 配置、测试设置、.bak 残留），重建为官方模板 profile。
# 铁律：只动 test-env/，绝不触碰正式环境（$HOME/.dsh / 3080 / 全局安装）。
#
# 官方基线构成（与 dsh 官方 web profile 模板一致）：
#   - package.json  bundles: [@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app]
#   - cordis.patch.yml: 官方空模板（[]）
#   - node_modules: 空（bundle 由 Loader 从全局安装回退解析，官方行为）
#   - settings.yaml: 空（无口令、无供应商、无任何自定义段）
#
# 用法：
#   scripts/test-env-reset.sh                # 恢复官方基线（幂等，可重复执行）
#   scripts/test-env-reset.sh --check        # 只检查当前是否已是官方基线
#
# 约定（重要）：每次在测试环境做完打包测试后，运行本脚本恢复官方基线，
# 保证下一次测试从干净的官方行为开始。
set -euo pipefail

WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ENV="$WS_ROOT/test-env"
PROFILE="$TEST_ENV/profiles/web"

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

if [ "$CHECK" -eq 1 ]; then
  echo "== 检查测试环境是否为官方基线：$TEST_ENV =="
  ISSUES=0
  [ -f "$TEST_ENV/dsh-web.pid" ] && kill -0 "$(cat "$TEST_ENV/dsh-web.pid")" 2>/dev/null \
    && { echo "  ✗ 测试实例运行中（先 stop）"; ISSUES=1; }
  [ -d "$PROFILE/node_modules/@deepseek-ai" ] && [ -n "$(ls -A "$PROFILE/node_modules/@deepseek-ai" 2>/dev/null)" ] \
    && { echo "  ✗ @deepseek-ai 下有 fork 包残留"; ISSUES=1; }
  for pkg in dsh-web-auth dsh-client-ui-web-auth dsh-mobile-adapt dsh-defaults dsh-client-ui-defaults; do
    [ -d "$PROFILE/node_modules/$pkg" ] && { echo "  ✗ 本地插件残留: $pkg"; ISSUES=1; }
  done
  if [ -f "$PROFILE/cordis.patch.yml" ] && grep -qE "web-auth|dsh-defaults|webserver|mobile-adapt" "$PROFILE/cordis.patch.yml" 2>/dev/null; then
    echo "  ✗ cordis.patch.yml 含定制配置"; ISSUES=1
  fi
  [ -f "$TEST_ENV/settings.yaml" ] && grep -qE "web-auth:|llm-pi-ai:|dsh-defaults:" "$TEST_ENV/settings.yaml" 2>/dev/null \
    && { echo "  ✗ settings.yaml 含定制段"; ISSUES=1; }
  [ "$ISSUES" -eq 0 ] && echo "  ✓ 已是官方基线" || echo "  ✗ 存在 $ISSUES 处残留（运行 scripts/test-env-reset.sh）"
  exit "$ISSUES"
fi

echo "== 恢复测试环境为官方基线：$TEST_ENV =="

# 0. 停实例（若有）
if [ -f "$TEST_ENV/dsh-web.pid" ] && kill -0 "$(cat "$TEST_ENV/dsh-web.pid")" 2>/dev/null; then
  echo "  停止测试实例…"
  bash "$WS_ROOT/scripts/test-env-stop.sh"
fi

# 1. 重建 web profile 为官方模板
rm -rf "$PROFILE"
mkdir -p "$PROFILE/node_modules"
cat > "$PROFILE/package.json" <<'EOF'
{
  "name": "dsh-profile-web",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app"
      ]
    }
  }
}
EOF
cat > "$PROFILE/cordis.yml" <<'EOF'
[]
EOF
cat > "$PROFILE/cordis.patch.yml" <<'EOF'
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
[]
EOF
cat > "$PROFILE/pnpm-workspace.yaml" <<'EOF'
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
EOF

# 2. settings.yaml → 官方空
cat > "$TEST_ENV/settings.yaml" <<'EOF'
# 测试环境用户设置（官方基线：空）
EOF

# 3. 清理运行态与残留
rm -f "$TEST_ENV/dsh-web.log" "$TEST_ENV/dsh-web.pid" "$TEST_ENV/pet.json"
rm -rf "$TEST_ENV/storages" "$TEST_ENV/sessions"
mkdir -p "$TEST_ENV/storages" "$TEST_ENV/sessions"

echo
echo "== 完成。当前为官方基线（无 fork / 无本地插件 / 无 patch 配置 / 无测试设置）=="
echo "  启动：scripts/test-env-start.sh   （官方行为：无鉴权门闸、目录选择器默认主目录、无第三方供应商）"
echo "  装包：scripts/test-env-install.sh <已构建包目录>…  （测试完成后再次运行本脚本恢复）"
