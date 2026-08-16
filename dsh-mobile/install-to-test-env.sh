#!/usr/bin/env bash
# 把构建好的 dsh-mobile-adapt 装进工作区测试环境（只写 test-envs/，不碰正式环境）。
# 用法：bash install-to-test-env.sh            # 默认 TEST_ENV_INDEX=1
#       TEST_ENV_INDEX=2 bash install-to-test-env.sh
# 覆盖前自动备份现有包为 .bak（回退：把 .bak 拷回 node_modules/dsh-mobile-adapt）。
# 挂载：幂等地把 mobile-adapt 插件行写进测试 profile 的 cordis.patch.yml
#       （基线为空 patch，不写挂载行插件不会生效；与 verify.sh 的约定一致）。
set -euo pipefail

WS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_INDEX="${TEST_ENV_INDEX:-1}"
case "$ENV_INDEX" in
  1) TEST_ENV="$WS_ROOT/test-envs/test-env-1" ;;
  2) TEST_ENV="$WS_ROOT/test-envs/test-env-2" ;;
  3) TEST_ENV="$WS_ROOT/test-envs/test-env-3" ;;
  4) TEST_ENV="$WS_ROOT/test-envs/test-env-4" ;;
  *) echo "✗ 不支持的环境索引 TEST_ENV_INDEX=$ENV_INDEX" >&2; exit 1 ;;
esac

[ -d "$PROJECT_DIR/lib" ] || { echo "✗ 未构建（无 lib/），先 bash build.sh"; exit 1; }

DST="$TEST_ENV/profiles/web/node_modules/dsh-mobile-adapt"
mkdir -p "$DST"

if [ -f "$DST/package.json" ] || [ -d "$DST/lib" ]; then
  rm -rf "$DST.bak"
  cp -a "$DST" "$DST.bak"
  echo "  备份旧包 → $DST.bak"
fi

rm -rf "$DST/lib"
cp -a "$PROJECT_DIR/lib" "$DST/lib"
cp "$PROJECT_DIR/package.json" "$DST/package.json"
echo "  ✓ dsh-mobile-adapt 已装进 $TEST_ENV"

# ---------- 幂等写入挂载行（cordis.patch.yml） ----------
PATCH="$TEST_ENV/profiles/web/cordis.patch.yml"
[ -f "$PATCH" ] || { echo "✗ 找不到 profile patch 文件：$PATCH"; exit 1; }

if grep -q "id: mobile-adapt" "$PATCH" && grep -q "name: dsh-mobile-adapt" "$PATCH"; then
  echo "  （cordis.patch.yml 已含 mobile-adapt 挂载行，跳过）"
else
  if [ ! -s "$PATCH" ] || grep -q '^\[\]$' "$PATCH"; then
    # 基线空 patch（`[]` 或空文件）：整个替换为挂载块（空数组后不能追加顶层项）
    cat > "$PATCH" <<'EOF'
# dsh-mobile-adapt 挂载（install-to-test-env.sh 自动写入）
- insert:
    - id: mobile-adapt
      name: dsh-mobile-adapt
      inject:
        - webServer
EOF
  else
    # 已有其他挂载行：顶层数组末尾追加一个 insert 块（多个 insert 元素合法）
    printf '\n- insert:\n    - id: mobile-adapt\n      name: dsh-mobile-adapt\n      inject:\n        - webServer\n' >> "$PATCH"
  fi
  echo "  ✓ mobile-adapt 挂载行已写入 cordis.patch.yml"
fi

echo
echo "完成。重启测试实例生效："
echo "  scripts/test-env-stop.sh && scripts/test-env-start.sh"
echo "回退：把 $DST.bak 拷回 $DST。"
