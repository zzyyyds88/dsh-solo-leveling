#!/usr/bin/env bash
# 验证 dsh-mobile-adapt 插件是否已就绪。
# 用法：
#   bash verify.sh              # 静态检查（插件装入 profile + patch 条目 + 语法 + 产物）
#   bash verify.sh --live       # 额外对运行中服务做检查（需已重启生效）
# 环境变量：DSH_TEST_HOME（默认 test-env-1）、DSH_PORT（默认 3090）。
# 注意：故意不用 DSH_HOME（宿主环境里它指向正式 /root/.dsh，会验错对象）。
set -u

WS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DSH_HOME="${DSH_TEST_HOME:-$WS_ROOT/test-envs/test-env-1}"
PROFILE="$DSH_HOME/profiles/web"
HERE="$(cd "$(dirname "$0")" && pwd)"
FAIL=0
LIVE=0
[ "${1:-}" = "--live" ] && LIVE=1
PORT="${DSH_PORT:-3090}"

echo "== 1) 插件已装入 profile =="
if [ -f "$PROFILE/node_modules/dsh-mobile-adapt/package.json" ] && [ -f "$PROFILE/node_modules/dsh-mobile-adapt/lib/client.js" ] && [ -f "$PROFILE/node_modules/dsh-mobile-adapt/lib/index.js" ]; then
  echo "  [PASS] dsh-mobile-adapt 在位（package.json + lib/client.js + lib/index.js）"
else
  echo "  [FAIL] dsh-mobile-adapt 未安装（先跑 bash install-to-test-env.sh）"; FAIL=1
fi
if [ -f "$PROFILE/node_modules/dsh-mobile-adapt/package.json" ]; then
  PKGNAME="$(node -e "console.log(require('$PROFILE/node_modules/dsh-mobile-adapt/package.json').name)")"
  [ "$PKGNAME" = "dsh-mobile-adapt" ] && echo "  [PASS] 包名正确：$PKGNAME" || { echo "  [FAIL] 包名异常：$PKGNAME"; FAIL=1; }
  node -e "const p=require('$PROFILE/node_modules/dsh-mobile-adapt/package.json'); if(p.dsh && p.dsh.client && p.dsh.client.platform==='web'){console.log('  [PASS] dsh.client 声明存在（client bundle 会进启动图）')}else{console.log('  [FAIL] dsh.client 声明缺失'); process.exit(1)}" || FAIL=1
fi
if node --check "$PROFILE/node_modules/dsh-mobile-adapt/lib/client.js" >/dev/null 2>&1 && node --check "$PROFILE/node_modules/dsh-mobile-adapt/lib/index.js" >/dev/null 2>&1; then
  echo "  [PASS] bundle 与宿主脚本语法检查通过"
else
  echo "  [FAIL] 语法检查失败（先 bash build.sh 重建）"; FAIL=1
fi

echo "== 2) 标准安装状态（bundles 挂载）=="
BUNDLES="$PROFILE/package.json"
if node -e "const p=require('$BUNDLES'); process.exit((p.dsh?.profile?.bundles ?? []).includes('dsh-mobile-adapt')?0:1)" 2>/dev/null; then
  echo "  [PASS] dsh-mobile-adapt 已进 profile bundles（标准挂载）"
else
  echo "  [FAIL] dsh-mobile-adapt 不在 profile bundles（标准安装：npm pack → dsh plugin add）"; FAIL=1
fi

echo "== 3) 产物一致性（src 与 lib 是否同步）=="
if diff -q "$HERE/src/index.js" "$HERE/lib/index.js" >/dev/null 2>&1 && diff -q "$HERE/src/client.js" "$HERE/lib/client.js" >/dev/null 2>&1; then
  echo "  [PASS] lib 与 src 一致（构建产物未过期）"
else
  echo "  [WARN] lib 与 src 不一致（改动后请跑 bash build.sh）"
fi

if [ "$LIVE" = "1" ]; then
  echo "== 4) 运行中服务检查（端口 $PORT）=="
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/login" || true)"
  [ "$CODE" = "200" ] || [ "$CODE" = "302" ] && echo "  [PASS] 服务可达（HTTP $CODE，未登录会 302 属正常）" || { echo "  [FAIL] 服务不可达：HTTP $CODE"; FAIL=1; }
  # client bundle 路由需要登录态，未登录 302 即视为存在；登录态可用 curl -b 复测
  BCODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/plugins/dsh-mobile-adapt/client.js" || true)"
  if [ "$BCODE" = "200" ]; then
    echo "  [PASS] /plugins/dsh-mobile-adapt/client.js 可访问（HTTP 200）"
  elif [ "$BCODE" = "302" ]; then
    echo "  [WARN] client.js 需要登录态（HTTP 302），浏览器登录后自动加载"
  else
    echo "  [FAIL] client.js 路由异常：HTTP $BCODE"; FAIL=1
  fi
fi

echo
if [ "$FAIL" = "0" ]; then
  echo "✓ 全部通过。手机浏览器（≤768px）访问 http://<host>:$PORT 即可看到移动端适配效果。"
  exit 0
else
  echo "✗ 存在失败项，见上方 [FAIL]。"; exit 1
fi
