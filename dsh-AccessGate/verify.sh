#!/usr/bin/env bash
# 验证「访问门禁」插件是否就绪。
# 用法：
#   bash verify.sh              # 静态检查 + 独立集成测试（不需要重启 dsh）
#   bash verify.sh --live       # 额外对运行中服务做 curl 检查（需已重启生效）
# 环境变量：DSH_HOME（默认 ~/.dsh）、DSH_HTTPS_PORT（默认 5700）、DSH_LAN_IP（默认 192.168.1.100）
set -u

DSH_ROOT="/usr/lib/node_modules/@deepseek-ai/dsh"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="$DSH_HOME/profiles/web"
HERE="$(cd "$(dirname "$0")" && pwd)"
FAIL=0
LIVE=0
[ "${1:-}" = "--live" ] && LIVE=1

echo "== 1) 门闸基础（fork 优先，全局旧补丁兜底）=="
WEBSERVER_PROFILE="$PROFILE/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js"
APIPROXY_PROFILE="$PROFILE/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js"
CONNECTION_PROFILE="$PROFILE/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js"
WEBSERVER_GLOBAL="$DSH_ROOT/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js"
APIPROXY_GLOBAL="$DSH_ROOT/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js"
CONNECTION_GLOBAL="$DSH_ROOT/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js"
find_marked() { # <marker> <file>...
  local m="$1"; shift
  local f
  for f in "$@"; do
    [ -f "$f" ] && grep -q "$m" "$f" && { echo "$f"; return 0; }
  done
  return 1
}
WS_HIT="$(find_marked "registerGate(check) {" "$WEBSERVER_PROFILE" "$WEBSERVER_GLOBAL")"
if [ -n "$WS_HIT" ]; then
  echo "  [PASS] webserver 门闸钩子（registerGate）就位：$WS_HIT"
else
  echo "  [FAIL] 找不到带 registerGate 的 webserver（先构建安装 fork）"; FAIL=1
fi
AP_HIT="$(find_marked 'exposed.add("access-gate")' "$APIPROXY_PROFILE" "$APIPROXY_GLOBAL")"
if [ -n "$AP_HIT" ]; then
  echo "  [PASS] apiproxy 已暴露 access-gate 命名空间：$AP_HIT"
else
  echo "  [FAIL] apiproxy 未暴露 access-gate（fork 需重建）"; FAIL=1
fi
CN_HIT="$(find_marked "webAuthAuthed(ctx, request)" "$CONNECTION_PROFILE" "$CONNECTION_GLOBAL")"
if [ -n "$CN_HIT" ]; then
  echo "  [PASS] connection 已登录（webAuth 会话）时放行 settings.*：$CN_HIT"
else
  echo "  [FAIL] connection 围栏未放行"; FAIL=1
fi
for f in "$WS_HIT" "$AP_HIT" "$CN_HIT"; do
  if [ -n "$f" ]; then
    node --check "$f" >/dev/null 2>&1 && echo "  [PASS] 语法检查通过：$(basename "$(dirname "$(dirname "$f")")")" || { echo "  [FAIL] 语法检查失败：$f"; FAIL=1; }
  fi
done

echo "== 2) 插件已装入 profile =="
for PKG in dsh-host-access-gate dsh-client-ui-access-gate; do
  if [ -f "$PROFILE/node_modules/$PKG/package.json" ] && [ -f "$PROFILE/node_modules/$PKG/lib/index.js" ]; then
    echo "  [PASS] $PKG 在位"
  else
    echo "  [FAIL] $PKG 未安装（先跑 node install-access-gate-plugin.mjs）"; FAIL=1
  fi
done
if ! node --check "$PROFILE/node_modules/dsh-host-access-gate/lib/index.js" >/dev/null 2>&1; then
  echo "  [FAIL] dsh-host-access-gate 语法检查失败"; FAIL=1
fi
if ! node --check "$PROFILE/node_modules/dsh-client-ui-access-gate/lib/client.js" >/dev/null 2>&1; then
  echo "  [FAIL] 客户端卡片 bundle 语法检查失败"; FAIL=1
fi
echo "  [PASS] 插件语法检查通过"
if [ -f "$PROFILE/node_modules/dsh-host-access-gate/assets/bg.webp" ]; then
  echo "  [PASS] 登录页背景图资源在位（assets/bg.webp）"
else
  echo "  [FAIL] 登录页背景图资源缺失（assets/bg.webp）"; FAIL=1
fi
for OLD in dsh-web-auth dsh-client-ui-web-auth; do
  if [ -d "$PROFILE/node_modules/$OLD" ]; then
    echo "  [WARN] 旧插件目录仍在（可手动删除）：$OLD"
  fi
done

echo "== 3) cordis.patch.yml 条目 =="
PATCH="$PROFILE/cordis.patch.yml"
if grep -q "host: 127.0.0.1" "$PATCH" && grep -q "ctx.webStartup.port ?? 3080" "$PATCH"; then
  echo "  [PASS] webserver 覆盖：回环 127.0.0.1（HTTPS 反代在前），端口沿用 webStartup ?? 3080"
else
  echo "  [FAIL] webserver 覆盖缺失"; FAIL=1
fi
if grep -Eq "mode: ('on'|\"on\"|on)" "$PATCH"; then
  echo "  [PASS] access-gate 强制鉴权 mode: on（回环监听下也要求登录）"
else
  echo "  [FAIL] access-gate 缺少 mode: on"; FAIL=1
fi
if grep -q "id: access-gate" "$PATCH" && grep -q "name: dsh-host-access-gate" "$PATCH" && grep -q "DSH_ACCESS_GATE_PASSWORD" "$PATCH"; then
  echo "  [PASS] access-gate 插件行已挂载（口令取 DSH_ACCESS_GATE_PASSWORD，兼容旧名）"
else
  echo "  [FAIL] access-gate 插件行缺失"; FAIL=1
fi
if grep -q "id: ui-access-gate" "$PATCH" && grep -q "name: dsh-client-ui-access-gate" "$PATCH"; then
  echo "  [PASS] ui-access-gate 设置卡片行已挂载"
else
  echo "  [FAIL] ui-access-gate 设置卡片行缺失"; FAIL=1
fi
if grep -q 'id: connection' "$PATCH" && grep -q "DSH_WEB_TRUSTED_HOST" "$PATCH"; then
  echo "  [PASS] connection trustedHosts 已固化（启动无需 --trusted-host）"
else
  echo "  [FAIL] connection trustedHosts 固化缺失"; FAIL=1
fi
if grep -q "id: web-auth" "$PATCH" || grep -q "id: ui-web-auth" "$PATCH"; then
  echo "  [FAIL] patch 仍含旧版插件行（web-auth / ui-web-auth），请重跑安装脚本迁移"; FAIL=1
else
  echo "  [PASS] patch 无旧版插件行残留"
fi
if [ "$(grep -c 'id: access-gate' "$PATCH")" -gt 1 ] || [ "$(grep -c 'id: ui-access-gate' "$PATCH")" -gt 1 ]; then
  echo "  [FAIL] patch 条目存在重复（应各只有一处）"; FAIL=1
else
  echo "  [PASS] patch 条目无重复"
fi
[ -f "$PATCH.bak" ] && echo "  [PASS] patch 备份存在 $PATCH.bak" || echo "  [WARN] 缺少 patch 备份"

echo "== 4) 独立集成测试（真实 webserver + 真实插件，loopback:0）=="
if node "$HERE/test-access-gate.mjs"; then
  echo "  [PASS] 集成测试全部通过"
else
  echo "  [FAIL] 集成测试有失败项"; FAIL=1
fi

echo "== 5) 可复现检查：安装脚本 dry-run（应为幂等；dry-run 不写盘，--allow-formal 仅放行检查）=="
node "$HERE/install-access-gate-plugin.mjs" --dry-run --allow-formal >/dev/null 2>&1 && echo "  [PASS] install-access-gate-plugin.mjs 幂等（dry-run 通过）" || { echo "  [FAIL] 安装脚本 dry-run 失败"; FAIL=1; }

if [ "$LIVE" -eq 1 ]; then
  echo "== 6) 运行中服务（需已切换 HTTPS 反代并重启）=="
  HTTPS_PORT="${DSH_HTTPS_PORT:-5700}"
  LAN_IP="${DSH_LAN_IP:-192.168.1.100}"
  BASE="https://$LAN_IP:$HTTPS_PORT"
  CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$BASE/")
  LOC=$(curl -sk -o /dev/null -w "%{redirect_url}" "$BASE/")
  if [ "$CODE" = "302" ] && echo "$LOC" | grep -q "/login"; then
    echo "  [PASS] HTTPS 反代未登录访问已跳转登录页（$CODE → $LOC）"
  elif [ "$CODE" = "302" ] && echo "$LOC" | grep -q "/setup"; then
    echo "  [PASS] 首次设置模式：未登录访问跳转 /setup（$CODE → $LOC）"
  else
    echo "  [WARN] HTTPS 未登录访问未跳转（status=$CODE）—— 可能尚未切换或鉴权未启用"
  fi
  CODE_API=$(curl -sk -o /dev/null -w "%{http_code}" "$BASE/api/anything")
  [ "$CODE_API" = "401" ] && echo "  [PASS] 未登录 /api → 401" || echo "  [WARN] 未登录 /api → $CODE_API（预期 401）"
  ss -tlnp 2>/dev/null | grep -q "127.0.0.1:3080 " && echo "  [PASS] dsh web 只监听回环 127.0.0.1:3080（明文 HTTP 不再暴露）" || echo "  [WARN] 未见 dsh 回环监听"
  ss -tlnp 2>/dev/null | grep -Eq "(:$HTTPS_PORT |\\*:$HTTPS_PORT )" && echo "  [PASS] HTTPS 反代监听 0.0.0.0:$HTTPS_PORT" || echo "  [WARN] 未见 HTTPS 反代监听 $HTTPS_PORT"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "结论：访问门禁文件全部就绪；重启 dsh web 后生效（首次运行请按启动日志提示设置访问口令）。"
else
  echo "结论：存在失败项，请检查。"
fi
exit "$FAIL"
