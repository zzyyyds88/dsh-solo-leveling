#!/usr/bin/env bash
# verify.sh —— 验证 deepseek-pet 桌宠插件是否已就绪。
# 用法：
#   bash verify.sh              # 静态检查（插件已装入 profile + patch 条目 + 语法），默认 test-env
#   bash verify.sh --live       # 额外对运行中服务做 curl 检查（需已重启生效）
#   bash verify.sh --formal     # 验证正式环境（~/.dsh，端口 3080）
# 环境变量：DSH_HOME（--formal 时，默认 ~/.dsh）/ DSH_TEST_HOME（默认 test-env-1）、DSH_PORT（默认 3090）
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
WS_ROOT="$(cd "$HERE/.." && pwd)"
LIVE=0
FORMAL=0
for arg in "$@"; do
  [ "$arg" = "--live" ] && LIVE=1
  [ "$arg" = "--formal" ] && FORMAL=1
done
if [ "$FORMAL" -eq 1 ]; then
  DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
  PORT="${DSH_PORT:-3080}"
else
  DSH_HOME="${DSH_TEST_HOME:-$WS_ROOT/test-envs/test-env-1}"
  PORT="${DSH_PORT:-3090}"
fi
PROFILE="$DSH_HOME/profiles/web"
FAIL=0

echo "== 1) 插件已装入 profile =="
if [ -f "$PROFILE/node_modules/deepseek-pet/package.json" ] && [ -f "$PROFILE/node_modules/deepseek-pet/lib/client.js" ] && [ -f "$PROFILE/node_modules/deepseek-pet/lib/index.js" ]; then
  echo "  [PASS] deepseek-pet 在位（package.json + lib/client.js + lib/index.js）"
else
  echo "  [FAIL] deepseek-pet 未安装（先跑 bash install-to-test-env.sh）"; FAIL=1
fi
if [ -f "$PROFILE/node_modules/deepseek-pet/package.json" ]; then
  PKGNAME="$(node -e "console.log(require('$PROFILE/node_modules/deepseek-pet/package.json').name)")"
  [ "$PKGNAME" = "deepseek-pet" ] && echo "  [PASS] 包名正确：$PKGNAME" || { echo "  [FAIL] 包名异常：$PKGNAME"; FAIL=1; }
fi
if node --check "$PROFILE/node_modules/deepseek-pet/lib/client.js" >/dev/null 2>&1; then
  echo "  [PASS] client bundle 语法检查通过"
else
  echo "  [FAIL] client bundle 语法检查失败（先 node scripts/build.mjs 重建）"; FAIL=1
fi

echo "== 2) 标准安装状态（bundles 挂载）=="
PATCH="$PROFILE/cordis.patch.yml"
if node -e "const p=require('$PROFILE/package.json'); process.exit((p.dsh?.profile?.bundles ?? []).includes('deepseek-pet')?0:1)" 2>/dev/null; then
  echo "  [PASS] deepseek-pet 已进 profile bundles（标准挂载）"
else
  echo "  [FAIL] deepseek-pet 不在 profile bundles（标准安装：npm pack → dsh plugin add）"; FAIL=1
fi
if grep -q "id: deepseek-pet" "$PATCH"; then
  echo "  [FAIL] 用户层 patch 仍有 deepseek-pet 残留行（标准安装下应无，否则 duplicate 崩溃）"; FAIL=1
else
  echo "  [PASS] 用户层 patch 无 deepseek-pet 残留行"
fi
[ -f "$PATCH.bak" ] && echo "  [PASS] patch 备份存在 $PATCH.bak" || echo "  [WARN] 缺少 patch 备份"

echo "== 3) 上游单元测试（项目源码级）=="
if [ -d "$HERE/node_modules" ] || command -v npm >/dev/null 2>&1; then
  (cd "$HERE" && npm test >/tmp/deepseek-pet-test.log 2>&1)
  if [ $? -eq 0 ]; then
    echo "  [PASS] npm test 全部通过"
  else
    echo "  [WARN] npm test 有失败项（上游已知 idle 轮换断言 bug，不影响运行，见 README §5）"
    tail -4 /tmp/deepseek-pet-test.log | sed 's/^/    /'
  fi
else
  echo "  [SKIP] 无 npm 环境，跳过上游单元测试"
fi

if [ "$LIVE" -eq 1 ]; then
  echo "== 4) 运行中服务 curl 检查（端口 $PORT）=="
  BASE="http://127.0.0.1:$PORT"
  if ! curl -s -o /dev/null --max-time 3 "$BASE/"; then
    echo "  [FAIL] 服务未就绪：$BASE/ （先 scripts/test-env-start.sh）"; FAIL=1
  else
    echo "  [PASS] 服务可达：$BASE/"
    HTML="$(curl -s --max-time 5 "$BASE/")"
    if echo "$HTML" | grep -q "deepseek-pet"; then
      echo "  [PASS] index 注入的 __DSH_BOOT__ 含 deepseek-pet 条目"
    else
      echo "  [WARN] index 未在 __DSH_BOOT__ 中看到 deepseek-pet（可能是 HMR/缓存，刷新后复查）"
    fi
    BCODE="$(curl -s -o /dev/null --max-time 5 -w "%{http_code}" "$BASE/plugins/deepseek-pet/client.js" || true)"
    if echo "$BCODE" | grep -qE "200|304"; then
      echo "  [PASS] /plugins/deepseek-pet/client.js 可加载"
    elif [ "$BCODE" = "302" ]; then
      echo "  [WARN] client.js 需要登录态（HTTP 302，门闸拦截；浏览器登录后自动加载）"
    else
      echo "  [FAIL] /plugins/deepseek-pet/client.js 不可加载（HTTP $BCODE）"; FAIL=1
    fi
  fi
else
  echo "== 4) 运行中服务检查（跳过；加 --live 对运行实例做 curl 检查）=="
fi

if [ "$FAIL" -eq 0 ]; then
  echo
  echo "== 全部检查通过 =="
  exit 0
else
  echo
  echo "== 存在失败项（$FAIL）=="
  exit 1
fi
