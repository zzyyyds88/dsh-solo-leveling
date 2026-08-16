#!/usr/bin/env node
/**
 * dsh-task-suite —— 标准插件包安装器（写入测试 profile，绝不触碰正式环境）。
 *
 * 标准安装：pnpm -r pack 全部 workspace 包 → 把 tgz 内 @zzyyyds88/* /
 * dsh-web-ui-shared 依赖改写为 file: 本地 tgz（离线解析）→
 * dsh plugin --profile web add（聚合包 + 全部皮肤包进 profile node_modules，
 * 聚合包带 dsh.bundle.patch 进 bundles 挂载，皮肤包为纯依赖由 HOME 层 managed 挂载）。
 * 同时收敛用户层 cordis.patch.yml：移除 @zzyyyds88 残留行（标准安装下挂载在
 * bundle 层，用户层残留会 duplicate 崩溃），保留 webserver/connection 等覆盖。
 * HOME 层 dsh-skin managed 区段（皮肤启用/互斥）照常写入。
 *
 * 用法：
 *   node install-suite-plugin.mjs --profile-dir <profile> --dsh-home <DSH_HOME> [--skin <id>]
 *
 * 参数：
 *   --profile-dir  目标 profile 目录（必须是测试环境路径，安全断言）
 *   --dsh-home     DSH_HOME（用于 dsh plugin add 的 DSH_HOME 环境变量）
 *   --skin         初始启用的皮肤 id（默认 maid-atelier；null = 不启用皮肤）
 *
 * 重跑幂等：bundles 已含则 dsh plugin add 跳过；收敛无残留行则无变更。
 */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SUITE_ROOT = HERE
const SKIN_SOURCES_DIR = join(SUITE_ROOT, 'packages', 'skins')

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
const TEST_ENV_HINT = /(^|\/)(test-env(-\d+)?)\//.test(resolve(PROFILE_DIR))
if (!TEST_ENV_HINT) {
  console.error(`✗ 安全断言失败：--profile-dir 不是测试环境路径（${PROFILE_DIR}）。正式环境由用户手动安装。`)
  process.exit(1)
}

const SKIN_PREFIX = 'dsh-client-ui-skin-'
const skinIds = readdirSync(SKIN_SOURCES_DIR).filter((d) => existsSync(join(SKIN_SOURCES_DIR, d, 'skin.json')))
const AGGREGATE_PKG = '@zzyyyds88/dsh-task-suite-all'

// ---- 1) 标准安装：pnpm -r pack → relink file: 依赖 → dsh plugin add ----
console.log('== 1/3 标准安装 @zzyyyds88 全家（pnpm -r pack + dsh plugin add）==')
const packTmp = mkdtempSync(join(tmpdir(), 'suite-pack-'))
const packed = spawnSync('pnpm', ['-r', 'pack', '--pack-destination', packTmp], { cwd: SUITE_ROOT, encoding: 'utf8' })
if (packed.status !== 0) {
  console.error(`✗ pnpm -r pack 失败：${packed.stderr ?? packed.stdout}`)
  process.exit(1)
}

// 收集 包名 → tgz 绝对路径
const nameToTgz = {}
for (const f of readdirSync(packTmp).filter((x) => x.endsWith('.tgz'))) {
  const manifest = JSON.parse(execFileSync('tar', ['-xzf', join(packTmp, f), '-O', 'package/package.json'], { encoding: 'utf8' }))
  nameToTgz[manifest.name] = join(packTmp, f)
}

// relink：tgz 内 dependencies 的 @zzyyyds88/* / dsh-web-ui-shared → file: 本地 tgz（离线解析）
for (const f of Object.values(nameToTgz)) {
  const work = mkdtempSync(join(tmpdir(), 'suite-relink-'))
  execFileSync('tar', ['-xzf', f, '-C', work])
  const pf = join(work, 'package', 'package.json')
  const j = JSON.parse(readFileSync(pf, 'utf8'))
  let changed = false
  for (const [dep, spec] of Object.entries(j.dependencies ?? {})) {
    if (nameToTgz[dep]) { j.dependencies[dep] = 'file:' + nameToTgz[dep]; changed = true }
  }
  if (changed) {
    writeFileSync(pf, JSON.stringify(j, null, 2) + '\n')
    execFileSync('bash', ['-c', `(cd ${JSON.stringify(work)} && tar -czf ${JSON.stringify(f)} package)`])
  }
  rmSync(work, { recursive: true, force: true })
}

// 安装清单：聚合包 + 全部皮肤包（skin-center 作为 dsh-skins 的 file: 传递依赖，不直接装，
// 避免其 dsh.bundle.patch 与聚合 patch 的 ui-skin-center 行重复挂载）
const installTgzs = [nameToTgz[AGGREGATE_PKG]]
for (const id of skinIds) {
  const n = '@zzyyyds88/' + SKIN_PREFIX + id
  if (nameToTgz[n]) installTgzs.push(nameToTgz[n])
}
const profileName = basename(PROFILE_DIR)
const add = spawnSync('dsh', ['plugin', '--profile', profileName, 'add', ...installTgzs], {
  cwd: PROFILE_DIR,
  env: { ...process.env, DSH_HOME },
  encoding: 'utf8',
})
if (add.status !== 0) {
  console.error(`✗ dsh plugin add 失败（exit ${add.status}）：${add.stderr ?? add.stdout}`)
  process.exit(1)
}
console.log(`  ✓ 标准安装完成：${AGGREGATE_PKG} + ${skinIds.length} 款皮肤（聚合包 bundles 挂载）`)

// ---- 2) 收敛用户层 patch：移除 @zzyyyds88 残留行 ----
// 标准安装下挂载在 bundle 层；用户层残留行（旧安装器写的聚合行/皮肤行）会 duplicate 崩溃。
console.log('== 2/3 收敛用户层 cordis.patch.yml（移除 @zzyyyds88 残留行）==')
const dshRoot = '/usr/lib/node_modules/@deepseek-ai/dsh'
const require = createRequire(join(dshRoot, 'package.json'))
const yaml = require('js-yaml')
const { entryListSchema } = require('@deepseek-ai/cordis-plugin-include')

const PATCH_FILE = join(PROFILE_DIR, 'cordis.patch.yml')
const PATCH_BAK = PATCH_FILE + '.bak'
if (!existsSync(PATCH_FILE)) throw new Error(`找不到 profile patch 文件：${PATCH_FILE}`)
if (!existsSync(PATCH_BAK)) {
  const { cpSync } = await import('node:fs')
  cpSync(PATCH_FILE, PATCH_BAK)
  console.log(`  （已备份原 patch → ${PATCH_BAK}）`)
}

// 聚合 patch 的全部 id + 皮肤 insert id = 要移除的集合
const aggregatePatch = readFileSync(join(SUITE_ROOT, 'packages', 'dsh-task-suite-all', 'cordis.patch.yml'), 'utf8')
const aggregateIds = [...aggregatePatch.matchAll(/- id: ([^\s]+)/g)].map((m) => m[1])
const REMOVE_IDS = new Set([...aggregateIds, ...skinIds.map((id) => 'ui-skin-' + id)])

const current = yaml.load(readFileSync(PATCH_FILE, 'utf8'), { schema: entryListSchema })
if (!Array.isArray(current)) throw new Error(`patch 文件必须是顶层 YAML 数组：${PATCH_FILE}`)
let changed = false
for (const entry of current) {
  if (typeof entry !== 'object' || entry === null) continue
  if (Array.isArray(entry.insert)) {
    const before = entry.insert.length
    entry.insert = entry.insert.filter((i) => !(i && REMOVE_IDS.has(i.id)))
    if (entry.insert.length !== before) changed = true
  }
}
const filtered = current.filter((e) => !(typeof e === 'object' && e !== null && typeof e.id === 'string' && REMOVE_IDS.has(e.id)))
if (filtered.length !== current.length) changed = true
current.length = 0
current.push(...filtered)

if (changed) {
  writeFileSync(PATCH_FILE, yaml.dump(current, { schema: entryListSchema, noRefs: true, lineWidth: 120 }))
  console.log(`  ✓ 已移除 ${REMOVE_IDS.size} 类残留行（聚合/皮肤行；标准安装由 bundle 层挂载）`)
} else {
  console.log('  （用户层 patch 无 @zzyyyds88 残留行，跳过）')
}

// ---- 3) HOME 层 cordis.patch.yml：dsh-skin managed 区段（皮肤启用/互斥）----
console.log('== 3/3 HOME 层皮肤 managed ==')
const HOME_PATCH_FILE = join(DSH_HOME, 'cordis.patch.yml')
if (SKIN_ID !== null) {
  if (!skinIds.includes(SKIN_ID)) {
    console.error(`✗ 未知皮肤 id：${SKIN_ID}（可用：${skinIds.join(', ')}）`)
    process.exit(1)
  }
  const skinMeta = JSON.parse(readFileSync(join(SKIN_SOURCES_DIR, SKIN_ID, 'skin.json'), 'utf8'))
  const managed = renderManagedSection(skinIds, SKIN_ID, skinMeta.package)
  let homeExisting = ''
  if (existsSync(HOME_PATCH_FILE)) homeExisting = readFileSync(HOME_PATCH_FILE, 'utf8')
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

console.log('== 完成 ==')
console.log(`  聚合包 bundles 挂载 + ${skinIds.length} 款皮肤依赖 + 启用皮肤：${SKIN_ID ?? '无'}`)
console.log('  下一步：scripts/test-env-stop.sh && scripts/test-env-start.sh，然后 bash verify.sh')
