#!/usr/bin/env bash
# 把 dsh-defaults 统一插件安装到工作区测试环境（只写 test-envs/，不碰正式环境）。
# 包含：fork 包覆盖（本项目 packages/ 内 picker/llm/pi-ai/apiproxy 本地副本）+
# 官方 client 目录选择器回退 + 两个新插件 + cordis.patch.yml 挂载。
# 前置：测试环境已初始化（scripts/test-env-init.sh，正式克隆基线）；
# 验收纪律：测试完成后等用户验收通过，才允许 scripts/test-env-reset.sh --verified 清理。
# 用法：./install-to-test-env.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WS_ROOT="$(cd "$HERE/.." && pwd)"
# 多测试环境：TEST_ENV_INDEX（1-4，默认 1）→ test-envs/test-env-N
source "$WS_ROOT/scripts/test-env-common.sh"
resolve_test_env
PROFILE="$TEST_ENV/profiles/web"
DST="$PROFILE/node_modules/@deepseek-ai"
# fork 源码全部在本项目 packages/（含 dsh-host-apiproxy 本地副本，自包含）
FORKS_ROOT="$WS_ROOT/dsh-Moresettings/packages"

# 官方基线 node_modules 为空目录；创建目标目录供 fork/插件落位。
mkdir -p "$DST"

echo "== 1. fork 包覆盖（同包名）=="
for pkg in dsh-host-directory-picker-browse dsh-llm dsh-llm-deepseek dsh-llm-pi-ai dsh-host-apiproxy; do
  src="$FORKS_ROOT/$pkg"
  [ -d "$src/lib" ] || { echo "  ✗ 未构建（先 ./build.sh）：$src"; exit 1; }
  dst="$DST/$pkg"
  if [ -d "$dst" ]; then
    rm -rf "$dst.bak"
    cp -a "$dst" "$dst.bak"
    echo "  备份旧包 → $dst.bak"
  fi
  mkdir -p "$dst"
  rm -rf "$dst/lib"
  cp -a "$src/lib" "$dst/lib"
  cp "$src/package.json" "$dst/package.json"
  echo "  ✓ $pkg"
done

echo "== 2. 回退官方 client 目录选择器（旧构建期注入 fork 退役，避免与设置默认目录冲突）=="
if [ -d "$DST/dsh-client-ui-directory-picker-browse" ]; then
  rm -rf "$DST/dsh-client-ui-directory-picker-browse"
  echo "  已移除 profile 内 fork（Loader 回退解析全局官方版）"
else
  echo "  （profile 内无该 fork，无需回退）"
fi

echo "== 3. 新插件复制 =="
case "$PROFILE" in
  "$TEST_ENV/"*) ;;
  *) echo "✗ 安全断言失败：目标 profile 不在测试环境内（$PROFILE）"; exit 1 ;;
esac
node "$HERE/install-defaults-plugin.mjs" --profile-dir "$PROFILE" --dsh-home "$TEST_ENV"

echo
echo "完成。重启测试实例生效（仅测试环境，端口 3090）："
echo "  scripts/test-env-stop.sh && scripts/test-env-start.sh"
echo "验证：bash $HERE/verify.sh --test-env"
