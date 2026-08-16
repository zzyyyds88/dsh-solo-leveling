#!/usr/bin/env bash
# 构建 dsh-defaults 统一插件依赖的全部 fork 包（源码全部在本项目 packages/ 内，
# 含 dsh-host-apiproxy 的本地副本——与 dsh-AccessGate/ 各自维护一份同源码 fork，
# 互不交叉引用；两份均含 access-gate + dsh-defaults 两个命名空间暴露，正式 profile
# 同包名覆盖时无论哪份生效两项目卡片都可用）。
# 新插件本体（dsh-defaults / dsh-client-ui-defaults）为手写 ESM，源码即产物，无需构建。
# 用法：./build.sh
set -euo pipefail
cd "$(dirname "$0")"

# 自举构建依赖：build/tsdown.client.ts 需要 lightningcss，包内已有副本；
# 项目根 node_modules（.gitignore 忽略）缺则建软链，保证 clone 后可直接构建。
if [ ! -e node_modules/lightningcss ]; then
  mkdir -p node_modules
  ln -s "$(pwd)/packages/dsh-llm-pi-ai/node_modules/.pnpm/lightningcss@1.32.0/node_modules/lightningcss" node_modules/lightningcss
  echo "  自举：node_modules/lightningcss → 包内 .pnpm 副本"
fi

FORKS="dsh-host-directory-picker-browse dsh-llm dsh-llm-deepseek dsh-llm-pi-ai dsh-host-apiproxy"

for pkg in $FORKS; do
  echo "== 构建 $pkg（本包目录内直接构建）=="
  ( cd "packages/$pkg" && pnpm build )
done

echo
echo "构建完成。产物："
for pkg in $FORKS; do
  lib="packages/$pkg/lib"
  [ -d "$lib" ] && echo "  ✓ $pkg  ($(du -sh "$lib" | cut -f1))" || echo "  ✗ $pkg 缺少 lib/"
done
echo
echo "下一步：装进测试环境验证（./install-to-test-env.sh），或正式安装（./install-to-profile.sh，需用户执行）。"
