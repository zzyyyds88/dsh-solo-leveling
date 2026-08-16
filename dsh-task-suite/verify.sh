#!/usr/bin/env bash
# verify.sh —— dsh-task-suite 套件验证。
# 用法：
#   bash verify.sh              # 静态检查（包在位 + patch 条目 + bundle 语法）
#   bash verify.sh --live       # 额外对运行中测试实例做 HTTP 检查（需已启动）
# 环境变量：TEST_ENV_INDEX（1-4，默认 1）
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
WS_ROOT="$(cd "$HERE/.." && pwd)"
source "$WS_ROOT/scripts/test-env-common.sh"
resolve_test_env
PROFILE="$TEST_ENV/profiles/web"
SCOPE="$PROFILE/node_modules/@zzyyyds88"
LIVE=0
[ "${1:-}" = "--live" ] && LIVE=1
FAIL=0

PACKAGES="dsh-task-suite-all dsh-client-ui-task-board dsh-live-stats dsh-client-ui-git-graph dsh-client-ui-aionui-panel dsh-client-ui-web-ui-settings dsh-tool-describe-image dsh-skins dsh-client-ui-skin-center"
PATCH_ROWS="ui-web-ui-compat ui-web-ui-settings ui-dsh-aionui-panel ui-task-board ui-git-graph live-stats describe-image ui-skin-center"

echo "== 1) 套件包已装入测试 profile（node_modules/@zzyyyds88/）=="
for pkg in $PACKAGES; do
  if [ "$pkg" = "dsh-skins" ]; then
    # dsh-skins 是皮肤聚合载体：无 lib/，以 skins/ 资产为构建标志（下面单独检查）
    if [ -f "$SCOPE/$pkg/package.json" ]; then
      echo "  [PASS] $pkg（载体 package.json）"
    else
      echo "  [FAIL] $pkg 缺失（先 bash build.sh && bash install-to-test-env.sh）"; FAIL=1
    fi
    continue
  fi
  if [ -f "$SCOPE/$pkg/package.json" ] && [ -f "$SCOPE/$pkg/lib/index.js" ] && [ -f "$SCOPE/$pkg/lib/client.js" ]; then
    echo "  [PASS] $pkg（package.json + lib/index.js + lib/client.js）"
  else
    echo "  [FAIL] $pkg 缺失或未构建（先 bash build.sh && bash install-to-test-env.sh）"; FAIL=1
  fi
done
# dsh-skins 皮肤资产
if [ -d "$SCOPE/dsh-skins/skins" ] && [ "$(ls "$SCOPE/dsh-skins/skins" | wc -l)" -ge 11 ]; then
  echo "  [PASS] dsh-skins 皮肤资产（$(ls "$SCOPE/dsh-skins/skins" | wc -l) 款）"
else
  echo "  [FAIL] dsh-skins/skins 皮肤资产不足（应先 pnpm --filter @zzyyyds88/dsh-skins build）"; FAIL=1
fi
# 皮肤包在位（标准安装：皮肤为真实依赖目录，非符号链接）
SKIN_COUNT="$(ls "$SCOPE" 2>/dev/null | grep -c '^dsh-client-ui-skin-' || true)"
if [ "$SKIN_COUNT" -ge 1 ]; then
  echo "  [PASS] 皮肤包在位（$SKIN_COUNT 款依赖目录）"
else
  echo "  [WARN] 无皮肤包（SKIN=null 安装或未启用皮肤，可接受）"
fi

echo "== 2) client bundle 语法检查 =="
SYNTAX_FAIL=0
for f in "$SCOPE"/*/lib/client.js; do
  if node --check "$f" >/dev/null 2>&1; then :; else
    echo "  [FAIL] 语法错误：$f"; SYNTAX_FAIL=1
  fi
done
if [ "$SYNTAX_FAIL" -eq 0 ]; then
  echo "  [PASS] $(ls "$SCOPE"/*/lib/client.js 2>/dev/null | wc -l) 个 client bundle 语法检查通过"
else
  FAIL=1
fi

echo "== 3) 标准安装状态（bundles 挂载）=="
PATCH="$PROFILE/cordis.patch.yml"
HOME_PATCH="$TEST_ENV/cordis.patch.yml"
# 标准插件包安装：聚合包进 profile bundles（其 dsh.bundle.patch 汇总 8 行挂载），
# 用户层 patch 不应再有 @zzyyyds88 行（残留会 duplicate 崩溃）
if node -e "const p=require('$PROFILE/package.json'); process.exit((p.dsh?.profile?.bundles ?? []).includes('@zzyyyds88/dsh-task-suite-all')?0:1)" 2>/dev/null; then
  echo "  [PASS] 聚合包 @zzyyyds88/dsh-task-suite-all 已进 profile bundles（标准挂载）"
else
  echo "  [FAIL] 聚合包不在 profile bundles（标准安装：pnpm -r pack → dsh plugin add）"; FAIL=1
fi
if grep -Eq "^\s*name: '?@zzyyyds88|^\s*- id: @zzyyyds88" "$PATCH" 2>/dev/null; then
  echo "  [FAIL] 用户层 patch 仍有 @zzyyyds88 残留行（标准安装下应无）"; FAIL=1
else
  echo "  [PASS] 用户层 patch 无 @zzyyyds88 残留行"
fi
# 皮肤互斥由 HOME 层 cordis.patch.yml 的 dsh-skin managed 区段管理（与 skin-center 一致）
if [ -f "$HOME_PATCH" ] && grep -q "dsh-skin managed" "$HOME_PATCH"; then
  ACTIVE_SKIN_ROW="$(grep -B1 'name: .@zzyyyds88/dsh-client-ui-skin-' "$HOME_PATCH" | grep 'id: ui-skin-' | head -1)"
  echo "  [PASS] HOME 层 managed 区段：$ACTIVE_SKIN_ROW"
else
  echo "  [WARN] HOME 层无 managed 区段（SKIN=null 安装或尚未启用皮肤，可接受）"
fi

if [ "$LIVE" -eq 1 ]; then
  echo "== 4) 运行中实例 HTTP 检查（端口 $PORT）=="
  BASE="http://127.0.0.1:$PORT"
  if ! curl -s -o /dev/null --max-time 3 "$BASE/"; then
    echo "  [FAIL] 服务未就绪：$BASE/ （先 scripts/test-env-start.sh）"; FAIL=1
  else
    echo "  [PASS] 服务可达：$BASE/"
    # 门闸检测：未登录 302 → boot/bundle 检查需登录态（浏览器登录后可见）
    ROOT_CODE="$(curl -s -o /dev/null --max-time 3 -w '%{http_code}' "$BASE/" || true)"
    GATED=0; [ "$ROOT_CODE" = "302" ] && GATED=1
    HTML="$(curl -s --max-time 8 "$BASE/")"
    # 每个套件插件的 bundle URL 都应出现在 __DSH_BOOT__ 中
    BOOT_MISSING=0
    for pkg in dsh-task-suite-all dsh-client-ui-task-board dsh-live-stats dsh-client-ui-git-graph dsh-client-ui-aionui-panel dsh-client-ui-web-ui-settings dsh-tool-describe-image dsh-client-ui-skin-center; do
      if echo "$HTML" | grep -q "/plugins/@zzyyyds88/$pkg/client.js"; then
        echo "  [PASS] boot 含 $pkg"
      elif [ "$GATED" -eq 1 ]; then
        echo "  [WARN] boot 检查需登录态（门闸 302，登录后浏览器加载）"
      else
        echo "  [FAIL] boot 缺 $pkg（刷新页面复查）"; BOOT_MISSING=1
      fi
    done
    [ "$BOOT_MISSING" -eq 0 ] || FAIL=1
    # 皮肤 bundle（启用皮肤 + skin-center）—— 从 HOME 层 managed 区段读
    SKIN_ACTIVE="$(grep -A2 '^- insert:$' "$HOME_PATCH" 2>/dev/null | grep 'id: ui-skin-' | head -1 | awk '{print $3}')"
    if [ -n "$SKIN_ACTIVE" ]; then
      SKIN_PKG="dsh-client-ui-skin-${SKIN_ACTIVE#ui-skin-}"
      if echo "$HTML" | grep -q "/plugins/@zzyyyds88/$SKIN_PKG/client.js"; then
        echo "  [PASS] boot 含启用皮肤 $SKIN_PKG"
      elif [ "$GATED" -eq 1 ]; then
        echo "  [WARN] boot 含启用皮肤检查需登录态（门闸）"
      else
        echo "  [FAIL] boot 缺启用皮肤 $SKIN_PKG"; FAIL=1
      fi
    fi
    # bundle 可加载（HTTP 200/304/302；302=门闸需登录态；dsh-skins 载体无 client bundle，跳过）
    for pkg in $PACKAGES; do
      [ "$pkg" = "dsh-skins" ] && continue
      code="$(curl -s -o /dev/null --max-time 5 -w "%{http_code}" "$BASE/plugins/@zzyyyds88/$pkg/client.js")"
      if echo "$code" | grep -qE "200|304"; then :; elif [ "$code" = "302" ]; then
        echo "  [WARN] /plugins/@zzyyyds88/$pkg/client.js 需登录态（302）"
      else
        echo "  [FAIL] /plugins/@zzyyyds88/$pkg/client.js → HTTP $code"; FAIL=1
      fi
    done
    echo "  [PASS] 全部 bundle 路由可加载"
    # 服务日志无启动错误
    if grep -qiE "error|failed|cannot find module|TDZ|is not defined" "$TEST_ENV/dsh-web.log" 2>/dev/null; then
      echo "  [WARN] 服务日志出现错误关键字（见 $TEST_ENV/dsh-web.log，人工复核）"
      grep -iE "error|failed|cannot find module|TDZ|is not defined" "$TEST_ENV/dsh-web.log" 2>/dev/null | tail -5 | sed 's/^/    /'
    else
      echo "  [PASS] 服务日志无错误关键字"
    fi
  fi
else
  echo "== 4) 运行中服务检查（跳过；加 --live 检查运行实例）=="
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
