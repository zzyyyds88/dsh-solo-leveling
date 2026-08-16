#!/usr/bin/env bash
# dsh-task-suite —— 一键构建（源码 → lib/ 产物）
# 顺序敏感：先构建全部皮肤 bundle → 再 bundle 进 dsh-skins 聚合 → 再重生成
# 皮肤中心注册表（skin-center-bundles 校验每个皮肤的 lib/client.js 存在）
# → 最后全量构建其余包（含皮肤中心与聚合包）。
# 用法：bash build.sh            # 首次（含 pnpm install）
#       bash build.sh --no-install   # 已装过依赖时跳过 pnpm install
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

if [ "${1:-}" != "--no-install" ]; then
  echo "== 1/4 pnpm install =="
  pnpm install
fi

echo "== 2/4 构建全部皮肤 bundle =="
pnpm -r --filter '@zzyyyds88/dsh-client-ui-skin-*' build

echo "== 3/4 bundle 皮肤进 dsh-skins 聚合 + 重生成皮肤中心注册表 =="
pnpm --filter @zzyyyds88/dsh-skins build
node scripts/skin-center-bundles

echo "== 4/4 全量构建（含皮肤中心 / 聚合包 / 各功能插件）=="
pnpm -r build

echo "== 校验 =="
node scripts/aggregate.mjs --check
node scripts/skin-center-bundles --check
echo "✓ 构建完成。安装到测试环境：bash install-to-test-env.sh"
