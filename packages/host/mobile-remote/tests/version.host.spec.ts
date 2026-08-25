// Version reporting: readHostVersion branches, the walk-up manifest search
// (immediate hit, foreign-manifest skip, exhaustion), and the module-level
// constants derived at import time.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  HOST_VERSION, PLUGIN_VERSION,
  readHostVersion, readPluginVersion, resolveHostVersion,
} from '../src/core/version.ts'

/** Reader over an in-memory path → content table (throws like fs on misses). */
function tableReader(files: Record<string, string>): (path: string) => string {
  return (path) => {
    const hit = files[path]
    if (hit === undefined) throw new Error(`ENOENT: ${path}`)
    return hit
  }
}

const OWN = JSON.stringify({ name: '@deepseek-ai/dsh-host-mobile-remote', version: '9.9.9-local' })

describe('readHostVersion', () => {
  it('reads the CLI manifest version through the injected reader', () => {
    expect(readHostVersion(() => ({ version: '1.2.3' }))).toBe('1.2.3')
  })

  it('degrades to undefined when unresolvable or malformed', () => {
    expect(readHostVersion(() => { throw new Error('not found') })).toBeUndefined()
    expect(readHostVersion(() => null)).toBeUndefined()
    expect(readHostVersion(() => ({ version: 42 }))).toBeUndefined()
    expect(readHostVersion(() => ({ version: '' }))).toBeUndefined()
  })

  it('resolveHostVersion folds a miss onto unknown', () => {
    expect(resolveHostVersion(() => ({ version: '5.0.0' }))).toBe('5.0.0')
    expect(resolveHostVersion(() => { throw new Error('nope') })).toBe('unknown')
  })
})

describe('readPluginVersion', () => {
  // Paths built through join()/dirname() stay consistent with the walker on
  // every platform (the walk itself is platform-shaped).
  const pkgDir = join('/', 'pkg')
  const srcDir = join(pkgDir, 'src')
  const coreDir = join(srcDir, 'core')

  it('trusts only this package name and reads its version', () => {
    const files = { [join(pkgDir, 'package.json')]: OWN }
    expect(readPluginVersion(coreDir, tableReader(files))).toBe('9.9.9-local')
  })

  it('keeps walking past foreign manifests until it finds its own', () => {
    const files = {
      [join(coreDir, 'package.json')]: JSON.stringify({ name: 'someone-else', version: '0.0.1' }),
      [join(srcDir, 'package.json')]: '{broken',
      [join(pkgDir, 'package.json')]: OWN,
    }
    expect(readPluginVersion(coreDir, tableReader(files))).toBe('9.9.9-local')
  })

  it('answers unknown when the walk exhausts without a trusted manifest', () => {
    expect(readPluginVersion(coreDir, tableReader({}))).toBe('unknown')
    expect(readPluginVersion(
      pkgDir,
      tableReader({ [join(pkgDir, 'package.json')]: JSON.stringify({ name: 'other', version: '1.0.0' }) }),
    )).toBe('unknown')
  })
})

describe('module-level versions', () => {
  it('PLUGIN_VERSION matches this package manifest resolved from src/core/', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { version: string }
    expect(PLUGIN_VERSION).toBe(manifest.version)
  })

  it('HOST_VERSION is a non-empty string (real CLI manifest or unknown)', () => {
    expect(HOST_VERSION.length).toBeGreaterThan(0)
  })
})
