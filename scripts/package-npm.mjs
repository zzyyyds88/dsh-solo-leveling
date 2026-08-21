#!/usr/bin/env node
/**
 * package-npm.mjs —— 跨平台打包脚本（Linux / Windows / Termux 通用）。
 *
 * 用途：把「大宝贝定制版」dsh CLI 及其全部 workspace 依赖打包成 npm tarball
 * （等价于 scripts/package-npm.sh，但用 Node 实现，Windows/Termux 也能跑）。
 *
 * 版本策略（关键）：本仓库所有 workspace 包版本号均带 `-local.1` 本地后缀
 * （如 0.1.0-rc.8-local.1）。官方 @deepseek-ai 包已在 registry 发布更高版本，
 * 若不区分版本，`npm i -g ./dist/npm/*.tgz` 时 npm 按 semver「最高版本优先」
 * 会从 registry 拉官方包覆盖本仓库的 fork 定制。本地后缀使本地版本恒高于
 * 官方（非数字 prerelease 段 > 数字段），且官方不会发布带 `-local.` 后缀的
 * 版本 → 安装时必然使用本仓库 tarball。
 *
 * 用法：
 *   node scripts/package-npm.mjs [--scope @zzyyyds88]
 * 产出：dist/npm/<name>-<version>.tgz（dsh CLI + 全部 workspace 依赖包）
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WS_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
process.chdir(WS_ROOT)

let scope = '@deepseek-ai'
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scope' && i + 1 < args.length) {
    scope = args[++i]
  } else {
    console.error(`未知参数: ${args[i]}`)
    process.exit(1)
  }
}

/** 枚举 workspace 包清单（packages、vendor、apps、native、website、examples 下的包）。 */
function workspacePackages() {
  const roots = ['packages', 'vendor', 'apps', 'native', 'website', 'examples']
  const out = []
  const seen = new Set()
  const visit = (dir) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const pkg = join(dir, entry.name, 'package.json')
      if (existsSync(pkg)) {
        try {
          const meta = JSON.parse(readFileSync(pkg, 'utf8'))
          if (meta.name && !seen.has(meta.name)) {
            seen.add(meta.name)
            out.push({ name: meta.name, dir: join(dir, entry.name) })
          }
        } catch { /* 非 JSON 忽略 */ }
      } else if (dir !== 'native') {
        visit(join(dir, entry.name))
      }
    }
  }
  for (const root of roots) visit(root)
  // native/landlock-run/packages/* 是二层结构
  visit('native/landlock-run/packages')
  return out
}

console.log('== 1/2 构建（pnpm run build:official）==')
try {
  execFileSync('pnpm', ['run', 'build:official'], { stdio: 'inherit', shell: process.platform === 'win32' })
} catch (error) {
  console.error('构建失败:', error.message)
  process.exit(1)
}

console.log('== 2/2 打包全部 workspace 包 ==')
rmSync('dist/npm', { recursive: true, force: true })
mkdirSync('dist/npm', { recursive: true })

const packages = workspacePackages()
let skipped = 0
for (const pkg of packages) {
  try {
    execFileSync('pnpm', ['--filter', pkg.name, 'pack', '--pack-destination', 'dist/npm'],
      { stdio: 'ignore', shell: process.platform === 'win32' })
  } catch {
    console.log(`  （跳过 ${pkg.name}：pack 失败）`)
    skipped++
  }
}

console.log(`\n== 完成。tarball 列表（${packages.length - skipped} 个）：==`)
for (const file of readdirSync('dist/npm').filter(f => f.endsWith('.tgz'))) {
  console.log(`  ${file}`)
}
console.log(`
本地测试（用户侧）：
  npm i -g ./dist/npm/*.tgz   # 或逐个安装
  dsh web                     # 默认 HTTPS：https://0.0.0.0:3080
正式发布（个人 scope）：node scripts/package-npm.mjs --scope @zzyyyds88 后 npm publish；
  bin 仍叫 dsh，发布包归 @zzyyyds88 scope。`)
