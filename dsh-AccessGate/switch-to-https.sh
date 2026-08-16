#!/usr/bin/env bash
# switch-to-https.sh —— 手动兜底脚本（新主流程已改为：设置卡填反代参数 → 保存 →
# 「重启」按钮 → 系统拉起 dsh 后插件自动确保 caddy 反代运行，无需本脚本）。
# 本脚本保留用于：首次迁移 / 手动自检 / 无 supervisor 环境手动切换。
#
# 原子切换到「HTTPS 反代」拓扑（幂等，可重复执行）
#
# 拓扑变化：
#   之前：dsh web 直接监听 0.0.0.0:3080（明文 HTTP，非安全上下文）
#   现在：dsh web 只监听 127.0.0.1:3080（mode: on 强制登录）
#         caddy 在 0.0.0.0:5700 提供 HTTPS（自签内部 CA）→ 反代 127.0.0.1:3080
#
# 关键点：先停 dsh web 再写 profile 配置——运行中的 dsh 会把 cordis.patch.yml
# 的改动热重载并导致承载 Web 会话的进程崩溃，所以配置写入必须在进程停止后进行。
#
# 用法：sudo bash switch-to-https.sh [局域网IP]
# 优先级：环境变量 DSH_LAN_IP / DSH_HTTPS_PORT > 命令行参数 > GUI 卡片保存的
#   settings.yaml access-gate.lanHost / httpsPort > 内置默认（192.168.1.100 / 5700）
set -uo pipefail

PROJECT="<仓库根目录>/dsh-AccessGate"

# 从 $DSH_HOME/settings.yaml 读取 access-gate 命名空间里的反代参数（GUI「访问门禁」卡片保存的）
read_access_setting() { # <key> <default>
  local key="$1" def="${2:-}" v
  v="$(node -e '
    const { createRequire } = require("node:module");
    const fs = require("node:fs");
    const req = createRequire("/usr/lib/node_modules/@deepseek-ai/dsh/package.json");
    const yaml = req("js-yaml");
    const home = process.env.DSH_HOME || (process.env.HOME || "/root") + "/.dsh";
    const key = process.argv[1];
    try {
      const doc = yaml.load(fs.readFileSync(home + "/settings.yaml", "utf8"));
      const v = doc?.["access-gate"]?.[key];
      if (v !== undefined && v !== null && String(v) !== "") process.stdout.write(String(v));
    } catch {}
  ' "$key" 2>/dev/null)"
  [ -n "$v" ] && echo "$v" || echo "$def"
}

SETTINGS_LAN="$(read_access_setting lanHost "192.168.1.100")"
SETTINGS_PORT="$(read_access_setting httpsPort "5700")"
LAN_IP="${DSH_LAN_IP:-${1:-$SETTINGS_LAN}}"
HTTPS_PORT="${DSH_HTTPS_PORT:-$SETTINGS_PORT}"
echo "反向代理目标：https://${LAN_IP}:${HTTPS_PORT}（dsh 回环 127.0.0.1:3080）"

echo "== [1/5] 停掉当前 dsh web（只停 3080 正式实例，避免误杀 test-env 等其它 dsh web 进程）=="
FORMAL_PID="$(ss -tlnp 2>/dev/null | grep -E "(:3080 |\*:3080 )" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
if [ -n "$FORMAL_PID" ]; then
  echo "  停止正式实例（PID $FORMAL_PID，端口 3080）"
  kill "$FORMAL_PID" 2>/dev/null || true
  for i in $(seq 1 15); do kill -0 "$FORMAL_PID" 2>/dev/null || break; sleep 1; done
  if kill -0 "$FORMAL_PID" 2>/dev/null; then
    echo "  仍存活，强制结束"
    kill -9 "$FORMAL_PID" 2>/dev/null || true
    sleep 2
  fi
else
  echo "  未发现监听 3080 的进程（可能已停止）"
fi
sleep 1

echo "== [2/5] 写入最终 profile 配置（webserver=127.0.0.1，access-gate mode: on）=="
cd "$PROJECT"
node install-access-gate-plugin.mjs --allow-formal

echo "== [3/5] 证书（按 IP 匹配复用/重生成）+ Caddyfile + 启动 caddy（HTTPS 0.0.0.0:${HTTPS_PORT} → 127.0.0.1:3080）=="
mkdir -p /etc/caddy/certs
CERT="/etc/caddy/certs/dsh-web.crt"
KEY="/etc/caddy/certs/dsh-web.key"
# 证书绑地址（IP 或域名）、不绑端口：换 IP/域名重配时必须重新生成，
# 否则浏览器会因 SAN 不匹配报证书错误（TLS/SNI mismatch）。
if echo "$LAN_IP" | grep -qE '^[0-9.]+$'; then
  SAN_MATCH="$(openssl x509 -in "$CERT" -noout -ext subjectAltName 2>/dev/null | grep -cE "IP( Address)?:${LAN_IP}")"
  SAN_SPEC="subjectAltName=IP:${LAN_IP},DNS:localhost,IP:127.0.0.1"
else
  SAN_MATCH="$(openssl x509 -in "$CERT" -noout -ext subjectAltName 2>/dev/null | grep -cE "DNS:${LAN_IP}")"
  SAN_SPEC="subjectAltName=DNS:${LAN_IP},DNS:localhost,IP:127.0.0.1"
fi
needs_cert=0
if [ ! -f "$CERT" ]; then
  needs_cert=1
elif ! openssl x509 -in "$CERT" -noout -checkend 2592000 >/dev/null 2>&1; then
  echo "  现有证书 30 天内到期，重新生成"
  needs_cert=1
elif [ "${SAN_MATCH:-0}" -lt 1 ]; then
  echo "  现有证书 SAN 与当前地址（${LAN_IP}）不匹配，重新生成"
  needs_cert=1
fi
if [ "$needs_cert" = "1" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$KEY" -out "$CERT" \
    -subj "/CN=${LAN_IP}" -addext "$SAN_SPEC" >/dev/null 2>&1
  echo "  已生成 10 年自签证书（SAN: ${LAN_IP}）"
else
  echo "  复用现有证书（SAN 匹配 ${LAN_IP}，有效期充足）"
fi
chown -R caddy:caddy /etc/caddy/certs && chmod 640 "$KEY"
cat > /etc/caddy/Caddyfile <<EOF
# DSH Web GUI —— HTTPS 反向代理（caddy，自签内部 CA，浏览器首次信任一次）
# auto_https disable_redirects：不占用 80 端口（避免与既有 Web 服务冲突）
{
	auto_https disable_redirects
}

https://${LAN_IP}:${HTTPS_PORT} {
	tls /etc/caddy/certs/dsh-web.crt /etc/caddy/certs/dsh-web.key
	reverse_proxy 127.0.0.1:3080
}
EOF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { echo "  Caddyfile 校验失败"; exit 1; }
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy
echo "  caddy 已启动（${LAN_IP}:${HTTPS_PORT}）"

echo "== [4/5] 启动 dsh web（回环 127.0.0.1:3080 + --trusted-host ${LAN_IP} 无端口）=="
cd /root/.openclaw/workspace 2>/dev/null || cd /root
nohup node /usr/bin/dsh web --trusted-host "${LAN_IP}" >/tmp/dsh-web.log 2>&1 &
for i in $(seq 1 60); do
  grep -q "dsh web:" /tmp/dsh-web.log 2>/dev/null && break
  sleep 1
done
tail -5 /tmp/dsh-web.log

echo "== [5/5] 自检 =="
sleep 2
cd "$PROJECT" && bash verify.sh --live || true

echo
echo "完成。新访问地址：https://${LAN_IP}:${HTTPS_PORT}/"
echo "（自签证书，浏览器首次访问点「高级 → 继续访问」信任一次即可。）"
