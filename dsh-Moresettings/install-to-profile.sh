#!/usr/bin/env bash
# 正式安装：把 dsh-defaults 统一插件装进正式 profile（~/.dsh/profiles/web）。
# ⚠ 本脚本会停掉运行中的 dsh web 并重启 —— 必须在 SSH 终端手动执行，不要由 agent 代跑。
# ⚠ 前置：已在测试环境（test-env）完整验证通过。
# 用法：bash install-to-profile.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WS_ROOT="$(cd "$HERE/.." && pwd)"

PROFILE="${DSH_PROFILE:-web}"
TARGET="$HOME/.dsh/profiles/$PROFILE"
DST="$TARGET/node_modules/@deepseek-ai"
# fork 源码全部在本项目 packages/（含 dsh-host-apiproxy 本地副本，自包含）
FORKS_ROOT="$WS_ROOT/dsh-Moresettings/packages"
BACKUP_SUFFIX=".pre-defaults-$(date +%Y%m%d-%H%M%S)"

echo "== 0. 前置检查 =="
[ -d "$TARGET/node_modules" ] || { echo "✗ 未找到 profile: $TARGET"; exit 1; }
for pkg in dsh-host-directory-picker-browse dsh-llm dsh-llm-deepseek dsh-llm-pi-ai dsh-host-apiproxy; do
  [ -d "$FORKS_ROOT/$pkg/lib" ] || { echo "✗ $pkg 未构建（先 ./build.sh）"; exit 1; }
done

echo "== 1. 停止正式 dsh web（只停 3080 正式实例，避免误杀 test-env 等其它 dsh web 进程）=="
PID="$(ss -tlnp 2>/dev/null | grep -E "(:3080 |\*:3080 |\[::\]:3080 )" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
if [ -n "$PID" ]; then
  echo "  停止正式实例（PID $PID，端口 3080）"
  kill "$PID" 2>/dev/null || true
  for _ in $(seq 1 30); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
  kill -0 "$PID" 2>/dev/null && { echo "✗ dsh web 未能停止，请手动处理"; exit 1; }
else
  echo "  （未发现监听 3080 的进程，可能已停止）"
fi

echo "== 2. fork 包覆盖（同包名）=="
for pkg in dsh-host-directory-picker-browse dsh-llm dsh-llm-deepseek dsh-llm-pi-ai dsh-host-apiproxy; do
  src="$FORKS_ROOT/$pkg"
  dst="$DST/$pkg"
  if [ -d "$dst" ] && [ ! -e "$dst$BACKUP_SUFFIX" ]; then
    cp -a "$dst" "$dst$BACKUP_SUFFIX"
    echo "  备份: $pkg → $BACKUP_SUFFIX"
  fi
  mkdir -p "$dst"
  rm -rf "$dst/lib"
  cp -a "$src/lib" "$dst/lib"
  cp "$src/package.json" "$dst/package.json"
  echo "  ✓ $pkg"
done

echo "== 3. 回退官方 client 目录选择器 =="
if [ -d "$DST/dsh-client-ui-directory-picker-browse" ]; then
  if [ ! -e "$DST/dsh-client-ui-directory-picker-browse$BACKUP_SUFFIX" ]; then
    cp -a "$DST/dsh-client-ui-directory-picker-browse" "$DST/dsh-client-ui-directory-picker-browse$BACKUP_SUFFIX"
  fi
  rm -rf "$DST/dsh-client-ui-directory-picker-browse"
  echo "  已移除 profile 内 fork（Loader 回退解析全局官方版；原 fork 已备份）"
else
  echo "  （profile 内无该 fork，无需回退）"
fi

echo "== 4. 新插件 + cordis.patch.yml 挂载 =="
node "$HERE/install-defaults-plugin.mjs" --profile-dir "$TARGET" --allow-formal

echo "== 5. 重启 dsh web =="
echo "  请手动执行：dsh web（本脚本不代启动）"
echo
echo "== 安装完成。验证：=="
echo "  bash $HERE/verify.sh"
echo "回退：把备份目录（*$BACKUP_SUFFIX）拷回原位置，node install-defaults-plugin.mjs --unpatch。"
