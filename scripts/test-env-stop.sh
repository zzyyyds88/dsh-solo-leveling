#!/usr/bin/env bash
# 停止工作区级测试实例：按 PID 文件精确停止，先 TERM 后 KILL。
# 禁止 pkill -f 模糊匹配（模式含自身命令行时会误杀自己）。
# 用法：scripts/test-env-stop.sh
set -euo pipefail

WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ENV="$WS_ROOT/test-env"
PID_FILE="$TEST_ENV/dsh-web.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "未找到 PID 文件（$PID_FILE）。"
  echo "提示：本脚本只管理自己启动的实例；其它来源的 dsh web 请用 ss -tlnp 查 PID 后手动确认。"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if ! kill -0 "$PID" 2>/dev/null; then
  echo "PID $PID 已不在运行，清理 PID 文件。"
  rm -f "$PID_FILE"
  exit 0
fi

echo "== 停止测试实例 PID $PID =="
kill "$PID"
for _ in $(seq 1 30); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
if kill -0 "$PID" 2>/dev/null; then
  echo "30 秒未退出，强制 KILL。"
  kill -9 "$PID" || true
fi
rm -f "$PID_FILE"
echo "✓ 已停止（PID $PID）。"
