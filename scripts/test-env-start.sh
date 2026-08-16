#!/usr/bin/env bash
# 启动工作区级专用 DSH 测试实例：隔离 DSH_HOME + 独立端口（默认 3090）。
# 绝不触碰正式实例（端口 3080、$HOME/.dsh）。
# 用法：scripts/test-env-start.sh [--port 3090]
set -euo pipefail

WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$WS_ROOT/scripts/test-env-common.sh"
resolve_test_env
echo "== 测试环境：$TEST_ENV（TEST_ENV_INDEX=${ENV_INDEX:-1}，端口 $PORT）=="
echo "  声明状态：$(usage_status)"
if [ "${1:-}" = "--port" ]; then PORT="$2"; fi

[ -d "$TEST_ENV/profiles/web/node_modules" ] || { echo "✗ 测试环境未初始化，先跑 scripts/test-env-init.sh"; exit 1; }

if [ -f "$TEST_ENV/dsh-web.pid" ] && kill -0 "$(cat "$TEST_ENV/dsh-web.pid")" 2>/dev/null; then
  echo "✗ 测试实例已在运行（PID $(cat "$TEST_ENV/dsh-web.pid")），先 scripts/test-env-stop.sh"; exit 1
fi
rm -f "$TEST_ENV/dsh-web.pid"

if ss -tln 2>/dev/null | grep -qE "[:.]$PORT\b"; then
  echo "✗ 端口 $PORT 已被占用。可能是旧实例仍在运行：先 scripts/test-env-stop.sh，或用 --port 换端口。"
  exit 1
fi

echo "== 启动测试实例（DSH_HOME=$TEST_ENV，端口 $PORT）=="
echo "  （日志：test-env/dsh-web.log，PID 文件：test-env/dsh-web.pid）"
cd "$TEST_ENV"
DSH_HOME="$TEST_ENV" nohup dsh web --port "$PORT" > "$TEST_ENV/dsh-web.log" 2>&1 &
echo $! > "$TEST_ENV/dsh-web.pid"

for _ in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; then
    echo "✓ 已就绪：http://127.0.0.1:$PORT （PID $(cat "$TEST_ENV/dsh-web.pid")）"
    echo "  测试口令：test123456（test-env/settings.yaml 中 web-auth.password）"
    exit 0
  fi
  sleep 1
done
echo "✗ 30 秒内未就绪。查看日志：tail -50 test-env/dsh-web.log"; exit 1
