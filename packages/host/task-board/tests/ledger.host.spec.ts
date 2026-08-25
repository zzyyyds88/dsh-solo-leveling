// Ledger parsing and atomic persistence: document validation (bad rows drop,
// statuses normalize, malformed schedules strip), file round-trip through the
// tmp+rename writer, and the fault paths that start from an empty ledger.

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLedgerFile, normalizeTaskRow, parseLedger, saveLedgerFile } from '../src/core/ledger.ts'

let home: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'dsh-task-board-'))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

/** One fully valid ledger row; fields are overridden per test. */
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 't1',
    title: 'Ship it',
    description: '',
    prompt: 'do the thing',
    status: 'todo',
    createdAt: 1,
    updatedAt: 2,
    executions: [],
    ...overrides,
  }
}

describe('parseLedger', () => {
  it('round-trips valid rows', () => {
    const tasks = parseLedger(JSON.stringify([row()]))
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ id: 't1', title: 'Ship it', status: 'todo' })
  })

  it('starts empty on invalid JSON and on a non-array document', () => {
    expect(parseLedger('{not json')).toEqual([])
    expect(parseLedger(JSON.stringify({ tasks: [] }))).toEqual([])
  })

  it('drops structurally invalid rows but keeps valid siblings', () => {
    const tasks = parseLedger(JSON.stringify([
      row({ id: 'good' }),
      row({ id: '', title: 'no id' }),
      { id: 'x' },
      null,
      row({ prompt: 42 }),
    ]))
    expect(tasks.map(task => task.id)).toEqual(['good'])
  })

  it('normalizes an unknown status to todo and repairs blank target pins', () => {
    const [task] = parseLedger(JSON.stringify([
      row({ status: 'archived-someday', workspaceId: '  ', mode: 'writer', permission: 'not-a-preset' }),
    ]))
    expect(task?.status).toBe('todo')
    expect(task?.workspaceId).toBeUndefined()
    expect(task?.mode).toBe('writer')
    expect(task?.permission).toBeUndefined()
  })

  it('strips a schedule without a usable cron and coerces a repaired one', () => {
    const tasks = parseLedger(JSON.stringify([
      row({ id: 'a', schedule: { cron: 'not a cron' } }),
      row({ id: 'b', schedule: { enabled: 'yes', cron: '0 9 * * *', nextRunAt: '5', extra: true } }),
    ]))
    expect(tasks[0]?.schedule).toBeUndefined()
    expect(tasks[1]?.schedule).toEqual({ enabled: false, cron: '0 9 * * *', nextRunAt: undefined, lastTriggeredAt: undefined })
  })

  it('keeps fully-formed execution entries', () => {
    const [task] = parseLedger(JSON.stringify([
      row({
        executions: [
          { id: 'e1', startedAt: 3 },
          { id: 'e2', startedAt: 4, endedAt: 5, result: 'succeeded', error: undefined, sessionId: 's1' },
        ],
      }),
    ]))
    expect(task?.executions).toHaveLength(2)
    expect(task?.executions[0]).toMatchObject({ id: 'e1' })
    expect(task?.executions[1]).toMatchObject({ id: 'e2', result: 'succeeded', sessionId: 's1' })
  })

  it('drops the whole row when any execution entry is malformed (browser parity)', () => {
    const tasks = parseLedger(JSON.stringify([
      row({
        id: 'bad-exec',
        executions: [{ id: 'e1', startedAt: 3 }, { startedAt: 6 }],
      }),
      row({
        id: 'bad-exec-time',
        executions: [{ id: 'e3', startedAt: '7' }],
      }),
    ]))
    expect(tasks).toEqual([])
  })

  it('validates single rows through the shared normalizer', () => {
    expect(normalizeTaskRow(row())).toBeDefined()
    expect(normalizeTaskRow('nope')).toBeUndefined()
  })
})

describe('ledger file persistence', () => {
  it('absent files load as an empty ledger', async () => {
    await expect(loadLedgerFile(join(home, 'missing.json'))).resolves.toEqual([])
  })

  it('read faults other than absence also start empty', async () => {
    const dir = join(home, 'as-directory.json')
    await mkdir(dir)
    await expect(loadLedgerFile(dir)).resolves.toEqual([])
  })

  it('save then load round-trips through the atomic writer and creates parents', async () => {
    const path = join(home, 'nested', 'task-board', 'ledger.json')
    const tasks = parseLedger(JSON.stringify([row()]))
    await saveLedgerFile(path, tasks)
    await expect(readFile(path, 'utf8')).resolves.toContain('"Ship it"')
    await expect(loadLedgerFile(path)).resolves.toEqual(tasks)
  })

  it('replaces prior content instead of appending', async () => {
    const path = join(home, 'ledger.json')
    await saveLedgerFile(path, parseLedger(JSON.stringify([row()])))
    await saveLedgerFile(path, [])
    await expect(loadLedgerFile(path)).resolves.toEqual([])
  })

  it('a corrupt on-disk document loads empty with a warning', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const path = join(home, 'ledger.json')
      await writeFile(path, '}{', 'utf8')
      await expect(loadLedgerFile(path)).resolves.toEqual([])
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
