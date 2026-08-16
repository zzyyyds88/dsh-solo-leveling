#!/usr/bin/env bash
# 查看工作区级测试环境状态：实例、端口、已装插件。
# 用法：scripts/test-env-status.sh
set -euo pipefail

WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$WS_ROOT/scripts/test-env-common.sh"
resolve_test_env
PID_FILE="$TEST_ENV/dsh-web.pid"
PORT="${DSH_TEST_PORT:-$PORT}"

echo "== 测试环境：$TEST_ENV（TEST_ENV_INDEX=${ENV_INDEX:-1}，端口 $PORT）=="
echo "-- 使用声明 --"
echo "  $(usage_status)"
echo "-- 实例 --"
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  PID="$(cat "$PID_FILE")"
  echo " 运行中：PID $PID"
  ps -o pid,etime,cmd -p "$PID" | tail -1 | sed 's/^/  /'
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/" || echo 无响应)"
  echo " HTTP $PORT：$CODE（302/200 均属正常）"
else
  echo " 未运行（PID 文件：$([ -f "$PID_FILE" ] && echo 存在但进程已退出 || echo 无)）"
fi
echo "-- 端口占用 --"
ss -tln 2>/dev/null | grep -E ":(3080|$PORT)\b" || echo " 3080 / $PORT 均无监听"
echo "-- 测试 profile 已装 @deepseek-ai 插件 --"
if [ -d "$TEST_ENV/profiles/web/node_modules/@deepseek-ai" ]; then
  ls "$TEST_ENV/profiles/web/node_modules/@deepseek-ai/" | sed 's/^/  /'
else
  echo " （无）"
fi
echo "-- 提示 --"
echo " 正式实例端口 3080 永远不允许被本测试环境触碰；打包测试一律在本环境（$PORT）进行。"
