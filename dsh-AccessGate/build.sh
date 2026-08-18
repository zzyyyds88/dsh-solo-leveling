#!/usr/bin/env bash
# 构建访问门禁依赖的三个 tsdown fork 包（源码全部在本项目 packages/ 内，自包含、不跨项目引用）。
# 注：dsh-host-apiproxy 已弃用（rc.7 移除白名单，所有命名空间自动可见），
#     dsh-client-ui-settings（远程设置卡片放行）**无需构建**——
#     官方发布包未附 TS 源码，直接改构建产物 lib/client.js（见其 README），不在此列表。
# 用法：./build.sh
set -euo pipefail
cd "$(dirname "$0")"

# 自举构建依赖：全新 clone 无 node_modules，先在各 fork 包内 pnpm install 恢复
# 构建依赖（tsdown / lightningcss / typescript，锁文件已入库），再 pnpm build。
FORKS="dsh-host-webserver dsh-client-connection"

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
echo "下一步：装进测试环境验证（./install-to-test-env.sh），或正式安装（install-access-gate-plugin.mjs，需用户执行）。"
