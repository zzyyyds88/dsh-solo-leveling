#!/usr/bin/env bash
# dsh-mobile-adapt 正式安装脚本 —— 仅限用户在 SSH 终端手动执行（AI 代理禁止）。
#
# 作用：标准安装 dsh-mobile-adapt 到正式 profile（/root/.dsh/profiles/web）：
#       npm pack → dsh plugin --profile web add（bundles 挂载，包内 cordis.patch.yml
#       承担挂载清单；不再手工替换目录/写用户层 patch 行）。
# 会重启正式 dsh web（端口 3080）：先停 → 标准安装 → 再起，全程 30 秒左右。
#
# 用法：
#   bash install-to-profile.sh            # 直接安装（含重启确认）
#   bash install-to-profile.sh --no-restart   # 只装包，不重启（手动重启）
#
# 回退：
#   DSH_HOME 下 profiles/web/node_modules/dsh-mobile-adapt.bak 是旧版备份，
#   把 .bak 拷回原目录再重启即可。
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
export DSH_HOME
PROFILE="$DSH_HOME/profiles/web"
DST="$PROFILE/node_modules/dsh-mobile-adapt"
PORT="${DSH_WEB_PORT:-3080}"

[ -d "$PROJECT_DIR/lib" ] || { echo "✗ 未构建（无 lib/），先 bash build.sh"; exit 1; }
[ -d "$PROFILE/node_modules" ] || { echo "✗ 正式 profile 未初始化（$PROFILE/node_modules 不存在）"; exit 1; }

if [ "${1:-}" != "--no-restart" ]; then
  echo "即将：停止正式 dsh web（端口 $PORT）→ 替换插件 → 重新启动。"
  read -r -p "继续？[y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "已取消。"; exit 1 ;;
  esac
fi

# 1) 停止正式实例（按端口 $PORT 精确找 PID，避免误杀 test-env 等其它 dsh web 进程）
PID="$(ss -tlnp 2>/dev/null | grep -E "(:$PORT |\*:$PORT |\[::\]:$PORT )" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)"
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  echo "  停止 dsh web（PID $PID，端口 $PORT）…"
  kill "$PID" 2>/dev/null || true
  for _ in $(seq 1 20); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
  kill -0 "$PID" 2>/dev/null && { echo "✗ 停止超时，请手动检查。"; exit 1; }
else
  echo "  ⚠ 未发现监听 $PORT 的进程（可能已停止）"
fi

# 2) 标准安装（npm pack → dsh plugin --profile web remove+add；bundles 挂载，包内
#    cordis.patch.yml 承担挂载清单；先备份旧包，remove+add 解决同版本 tgz 重装不刷新问题）
PACK_DIR="$(mktemp -d)"
TGZ="$(cd "$PROJECT_DIR" && npm pack --pack-destination "$PACK_DIR" --silent 2>/dev/null | tail -1)"
if [ -z "$TGZ" ] || [ ! -f "$PACK_DIR/$TGZ" ]; then echo "✗ npm pack 失败"; exit 1; fi
if [ -d "$DST" ]; then
  rm -rf "$DST.bak"
  cp -a "$DST" "$DST.bak"
  echo "  旧版备份于 $DST.bak"
fi
dsh plugin --profile web remove dsh-mobile-adapt >/dev/null 2>&1 || true
dsh plugin --profile web add "$PACK_DIR/$TGZ"
echo "  ✓ dsh-mobile-adapt 标准安装完成（bundles 挂载）"

# 3) 启动
if [ "${1:-}" != "--no-restart" ]; then
  nohup dsh web --port "$PORT" > "$DSH_HOME/dsh-web.log" 2>&1 &
  echo $! > "$DSH_HOME/dsh-web.pid"
  for _ in $(seq 1 30); do
    if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; then
      echo "✓ 已就绪：http://127.0.0.1:$PORT（PID $(cat "$DSH_HOME/dsh-web.pid")）"
      echo "  手机浏览器刷新即可看到移动端适配效果。"
      exit 0
    fi
    sleep 1
  done
  echo "✗ 30 秒内未就绪，查看日志：tail -50 $DSH_HOME/dsh-web.log"; exit 1
fi

echo "✓ 插件已安装（未重启）。请手动重启 dsh web 后刷新浏览器。"
