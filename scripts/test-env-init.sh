#!/usr/bin/env bash
# 初始化 / 重建工作区级专用 DSH 测试环境（test-env/）。
# 铁律：测试环境与正式环境完全隔离——正式 DSH_HOME（$HOME/.dsh）、全局安装
#       （/usr/lib/node_modules/@deepseek-ai/dsh）、正式端口（3080）一律不碰。
# 用法：
#   scripts/test-env-init.sh               # 已存在则跳过；不存在则从正式 profile 克隆基线
#   scripts/test-env-init.sh --force       # 删除并重建（必须先停掉本脚本启动的实例）
#   scripts/test-env-init.sh --from <种子> # 从指定已验证目录克隆（如 test-env-2）
set -euo pipefail

WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$WS_ROOT/scripts/test-env-common.sh"
resolve_test_env
PROFILE="$TEST_ENV/profiles/web"
FORMAL_HOME="${DSH_FORMAL_HOME:-$HOME/.dsh}"
FORMAL_PROFILE="$FORMAL_HOME/profiles/web"

FROM=""
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --from)
      FROM="$2"; shift
      [ "${FROM#/}" = "$FROM" ] && FROM="$WS_ROOT/$FROM"   # 相对路径解析到工作区根
      ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
  shift
done

if [ -d "$PROFILE/node_modules" ]; then
  if [ "$FORCE" -ne 1 ]; then
    echo "测试环境已存在：$TEST_ENV"
    echo "如需重建：先 scripts/test-env-stop.sh 停止实例，再带 --force 重跑。"
    exit 0
  fi
  if [ -f "$TEST_ENV/dsh-web.pid" ] && kill -0 "$(cat "$TEST_ENV/dsh-web.pid")" 2>/dev/null; then
    echo "✗ 测试实例正在运行（PID $(cat "$TEST_ENV/dsh-web.pid")），先 scripts/test-env-stop.sh"; exit 1
  fi
  echo "== 删除旧测试环境 =="
  rm -rf "$TEST_ENV"
fi

mkdir -p "$TEST_ENV"

if [ -n "$FROM" ]; then
  [ -d "$FROM/profiles/web" ] || { echo "✗ 种子目录无效（缺 profiles/web）：$FROM"; exit 1; }
  echo "== 从种子克隆：$FROM =="
  cp -a "$FROM/." "$TEST_ENV/"
else
  [ -d "$FORMAL_PROFILE" ] || { echo "✗ 正式 profile 不存在：$FORMAL_PROFILE"; exit 1; }
  echo "== 从正式 profile 克隆基线：$FORMAL_PROFILE =="
  mkdir -p "$TEST_ENV/profiles"
  cp -a "$FORMAL_PROFILE" "$PROFILE"
  # 只写最小测试设置（正式环境的 settings.yaml 不复制，避免口令/密钥泄露进测试环境）
  cat > "$TEST_ENV/settings.yaml" <<'EOF'
web-auth:
  password: test123456
EOF
  mkdir -p "$TEST_ENV/storages" "$TEST_ENV/sessions"
fi

echo
echo "== 完成。测试环境：$TEST_ENV =="
echo "  启动：scripts/test-env-start.sh"
echo "  状态：scripts/test-env-status.sh"
echo "  装包：scripts/test-env-install.sh <已构建包目录>…"
echo "  使用前：填写 $TEST_ENV/USAGE.md 声明项目与用途"
