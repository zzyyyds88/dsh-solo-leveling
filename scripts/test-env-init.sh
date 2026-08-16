#!/usr/bin/env bash
# 初始化 / 重建工作区级专用 DSH 测试环境（test-envs/test-env-N）。
# 铁律：测试环境与正式环境完全隔离——正式 DSH_HOME（$HOME/.dsh）、全局安装
#       （/usr/lib/node_modules/@deepseek-ai/dsh）、正式端口（3080）一律不碰。
# 基线：从正式 profile 克隆（含已装插件/fork，贴近真实环境），不是官方空模板。
# 用法：
#   scripts/test-env-init.sh               # 已存在则跳过；不存在则从正式 profile 克隆基线
#   scripts/test-env-init.sh --force       # 删除并重建（必须先停掉本脚本启动的实例）
#   scripts/test-env-init.sh --from <种子> # 从指定已验证目录克隆（如 test-envs/test-env-2）
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
  # 保留说明文件（test-env-1/README.md 等 git 跟踪的文档），重建后放回
  local readme=""
  if [ -f "$TEST_ENV/README.md" ]; then
    readme="$(mktemp)"
    cp "$TEST_ENV/README.md" "$readme"
  fi
  rm -rf "$TEST_ENV"
  if [ -n "$readme" ]; then
    mkdir -p "$TEST_ENV"
    cp "$readme" "$TEST_ENV/README.md"
    rm -f "$readme"
    echo "  （保留 README.md 说明文件）"
  fi
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

# 生成/重置使用声明模板（独占原则 + 验收纪律提示）
cat > "$TEST_ENV/USAGE.md" <<'USAGE_EOF'
# 测试环境使用声明

> 使用本环境前必须填写（强制，见 AGENTS.md）：
> ① **独占**：同一时刻一个测试环境只归一个项目使用；
> ② **验收**：测试完成后等用户验收通过，才允许运行
>    `scripts/test-env-reset.sh --verified` 清理本环境（禁止自行清理）。

项目：（哪个项目在用它）
用途：（要测试什么）
开始时间：
结束时间：
验收状态：（待验收 / 已验收）
USAGE_EOF

echo
echo "== 完成。测试环境：$TEST_ENV =="
echo "  启动：scripts/test-env-start.sh"
echo "  状态：scripts/test-env-status.sh"
echo "  装包：scripts/test-env-install.sh <已构建包目录>…"
echo "  使用前：填写 $TEST_ENV/USAGE.md 声明项目与用途（独占原则）"
echo "  验收后清理：scripts/test-env-reset.sh --verified"
