#!/usr/bin/env bash
# migrate-to-embedded-caddy.sh —— 正式环境迁移：每实例内置 caddy 接管 HTTPS 反代。
# 用户授权执行（会重启正式 dsh web，3080）。步骤：停正式 dsh → 升级插件（含内置
# caddy）+ 收敛用户层 patch → settings 写入反代参数 → 启动正式 dsh → 自检。
# 用法：bash migrate-to-embedded-caddy.sh
set -uo pipefail

WS="<仓库根目录>"
PROJECT="$WS/dsh-AccessGate"
DSH_HOME="/root/.dsh"
LAN_IP="192.168.1.100"
HTTPS_PORT="5700"
LOG="/tmp/migrate-embedded-caddy.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

# ---------- 0) 备份 ----------
log "== 0/5 备份正式配置 =="
cp "$DSH_HOME/settings.yaml" "$DSH_HOME/settings.yaml.pre-embedded.bak"
cp "$DSH_HOME/profiles/web/cordis.patch.yml" "$DSH_HOME/profiles/web/cordis.patch.yml.pre-embedded.bak"
log "  settings.yaml / cordis.patch.yml 已备份（.pre-embedded.bak）"

# ---------- 1) 停正式 dsh（3080，按端口精确找 PID） ----------
log "== 1/5 停止正式 dsh web（3080）=="
FORMAL_PID="$(ss -tlnp 2>/dev/null | grep -E "(:3080 |\*:3080 )" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
if [ -n "$FORMAL_PID" ]; then
  log "  停止正式实例（PID $FORMAL_PID）"
  kill "$FORMAL_PID" 2>/dev/null || true
  for i in $(seq 1 20); do kill -0 "$FORMAL_PID" 2>/dev/null || break; sleep 1; done
  if kill -0 "$FORMAL_PID" 2>/dev/null; then
    log "  仍存活，强制结束"
    kill -9 "$FORMAL_PID" 2>/dev/null || true
    sleep 2
  fi
else
  log "  ⚠ 未发现监听 3080 的进程"
fi
sleep 1

# ---------- 2) 安装器：fork 覆盖 + 升级插件（含内置 caddy）+ 收敛用户层 patch ----------
log "== 2/5 运行安装器（升级插件 + 收敛 patch）=="
cd "$PROJECT" || exit 1
node install-access-gate-plugin.mjs --allow-formal 2>&1 | tee -a "$LOG"
[ "${PIPESTATUS[0]}" = "0" ] || { log "✗ 安装器失败，终止（回退：恢复 .pre-embedded.bak 后重启 dsh）"; exit 1; }

# ---------- 3) settings.yaml 写入反代参数（保留口令） ----------
log "== 3/5 写入反代参数（${LAN_IP}:${HTTPS_PORT}）到 settings.yaml =="
node -e '
const { createRequire } = require("node:module");
const req = createRequire("/usr/lib/node_modules/@deepseek-ai/dsh/package.json");
const yaml = req("js-yaml");
const fs = require("fs");
const p = "/root/.dsh/settings.yaml";
const doc = yaml.load(fs.readFileSync(p, "utf8")) ?? {};
doc["access-gate"] = { ...(doc["access-gate"] ?? {}), lanHost: process.argv[1], httpsPort: Number(process.argv[2]) };
fs.writeFileSync(p, yaml.dump(doc, { lineWidth: 120 }));
console.log("  access-gate:", JSON.stringify(doc["access-gate"]));
' "$LAN_IP" "$HTTPS_PORT" 2>&1 | tee -a "$LOG"

# ---------- 4) 启动正式 dsh（无需 --trusted-host：connection 覆盖已固化 trustedHosts） ----------
log "== 4/5 启动正式 dsh web（3080）=="
cd /root 2>/dev/null || cd "$WS"
nohup node /usr/bin/dsh web > "$DSH_HOME/dsh-web.log" 2>&1 &
echo $! > "$DSH_HOME/dsh-web.pid"
log "  已启动（PID $(cat "$DSH_HOME/dsh-web.pid")，日志 $DSH_HOME/dsh-web.log）"

# ---------- 5) 自检 ----------
log "== 5/5 自检 =="
OK=0
for i in $(seq 1 40); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3080/ 2>/dev/null || true)"
  if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then OK=1; break; fi
  sleep 1
done
if [ "$OK" = "1" ]; then
  log "  ✓ dsh web 就绪：http://127.0.0.1:3080 （HTTP $CODE）"
  sleep 3
  PCODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "https://${LAN_IP}:${HTTPS_PORT}/" 2>/dev/null || true)"
  log "  ✓ HTTPS 反代（内置 caddy）：https://${LAN_IP}:${HTTPS_PORT} → HTTP $PCODE"
  grep "caddy 已启动\|反向代理已就绪" "$DSH_HOME/dsh-web.log" | tail -3 | tee -a "$LOG"
  log "== 迁移完成 =="
else
  log "✗ 40 秒内 dsh web 未就绪，查看 $DSH_HOME/dsh-web.log"
  tail -20 "$DSH_HOME/dsh-web.log" | tee -a "$LOG"
  exit 1
fi
