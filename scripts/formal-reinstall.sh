#!/usr/bin/env bash
# formal-reinstall.sh —— 正式环境一键重装入口（opencode 部署唯一入口）。
#
# 把「备份 → 停正式 web → 按依赖序重装 5 插件 → 起 → 逐项 verify」收口成一条命令。
# 各安装器本身可安全幂等重跑（remove+add / 备份 .bak / 已装跳过），因此本脚本可
# 重复执行；人工只保留「最终确认」（本脚本会在开头打印将执行的动作清单）。
#
# 用法：
#   bash scripts/formal-reinstall.sh                # 完整重装（停 → 装 → 起 → verify）
#   bash scripts/formal-reinstall.sh --no-restart   # 只装，不自动重启（手动 dsh web）
#   bash scripts/formal-reinstall.sh --rebuild      # 先重建全部插件产物（src→lib）再装
#   bash scripts/formal-reinstall.sh --skip-verify  # 跳过末尾逐项 verify
#
# 安全边界：
#   - 只停/起 3080 正式实例（按端口精确找 PID，不误杀 test-env 等其它 dsh web）；
#   - 正式 DSH_HOME 固定为 $HOME/.dsh（与 AGENTS.md 记录一致），不接受 DSH_HOME 覆盖；
#   - 由 opencode 在 SSH 终端执行；不要在本 dsh web 进程内运行（红线 2）。
set -euo pipefail

WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORMAL_HOME="$HOME/.dsh"
PROFILE="$FORMAL_HOME/profiles/web"
PORT="${DSH_WEB_PORT:-3080}"

NO_RESTART=0; REBUILD=0; SKIP_VERIFY=0
for arg in "$@"; do
  case "$arg" in
    --no-restart) NO_RESTART=1 ;;
    --rebuild) REBUILD=1 ;;
    --skip-verify) SKIP_VERIFY=1 ;;
    --help|-h) sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "✗ 未知参数：$arg（支持 --no-restart / --rebuild / --skip-verify）" >&2; exit 1 ;;
  esac
done

say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -x "/usr/lib/node_modules/@deepseek-ai/dsh/bin/dsh" ] || [ -x "$(command -v dsh)" ] \
  || die "未找到 dsh 命令（/usr/lib/node_modules/@deepseek-ai/dsh 未安装？）"
[ -d "$PROFILE/node_modules" ] || die "正式 profile 未初始化：$PROFILE"

say "0) 动作清单（即将执行）"
echo "  正式 DSH_HOME : $FORMAL_HOME"
echo "  正式 profile  : $PROFILE"
echo "  端口          : $PORT"
echo "  重建产物      : $([ "$REBUILD" -eq 1 ] && echo 是 || echo 否)"
echo "  装后重启      : $([ "$NO_RESTART" -eq 1 ] && echo 否 || echo 是)"
echo "  末尾 verify   : $([ "$SKIP_VERIFY" -eq 1 ] && echo 否 || echo 是)"
echo "  重装顺序      : access-gate → dsh-defaults → task-suite → deepseek-pet → mobile-adapt"
echo "  （各安装器幂等可重跑；如需取消按 Ctrl-C）"

# ---------------------------------------------------------------- 备份
say "1) 备份"
TS="$(date +%Y%m%d-%H%M%S)"
BAK="$FORMAL_HOME/formal-reinstall.bak-$TS"
mkdir -p "$BAK"
[ -f "$FORMAL_HOME/cordis.patch.yml" ] && cp -a "$FORMAL_HOME/cordis.patch.yml" "$BAK/" || true
[ -f "$PROFILE/cordis.patch.yml" ] && cp -a "$PROFILE/cordis.patch.yml" "$BAK/" || true
[ -f "$FORMAL_HOME/settings.yaml" ] && cp -a "$FORMAL_HOME/settings.yaml" "$BAK/" || true
ok "关键配置已备份到 $BAK（cordis.patch.yml / settings.yaml）"

# ---------------------------------------------------------------- 停正式 web
say "2) 停止正式 dsh web（端口 $PORT）"
PID="$(ss -tlnp 2>/dev/null | grep -E "(:$PORT |\*:$PORT |\[::\]:$PORT )" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)"
if [ -n "$PID" ]; then
  kill "$PID" 2>/dev/null || true
  for _ in $(seq 1 30); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
  kill -0 "$PID" 2>/dev/null && die "dsh web（PID $PID）未能停止，请手动处理"
  ok "已停止正式实例（PID $PID）"
else
  ok "未发现监听 $PORT 的进程（可能已停止）"
fi

# ---------------------------------------------------------------- 重建产物（可选）
if [ "$REBUILD" -eq 1 ]; then
  say "3) 重建全部插件产物（src → lib）"
  ( cd "$WS_ROOT/dsh-AccessGate" && ./build.sh ) || die "dsh-AccessGate build.sh 失败"
  ( cd "$WS_ROOT/dsh-Moresettings" && ./build.sh ) || die "dsh-Moresettings build.sh 失败"
  ( cd "$WS_ROOT/dsh-mobile" && bash build.sh ) || die "dsh-mobile build.sh 失败"
  ( cd "$WS_ROOT/dsh-deepseekpet" && node scripts/build.mjs ) || die "dsh-deepseekpet 构建失败"
  ( cd "$WS_ROOT/dsh-task-suite" && bash build.sh ) || die "dsh-task-suite build.sh 失败"
  ok "产物重建完成"
else
  say "3) 跳过重建（如需先重建加 --rebuild）"
fi

# ---------------------------------------------------------------- 按依赖序重装
say "4) 重装 5 插件（--allow-formal，幂等）"

echo "  [1/5] access-gate"
node "$WS_ROOT/dsh-AccessGate/install-access-gate-plugin.mjs" \
  --profile-dir "$PROFILE" --dsh-home "$FORMAL_HOME" --allow-formal || die "access-gate 安装失败"

echo "  [2/5] dsh-defaults（fork 覆盖 + 插件本体；install-to-profile.sh 固定指向 \$HOME/.dsh）"
bash "$WS_ROOT/dsh-Moresettings/install-to-profile.sh" || die "dsh-defaults 安装失败"

echo "  [3/5] task-suite（聚合包 + 皮肤中心 + 仅 maid-atelier 皮肤）"
node "$WS_ROOT/dsh-task-suite/install-suite-plugin.mjs" \
  --profile-dir "$PROFILE" --dsh-home "$FORMAL_HOME" --allow-formal --skin maid-atelier || die "task-suite 安装失败"

echo "  [4/5] deepseek-pet"
node "$WS_ROOT/dsh-deepseekpet/install-pet-plugin.mjs" \
  --profile-dir "$PROFILE" --dsh-home "$FORMAL_HOME" --allow-formal || die "deepseek-pet 安装失败"

echo "  [5/5] dsh-mobile-adapt（--no-restart，由本脚本统一重启）"
bash "$WS_ROOT/dsh-mobile/install-to-profile.sh" --no-restart || die "dsh-mobile-adapt 安装失败"

ok "5 插件重装完成"

# ---------------------------------------------------------------- 启动正式 web
if [ "$NO_RESTART" -eq 1 ]; then
  say "5) 跳过重启（--no-restart；请手动执行 dsh web）"
else
  say "5) 启动正式 dsh web（端口 $PORT）"
  nohup dsh web --port "$PORT" > "$FORMAL_HOME/dsh-web.log" 2>&1 &
  echo $! > "$FORMAL_HOME/dsh-web.pid"
  for _ in $(seq 1 40); do
    if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; then
      ok "已就绪：http://127.0.0.1:$PORT（PID $(cat "$FORMAL_HOME/dsh-web.pid")）"
      break
    fi
    sleep 1
  done
  curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/" \
    || die "40 秒内未就绪，查看日志：tail -50 $FORMAL_HOME/dsh-web.log"
fi

# ---------------------------------------------------------------- 逐项 verify
if [ "$SKIP_VERIFY" -eq 1 ]; then
  say "6) 跳过 verify（--skip-verify）"
else
  say "6) 逐项 verify（--formal）"
  VFAIL=0
  echo "  [1/5] access-gate"
  bash "$WS_ROOT/dsh-AccessGate/verify.sh" --formal || VFAIL=1
  echo "  [2/5] dsh-defaults"
  node "$WS_ROOT/dsh-Moresettings/verify-defaults.mjs" --formal || VFAIL=1
  echo "  [3/5] task-suite"
  bash "$WS_ROOT/dsh-task-suite/verify.sh" --formal || VFAIL=1
  echo "  [4/5] deepseek-pet"
  bash "$WS_ROOT/dsh-deepseekpet/verify.sh" --formal || VFAIL=1
  echo "  [5/5] dsh-mobile-adapt"
  bash "$WS_ROOT/dsh-mobile/verify.sh" --formal || VFAIL=1
  [ "$VFAIL" -eq 0 ] && ok "全部 verify 通过" || die "存在 verify 失败项（见上方输出）"
fi

say "完成"
echo "  备份位置：$BAK"
echo "  回退：把 $BAK 下文件拷回原路径 + 重跑本脚本（安装器幂等）或按各项目 README 回退。"
