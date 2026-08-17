#!/usr/bin/env bash
# check-fork-versions.sh —— 检查 profile 内 @deepseek-ai/* 同包名 fork 与全局 DSH 版本是否一致。
#
# 背景：dsh-AccessGate / dsh-Moresettings 的同包名 fork（webserver / apiproxy /
# connection / ui-settings / directory-picker / llm* 等）是「官方包完整产物 + 钩子
# 补丁」的副本，装在 profile node_modules/@deepseek-ai/，优先级高于全局安装。
# DSH 升级只覆盖全局，profile 内 fork 不随之更新 → 若 fork 仍基于旧版官方源码，
# 会静默覆盖新版、甚至拿旧 API 调新运行时出问题。
#
# fork 的 package.json 版本形如 0.1.0-rc.6-local.1（前缀 = built-against 的 DSH
# 版本）。本脚本比对前缀与全局 DSH 版本，不一致即判「过期」，退出码非 0。
# 用法：
#   bash scripts/check-fork-versions.sh                 # 检查正式 ~/.dsh/profiles/web
#   DSH_HOME=/root/.dsh bash scripts/check-fork-versions.sh
#   DSH_HOME=test-envs/test-env-1 bash scripts/check-fork-versions.sh
set -u

DSH_ROOT="/usr/lib/node_modules/@deepseek-ai/dsh"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
SCOPE="$DSH_HOME/profiles/web/node_modules/@deepseek-ai"

DSH_VER="$(node -e "console.log(require('$DSH_ROOT/package.json').version)" 2>/dev/null || true)"
if [ -z "$DSH_VER" ]; then
  echo "✗ 未找到全局 DSH（$DSH_ROOT），无法比对版本" >&2
  exit 1
fi
if [ ! -d "$SCOPE" ]; then
  echo "✗ 未找到 profile：$SCOPE（DSH_HOME=$DSH_HOME）" >&2
  exit 1
fi

echo "全局 DSH 版本：$DSH_VER"
echo "检查 profile：$SCOPE"
STALE=0
COUNT=0
for pkgjson in "$SCOPE"/*/package.json; do
  [ -f "$pkgjson" ] || continue
  name="$(basename "$(dirname "$pkgjson")")"
  # 跳过备份目录（*.bak / *.pre-* 等带点后缀的），只查在用的 fork
  case "$name" in
    *.*) continue ;;
  esac
  v="$(node -e "console.log(require('$pkgjson').version)" 2>/dev/null || true)"
  case "$v" in
    *-local.*) base="${v%%-local.*}" ;;
    *) continue ;;  # 非 fork（无 -local 后缀的自研插件），跳过
  esac
  COUNT=$((COUNT + 1))
  if [ "$base" = "$DSH_VER" ]; then
    echo "  [OK]    $name ($v)"
  else
    echo "  [STALE] $name 基于 $base，当前 DSH $DSH_VER —— 需重打 fork（见各项目『升级后重打补丁指南』）"
    STALE=1
  fi
done

if [ "$COUNT" -eq 0 ]; then
  echo "（未发现任何同包名 fork）"
  exit 0
fi
if [ "$STALE" -eq 0 ]; then
  echo "✓ 全部 $COUNT 个 fork 与 DSH 版本一致"
  exit 0
fi
echo "✗ 存在过期 fork：DSH 升级后必须先把 fork 源码重 base 到新版官方再重打（升级后重打补丁指南 §2），" >&2
echo "  然后 scripts/formal-reinstall.sh --rebuild 重建安装。" >&2
exit 1
