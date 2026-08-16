#!/usr/bin/env node
/**
 * dsh-task-suite —— 幂等安装器（写入测试 profile，绝不触碰正式环境）。
 *
 * 把已构建（含 lib/）的套件包复制进 profile 的 node_modules/@zzyyyds88/，
 * 生成皮肤包的 profile 符号链接（模拟 dsh-skin / skin-switch 的 link 行为），
 * 并把聚合包的 cordis.patch.yml insert 行 + 启用皮肤的 insert 行写入
 * profile 的 cordis.patch.yml（首次写入前备份为 .bak）。
 *
 * 用法：
 *   node install-suite-plugin.mjs --profile-dir <profile> --dsh-home <DSH_HOME> [--skin <id>]
 *
 * 参数：
 *   --profile-dir  目标 profile 目录（必须是测试环境路径，安全断言）
 *   --dsh-home     DSH_HOME（用于回退/一致性，本脚本只写 profile-dir）
 *   --skin         初始启用的皮肤 id（默认 maid-atelier；null = 不启用皮肤）
 *
 * 重跑幂等：已有包覆盖为最新构建；patch 行已存在则跳过；符号链接重建。
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SUITE_ROOT = HERE

// ---- 参数解析 ----
const args = process.argv.slice(2)
function argValue(name) {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const PROFILE_DIR = argValue('--profile-dir')
const DSH_HOME = argValue('--dsh-home') ?? PROFILE_DIR
const SKIN_ID = argValue('--skin') === 'null' ? null : (argValue('--skin') ?? 'maid-atelier')

if (!PROFILE_DIR) {
  console.error('✗ 缺少 --profile-dir（目标 profile 目录）')
  process.exit(1)
}

// ---- 安全断言：目标必须是测试环境 ----
// 测试环境特征：目录名以 test-env 开头，且其 DSH_HOME 布局（profiles/web）存在。
const TEST_ENV_HINT = /(^|\/)(test-env(-\d+)?)\//.test(resolve(PROFILE_DIR))
if (!TEST_ENV_HINT) {
  console.error(`✗ 安全断言失败：--profile-dir 不是测试环境路径（${PROFILE_DIR}）。正式环境由用户手动安装。`)
  process.exit(1)
}
const SCOPE_DIR = join(PROFILE_DIR, 'node_modules', '@zzyyyds88')
mkdirSync(SCOPE_DIR, { recursive: true })

// ---- 要安装的包（源码目录 → 目标名取自 package.json.name） ----
const PACKAGE_SOURCES = [
  'packages/dsh-task-suite-all',
  'packages/dsh-task-board',
  'packages/dsh-live-stats',
  'packages/dsh-git-graph',
  'packages/dsh-aionui-panel',
  'packages/dsh-web-ui-settings',
  'packages/dsh-skins',          // 皮肤聚合载体（含 skins/ 资产），skin-center 宿主解析需要
  'packages/skins/skin-center',
]
const SKIN_SOURCES_DIR = join(SUITE_ROOT, 'packages', 'skins')

function copyPackage(srcDir, dstDir) {
  const pkg = JSON.parse(readFileSync(join(srcDir, 'package.json'), 'utf8'))
  if (!pkg.name.startsWith('@zzyyyds88/')) throw new Error(`包名非 @zzyyyds88：${pkg.name}（${srcDir}）`)
  const short = pkg.name.slice('@zzyyyds88/'.length)
  const dst = join(dstDir, short)
  // 清旧装新：lib/ 整体替换，其余文件（package.json / skins/ / skin.json …）按包复制。
  rmSync(dst, { recursive: true, force: true })
  cpSync(srcDir, dst, {
    recursive: true,
    filter: (src) => !/node_modules/.test(src) && !/\/\.git(\/|$)/.test(src),
  })
  // 未构建的包不允许安装：常规包需 lib/；dsh-skins 是皮肤聚合载体，需 skins/
  const isSkinCarrier = short === 'dsh-skins'
  const built = isSkinCarrier
    ? existsSync(join(dst, 'skins')) && readdirSync(join(dst, 'skins')).length > 0
    : existsSync(join(dst, 'lib', 'index.js')) || existsSync(join(dst, 'lib'))
  if (!built) {
    throw new Error(`未构建（${isSkinCarrier ? '无 skins/' : '无 lib/'}）：${pkg.name}（先 bash build.sh）`)
  }
  return short
}

console.log('== 1/4 复制套件包 → node_modules/@zzyyyds88/ ==')
const installed = []
for (const rel of PACKAGE_SOURCES) {
  const src = join(SUITE_ROOT, rel)
  const short = copyPackage(src, SCOPE_DIR)
  installed.push(short)
  console.log(`  ✓ ${short}`)
}

// ---- 皮肤符号链接：启用皮肤的包名解析到 dsh-skins/skins/<id> ----
// 与 dsh-skin / skin-switch 的 link 行为一致（非启用皮肤不建链接，GUI 切换时由
// skin-center 宿主动态建/拆）。
console.log('== 2/4 皮肤符号链接 ==')
const SKIN_PREFIX = 'dsh-client-ui-skin-'
const skinIds = readdirSync(SKIN_SOURCES_DIR).filter((d) => existsSync(join(SKIN_SOURCES_DIR, d, 'skin.json')))
if (SKIN_ID !== null) {
  if (!skinIds.includes(SKIN_ID)) {
    console.error(`✗ 未知皮肤 id：${SKIN_ID}（可用：${skinIds.join(', ')}）`)
    process.exit(1)
  }
  const link = join(SCOPE_DIR, SKIN_PREFIX + SKIN_ID)
  const target = join(SCOPE_DIR, 'dsh-skins', 'skins', SKIN_ID)
  if (!existsSync(target)) {
    console.error(`✗ 皮肤载体缺失：${target}（先 pnpm --filter @zzyyyds88/dsh-skins build）`)
    process.exit(1)
  }
  rmSync(link, { recursive: true, force: true })
  symlinkSync(relative(dirname(link), target), link)
  console.log(`  ✓ ${SKIN_PREFIX}${SKIN_ID} → dsh-skins/skins/${SKIN_ID}`)
} else {
  console.log('  （--skin null，不启用皮肤）')
}

// ---- cordis.patch.yml（profile 层）：仅聚合包行 ----
// 皮肤启用/互斥由 HOME 层 cordis.patch.yml 的 dsh-skin managed 区段管理
// （与 skin-center 宿主 skin-switch.ts 一致）；profile 层写皮肤行会造成
// duplicate loader entry id（同一 id 两处 insert）——见 install 说明。
console.log('== 3/4 cordis.patch.yml 条目 ==')
const PATCH_FILE = join(PROFILE_DIR, 'cordis.patch.yml')
const PATCH_BAK = PATCH_FILE + '.bak'

/** 解析 YAML insert 行：{- insert: [{id, name}, ...]} */
function parseInsertRows(text) {
  const rows = []
  const re = /- insert:\n((?:\s+- id: [^\n]+\n\s+name: [^\n]+\n(?:[^\n]*\n)*?)*)/g
  let m
  while ((m = re.exec(text)) !== null) {
    const block = m[1]
    const rowRe = /- id: ([^\s]+)\n\s+name: ([^\s]+)/g
    let r
    while ((r = rowRe.exec(block)) !== null) {
      // name 可能带引号（'x' / "x"），剥掉引号再统一重写
      rows.push({ id: r[1], name: r[2].replace(/^['"]|['"]$/g, '') })
    }
  }
  return rows
}

const aggregatePatch = readFileSync(join(SUITE_ROOT, 'packages', 'dsh-task-suite-all', 'cordis.patch.yml'), 'utf8')
const aggregateRows = parseInsertRows(aggregatePatch)
if (aggregateRows.length === 0) throw new Error('聚合包 cordis.patch.yml 无 insert 行（先 node scripts/aggregate.mjs）')

let existing = ''
if (existsSync(PATCH_FILE)) existing = readFileSync(PATCH_FILE, 'utf8')
const existingRows = parseInsertRows(existing)

// profile 层只写聚合行（跳过已存在的 id）
const toWrite = aggregateRows.filter((w) => !existingRows.some((e) => e.id === w.id))

if (toWrite.length > 0) {
  if (!existsSync(PATCH_BAK)) {
    if (existsSync(PATCH_FILE)) cpSync(PATCH_FILE, PATCH_BAK)
    console.log(`  （已备份原 patch → ${PATCH_BAK}）`)
  }
  // 基线空 patch 是 "注释 + []" 文档：剥掉注释后只剩 [] / 空 → 整体替换为干净内容。
  const body = existing.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'))
  const isEmptyBaseline = body.length === 0 || (body.length === 1 && body[0] === '[]')
  const lines = isEmptyBaseline ? [] : existing.split('\n').filter((l) => l.trim() !== '')
  lines.push('')
  lines.push('# --- dsh-task-suite managed (auto-generated by install-suite-plugin.mjs; do not edit) ---')
  for (const row of toWrite) {
    lines.push('- insert:')
    lines.push(`    - id: ${row.id}`)
    lines.push(`      name: '${row.name}'`)
  }
  writeFileSync(PATCH_FILE, lines.join('\n') + '\n')
  console.log(`  ✓ 写入 ${toWrite.length} 行（${toWrite.map((r) => r.id).join(', ')}）`)
} else {
  console.log('  （patch 行已就位，跳过）')
}

// ---- HOME 层 cordis.patch.yml：dsh-skin managed 区段（皮肤启用/互斥）----
// 与 skin-switch.ts 的 renderManaged 同构：全部皮肤 disabled，仅启用皮肤 insert。
const HOME_PATCH_FILE = join(DSH_HOME, 'cordis.patch.yml')
if (SKIN_ID !== null) {
  const skinMeta = JSON.parse(readFileSync(join(SKIN_SOURCES_DIR, SKIN_ID, 'skin.json'), 'utf8'))
  const managed = renderManagedSection(skinIds, SKIN_ID, skinMeta.package)
  let homeExisting = ''
  if (existsSync(HOME_PATCH_FILE)) homeExisting = readFileSync(HOME_PATCH_FILE, 'utf8')
  // 剥掉既有 managed 区段（含旧区段），保留其余内容后追加新区段
  const stripped = homeExisting.replace(/# --- dsh-skin managed[\s\S]*?# --- end dsh-skin managed ---\n?/, '').trimEnd()
  writeFileSync(HOME_PATCH_FILE, (stripped === '' ? '' : stripped + '\n\n') + managed)
  console.log(`  ✓ HOME 层 managed 区段：启用 ${SKIN_ID}（${HOME_PATCH_FILE}）`)
} else {
  console.log('  （--skin null，不写 HOME 层 managed 区段）')
}

/** 渲染 dsh-skin managed 区段（同 skin-switch renderManaged）。 */
function renderManagedSection(allSkinIds, activeId, activePackage) {
  const others = allSkinIds.filter((id) => id !== activeId).sort()
  const lines = ['# --- dsh-skin managed (auto-generated; do not edit) ---']
  for (const id of others) {
    lines.push(`- id: ui-skin-${id}`)
    lines.push('  disabled: true')
  }
  lines.push('- insert:')
  lines.push(`    - id: ui-skin-${activeId}`)
  lines.push(`      name: '${activePackage}'`)
  lines.push('# --- end dsh-skin managed ---')
  return lines.join('\n') + '\n'
}

console.log('== 4/4 完成 ==')
console.log(`  已安装包：${installed.join(', ')}`)
console.log(`  启用皮肤：${SKIN_ID ?? '无'}`)
console.log('  下一步：scripts/test-env-stop.sh && scripts/test-env-start.sh，然后 bash verify.sh')
