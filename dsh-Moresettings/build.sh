#!/usr/bin/env bash
# 构建 dsh-defaults 统一插件依赖的全部 fork 包（源码全部在本项目 packages/ 内，
# 注：dsh-host-apiproxy 已弃用（rc.7 移除白名单，所有命名空间自动可见），
#     dsh-AccessGate/ 与 dsh-Moresettings/ 各自维护的 apiproxy 副本均不再需要。
# 新插件本体（dsh-defaults / dsh-client-ui-defaults）为手写 ESM，源码即产物，无需构建。
# 用法：./build.sh
set -euo pipefail
cd "$(dirname "$0")"

# 自举构建依赖：全新 clone 无 node_modules，先在各 fork 包内 pnpm install 恢复
# 构建依赖（tsdown / lightningcss / typescript，锁文件已入库），再 pnpm build。
FORKS="dsh-host-directory-picker-browse dsh-llm dsh-llm-deepseek dsh-llm-pi-ai"

for pkg in $FORKS; do
  echo "== 构建 $pkg =="
  ( cd "packages/$pkg" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install ) && \
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
