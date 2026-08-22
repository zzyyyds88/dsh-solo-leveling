import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import {
  FRAMEWORK_CONTEXT_MEMBERS,
  collectInjectFacts,
  renderViolation,
  verifyClientInjectDeclarations,
} from './verify-client-inject-declarations.ts'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

const fixtureRoots: string[] = []

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Stage one first-party client package source inside a throwaway repo root. */
function stageClientSource(relPath: string, source: string): string {
  const root = mkdtempSync(join(tmpdir(), 'inject-gate-'))
  fixtureRoots.push(root)
  const file = join(root, relPath)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, source)
  return root
}

describe('collectInjectFacts', () => {
  it('returns null for a file without an exported inject list', () => {
    expect(collectInjectFacts('x.ts', 'export function apply(ctx: unknown): void { void ctx }\n')).toBeNull()
  })

  it('pairs the exported inject list with apply-parameter accesses', () => {
    const facts = collectInjectFacts('x.ts', [
      "export const inject = ['locale', 'slots']",
      'export function apply(ctx: unknown): void {',
      '  ctx.effect(() => ctx.slots.register({}, () => null))',
      '}',
      '',
    ].join('\n'))
    expect(facts).not.toBeNull()
    expect(facts!.declared).toEqual(['locale', 'slots'])
    expect(facts!.applyParameters).toEqual(['ctx'])
    expect(facts!.contextUses.map(use => use.name)).toEqual(['effect', 'slots'])
  })

  it('reads the object-literal plugin form', () => {
    const facts = collectInjectFacts('x.ts', [
      'export default {',
      "  inject: ['settingsScope'],",
      '  apply(ctx: unknown) { ctx.settingsScope.bind({}) },',
      '}',
      '',
    ].join('\n'))
    expect(facts!.declared).toEqual(['settingsScope'])
    expect(facts!.applyParameters).toEqual(['ctx'])
    expect(facts!.contextUses.map(use => use.name)).toEqual(['settingsScope'])
  })

  it('parses tsx sources', () => {
    const facts = collectInjectFacts('card.tsx', [
      "export const inject = ['slots']",
      'export function apply(ctx: unknown): void {',
      '  const view = <div onClick={() => ctx.slots.spec("k")} />',
      '  void view',
      '}',
      '',
    ].join('\n'))
    expect(facts!.contextUses.map(use => use.name)).toEqual(['slots'])
  })

  it('reports a 1-based line for each access', () => {
    const facts = collectInjectFacts('x.ts', 'export const inject = []\nexport function apply(ctx: unknown): void {\n  ctx.sessions\n}\n')
    expect(facts!.contextUses).toEqual([{ name: 'sessions', line: 3 }])
  })
})

describe('verifyClientInjectDeclarations', () => {
  it('passes a declaration that covers every service use', () => {
    const root = stageClientSource('packages/client/ui-ok/src/index.ts', [
      "export const inject = ['slots', 'settingsScope']",
      'export function apply(ctx: unknown): void {',
      '  ctx.effect(() => ctx.slots.register({}, () => null))',
      '  ctx.settingsScope.bind({})',
      '}',
      '',
    ].join('\n'))
    expect(verifyClientInjectDeclarations(root)).toEqual([])
  })

  it('fails loud on an undeclared service use with its line and declaration', () => {
    const root = stageClientSource('packages/client/ui-bad/src/client/index.ts', [
      "export const inject = ['locale']",
      'export function apply(ctx: unknown): void {',
      '  ctx.slots.inject("conversation", () => {})',
      '}',
      '',
    ].join('\n'))
    expect(verifyClientInjectDeclarations(root)).toEqual([{
      file: 'packages/client/ui-bad/src/client/index.ts',
      name: 'slots',
      line: 3,
      declared: ['locale'],
    }])
  })

  it('ignores sources outside the client group and files without declarations', () => {
    const root = stageClientSource('packages/host/gate/src/index.ts', 'export function apply(ctx: unknown): void { ctx.slots }\n')
    stageOther(root, 'packages/client/ui-plain/src/index.ts', 'export function apply(ctx: unknown): void { ctx.slots }\n')
    expect(verifyClientInjectDeclarations(root)).toEqual([])
  })

  it('keeps the shipped first-party client surface clean', () => {
    expect(verifyClientInjectDeclarations(REPO_ROOT)).toEqual([])
  })
})

describe('renderViolation', () => {
  it('names the file, line, member, and current declaration', () => {
    expect(renderViolation({ file: 'a/b.ts', name: 'slots', line: 7, declared: ['locale'] }))
      .toBe('a/b.ts:7 uses ctx.slots without declaring it (declared: [locale])')
  })
})

it('withholds services from the framework builtin allowlist', () => {
  for (const builtin of ['effect', 'on', 'provide', 'get', 'loader', 'setTimeout']) {
    expect(FRAMEWORK_CONTEXT_MEMBERS.has(builtin)).toBe(true)
  }
  for (const service of ['slots', 'settingsScope', 'sessions', 'locale', 'theme']) {
    expect(FRAMEWORK_CONTEXT_MEMBERS.has(service)).toBe(false)
  }
})

/** Add a second file to an existing fixture root. */
function stageOther(root: string, relPath: string, source: string): void {
  const file = join(root, relPath)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, source)
}
