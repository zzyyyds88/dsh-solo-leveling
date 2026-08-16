#!/usr/bin/env bash
# dsh-mobile-adapt 正式安装脚本 —— 仅限用户在 SSH 终端手动执行（AI 代理禁止）。
#
# 作用：把本目录构建好的 dsh-mobile-adapt 装进正式 profile
#       （/root/.dsh/profiles/web），覆盖当前已安装的旧版。
# 会重启正式 dsh web（端口 3080）：先停 → 换文件 → 再起，全程 30 秒左右。
# 挂载：cordis.patch.yml 里已有的 mobile-adapt 条目保持不变；缺失时幂等补写
# （兜底全新部署场景，避免装完不挂载）。
#
# 用法：
#   bash install-to-profile.sh            # 直接安装（含重启确认）
#   bash install-to-profile.sh --no-restart   # 只换文件，不重启（手动重启）
#
# 回退：
#   DSH_HOME 下 profiles/web/node_modules/dsh-mobile-adapt.bak 是旧版备份，
#   把 .bak 拷回原目录再重启即可。
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_HOME="${DSH_HOME:-/root/.dsh}"
PROFILE="$DSH_HOME/profiles/web"
DST="$PROFILE/node_modules/dsh-mobile-adapt"
PORT="${DSH_WEB_PORT:-3080}"

[ -d "$PROJECT_DIR/lib" ] || { echo "✗ 未构建（无 lib/），先 bash build.sh"; exit 1; }
[ -f "$DST/package.json" ] || { echo "✗ 正式 profile 未找到 dsh-mobile-adapt（$DST）"; exit 1; }

if [ "${1:-}" != "--no-restart" ]; then
  echo "即将：停止正式 dsh web（端口 $PORT）→ 替换插件 → 重新启动。"
  read -r -p "继续？[y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "已取消。"; exit 1 ;;
  esac
fi

# 1) 停止正式实例（按 PID 精确停止）
PID_FILE="$(ls "$DSH_HOME"/*.pid 2>/dev/null | head -1 || true)"
if [ -n "$PID_FILE" ] && [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    echo "  停止 dsh web（PID $PID）…"
    kill "$PID"
    for _ in $(seq 1 20); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
    kill -0 "$PID" 2>/dev/null && { echo "✗ 停止超时，请手动检查。"; exit 1; }
  fi
else
  echo "  ⚠ 未找到 PID 文件，跳过停止（若实例在运行请先手动停止）。"
fi

# 2) 备份 + 替换
rm -rf "$DST.bak"
cp -a "$DST" "$DST.bak"
rm -rf "$DST/lib"
cp -a "$PROJECT_DIR/lib" "$DST/lib"
cp "$PROJECT_DIR/package.json" "$DST/package.json"
echo "  ✓ 已替换 $DST（旧版备份于 $DST.bak）"

# 2.5) 幂等确认挂载行（cordis.patch.yml 缺 mobile-adapt 条目时补上；
#       正式环境通常已有该条目，此处兜底全新部署场景）
PATCH="$PROFILE/cordis.patch.yml"
if [ -f "$PATCH" ] && grep -q "id: mobile-adapt" "$PATCH" && grep -q "name: dsh-mobile-adapt" "$PATCH"; then
  echo "  （cordis.patch.yml 已含 mobile-adapt 挂载行，跳过）"
elif [ -f "$PATCH" ]; then
  if [ ! -s "$PATCH" ] || grep -q '^\[\]$' "$PATCH"; then
    cat > "$PATCH" <<'EOF'
# dsh-mobile-adapt 挂载（install-to-profile.sh 自动写入）
- insert:
    - id: mobile-adapt
      name: dsh-mobile-adapt
      inject:
        - webServer
EOF
  else
    printf '\n- insert:\n    - id: mobile-adapt\n      name: dsh-mobile-adapt\n      inject:\n        - webServer\n' >> "$PATCH"
  fi
  echo "  ✓ mobile-adapt 挂载行已补写 $PATCH"
else
  echo "  ⚠ 未找到 $PATCH，跳过挂载行确认（请检查 profile 配置）"
fi

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

echo "✓ 文件已替换（未重启）。请手动重启 dsh web 后刷新浏览器。"
