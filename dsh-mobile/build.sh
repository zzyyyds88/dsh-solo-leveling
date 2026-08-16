#!/usr/bin/env bash
# dsh-mobile-adapt 构建：src/ → lib/（手写 bundle，无需打包器）
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

mkdir -p lib
cp src/index.js lib/index.js
cp src/client.js lib/client.js

# 语法校验
node --check lib/index.js
node --check lib/client.js

echo "✓ 构建完成："
echo "  lib/index.js  ($(wc -c < lib/index.js) bytes)"
echo "  lib/client.js ($(wc -c < lib/client.js) bytes)"
