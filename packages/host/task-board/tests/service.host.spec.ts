// TaskBoardService: ledger recovery, CRUD/migrate semantics, the execution
// chain over a fake apiProxy (create → permission command → rename → prompt,
// settled by host frames), and the scheduler wiring (due tick fires, missed
// slots roll forward, a running task is skipped).

import { dirname } from 'node:path'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { HostFrame, PromptContentPart, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { TaskBoardApiFace } from '../src/host/service.ts'
import { TaskBoardService } from '../src/host/service.ts'
import type { TaskRecord } from '../src/core/tasks.ts'

/** Fixed clock base (a whole minute) so cron math is exact. */
const BASE = new Date(2026, 0, 1, 10, 30, 0, 0).getTime()

interface RecordedCall {
  payload: Record<string, unknown>
}

type WireFrame = { rpcId: string; payload: HostFrame }

/** Controllable fake of the apiProxy host-frame stream. */
function frameStream(): {
  push(frame: Record<string, unknown>): void
  iterate(signal: AbortSignal): AsyncGenerator<WireFrame>
} {
  const queue: WireFrame[] = []
  let waiter: (() => void) | undefined
  let done = false
  const rpcId = 'frame'
  return {
    push(body: Record<string, unknown>): void {
      queue.push({ rpcId, payload: body as unknown as HostFrame })
      waiter?.()
    },
    async *iterate(signal: AbortSignal): AsyncGenerator<WireFrame> {
      const onAbort = (): void => {
        done = true
        waiter?.()
      }
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        while (!done) {
          while (queue.length > 0) yield queue.shift() as WireFrame
          if (done) return
          await new Promise<void>((resolve) => { waiter = resolve })
          waiter = undefined
        }
      } finally {
        signal.removeEventListener('abort', onAbort)
      }
    },
  }
}

interface RecordingApi {
  frames: ReturnType<typeof frameStream>['push']
  creates: RecordedCall[]
  renames: RecordedCall[]
  prompts: RecordedCall[]
}

/** The fake apiProxy face plus everything the test needs to inspect/drive it. */
function makeApi(options: { createResult?: 'ok' | 'fail' } = {}): TaskBoardApiFace & RecordingApi {
  const stream = frameStream()
  let nextSession = 0
  const self = {
    frames: (body: Record<string, unknown>) => { stream.push(body) },
    creates: [] as RecordedCall[],
    renames: [] as RecordedCall[],
    prompts: [] as RecordedCall[],
    sessions: {
      create(request: RpcRequest<{ workspaceId?: string; agentPreset?: string }>) {
        self.creates.push(request)
        if (options.createResult === 'fail') {
          return Promise.resolve({ rpcId: request.rpcId, result: { ok: false as const, error: { code: 'internal' as const, message: 'no sessions here', details: {} } } })
        }
        nextSession += 1
        return Promise.resolve({
          rpcId: request.rpcId,
          result: { ok: true as const, value: { sessionId: `s${String(nextSession)}`, agentPreset: undefined } },
        })
      },
      rename(request: RpcRequest<{ sessionId: string; title: string }>) {
        self.renames.push(request)
        return Promise.resolve({ rpcId: request.rpcId, result: { ok: true as const, value: {} } })
      },
      prompt(request: RpcRequest<{ sessionId: string; mode: 'queue'; content: PromptContentPart[] }>) {
        self.prompts.push(request)
        return Promise.resolve({ rpcId: request.rpcId, result: { ok: true as const, value: { accepted: true as const } } })
      },
    },
    events: {
      host(_request: unknown, signal: AbortSignal) {
        return stream.iterate(signal)
      },
    },
  }
  // The recorder doubles as the structural face; plain-string payloads in the
  // fakes need this single boundary cast.
  return self as unknown as TaskBoardApiFace & RecordingApi
}

/** Minimal context face: records emissions, serves optional services by name. */
function makeContext(api: TaskBoardApiFace, workspaces: string[] = []) {
  const commands = {
    lines: [] as string[],
    matched: true,
    failing: false,
    async execute(_agent: unknown, line: string): Promise<{ result: { kind: string; text?: string } } | undefined> {
      commands.lines.push(line)
      if (!commands.matched) return undefined
      return commands.failing
        ? { result: { kind: 'error', text: 'preset is locked' } }
        : { result: { kind: 'success' } }
    },
  }
  const agents = { get: (_id: string) => ({}) }
  const emissions: Array<{ name: string; payload: unknown }> = []
  const ctx = {
    reflect: { provide: () => {} },
    emit(name: string, payload: unknown): void {
      emissions.push({ name, payload })
    },
    on(): () => void {
      return () => {}
    },
    get(name: string): unknown {
      if (name === 'commands') return commands
      if (name === 'agents') return agents
      return undefined
    },
    apiProxy: api,
    workspaceRegistry: { list: () => workspaces.map(id => ({ id })) },
  }
  return { ctx, emissions, commands }
}

/** Build one service against a temp home; returns the pieces tests assert on. */
async function harness(workspaces: string[] = [], apiOptions?: { createResult?: 'ok' | 'fail' }) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-task-board-'))
  const ledgerPath = join(home, 'task-board', 'ledger.json')
  const api = makeApi(apiOptions)
  const { ctx, emissions, commands } = makeContext(api, workspaces)
  let seq = 0
  const service = new TaskBoardService(ctx as unknown as Context, {
    ledgerPath,
    now: () => BASE,
    uuid: () => `uuid-${String(++seq)}`,
  })
  return {
    service,
    api,
    commands,
    emissions,
    ledgerPath,
    cleanup: async () => {
      service.stop()
      await service.flushPersistence().catch(() => {})
      await rm(home, { recursive: true, force: true })
    },
  }
}

/** A persisted ledger row with an enabled every-minute schedule due in the past. */
function scheduledRow(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    prompt: `prompt ${id}`,
    status: 'todo',
    createdAt: 1,
    updatedAt: 1,
    executions: [],
    schedule: { enabled: true, cron: '* * * * *', nextRunAt: BASE - 1, lastTriggeredAt: undefined },
    ...overrides,
  }
}

/** The ledger's first record (callers seed exactly one row where this is used). */
function firstTask(service: TaskBoardService): TaskRecord {
  return service.listTasks()[0] as TaskRecord
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TaskBoardService lifecycle', () => {
  it('loads the ledger, broadcasts an initial snapshot, and settles interrupted runs', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-task-board-'))
    try {
      const ledgerPath = join(home, 'ledger.json')
      const stuck = scheduledRow('stuck', {
        status: 'running',
        executions: [{ id: 'e1', startedAt: 1 }],
        schedule: undefined,
      })
      const fresh = scheduledRow('fresh', { schedule: undefined })
      await writeFile(ledgerPath, JSON.stringify([stuck, fresh]), 'utf8')

      const api = makeApi()
      const { ctx, emissions } = makeContext(api)
      let seq = 0
      const service = new TaskBoardService(ctx as unknown as Context, {
        ledgerPath, now: () => BASE, uuid: () => `u${String(++seq)}`,
      })
      await service.start()

      expect(emissions[0]?.name).toBe('task-board/changed')
      const tasks = service.listTasks() as TaskRecord[]
      expect(tasks.find(task => task.id === 'stuck')?.status).toBe('todo')
      expect(tasks.find(task => task.id === 'stuck')?.executions[0]).toMatchObject({
        endedAt: BASE, result: 'cancelled', error: 'interrupted by host restart',
      })
      service.stop()
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it('answers the scheduler face with false for unknown tasks', async () => {
    const h = await harness()
    await expect(h.service.runTask('missing')).resolves.toBe(false)
    await expect(h.service.startRun('x')).rejects.toMatchObject({ code: 'not-found' })
    await h.cleanup()
  })
})

describe('TaskBoardService CRUD + migrate', () => {
  it('creates with minted or provided identity and rejects blank titles', async () => {
    const h = await harness()
    const minimal = h.service.createTask({ title: '  Ship  ', prompt: 'go' })
    expect(minimal).toMatchObject({
      id: 'uuid-1', title: 'Ship', prompt: 'go', status: 'todo',
      createdAt: BASE, updatedAt: BASE, executions: [],
      workspaceId: undefined, permission: undefined,
    })
    const provided = h.service.createTask({
      id: 'client-1', title: 'Kept', createdAt: 5, updatedAt: 6,
      executions: [{ id: 'e1', startedAt: 7 }],
    })
    expect(provided.id).toBe('client-1')
    expect(provided.executions).toHaveLength(1)
    expect(() => h.service.createTask({ title: '   ' })).toThrow(/title/)
    expect(() => h.service.createTask({ id: 'client-1', title: 'dup' })).toThrow(/already exists/)
    await h.cleanup()
  })

  it('updates editable fields, recomputes schedules, and guards values', async () => {
    const h = await harness()
    const task = h.service.createTask({ id: 't1', title: 'A', workspaceId: 'ws1', permission: 'read-only' })

    const moved = h.service.updateTask('t1', { status: 'backlog', title: 'B' })
    expect(moved.status).toBe('backlog')
    expect(moved.workspaceId).toBe('ws1')

    // Explicit null clears a pin; unknown permission values are refused.
    const cleared = h.service.updateTask('t1', { workspaceId: null, mode: '' })
    expect(cleared.workspaceId).toBeUndefined()
    expect(cleared.mode).toBeUndefined()
    expect(cleared.permission).toBe('read-only')
    expect(() => h.service.updateTask('t1', { permission: 'root-everything' })).toThrow(/permission/)

    const armed = h.service.updateTask('t1', { schedule: { enabled: true, cron: '*/5 * * * *' } })
    expect(armed.schedule).toMatchObject({ enabled: true, cron: '*/5 * * * *', nextRunAt: BASE + 5 * 60_000 })
    expect(() => h.service.updateTask('t1', { schedule: { enabled: true, cron: '99 * * * *' } })).toThrow(/cron/)
    expect(() => h.service.updateTask('t1', { title: '  ' })).toThrow(/title/)
    expect(() => h.service.updateTask('ghost', { title: 'X' })).toThrow(/not found/)
    void task
    await h.cleanup()
  })

  it('deletes tasks and refuses unknown ids', async () => {
    const h = await harness()
    h.service.createTask({ id: 'keep', title: 'Keep' })
    h.service.createTask({ id: 'doomed', title: 'Doomed' })
    h.service.deleteTask('doomed')
    expect(() => { h.service.deleteTask('doomed') }).toThrow(/not found/)
    expect(h.service.listTasks().map(task => task.id)).toEqual(['keep'])
    await h.cleanup()
  })

  it('imports a client ledger exactly once', async () => {
    const h = await harness()
    expect(h.service.importLedger({ tasks: [
      scheduledRow('m1'),
      { broken: true },
      scheduledRow('m1'),
    ] })).toBe(1)
    expect(h.service.listTasks().map(task => task.id)).toEqual(['m1'])

    // Non-empty guard: the second batch (even valid) imports nothing.
    expect(h.service.importLedger({ tasks: [scheduledRow('m2')] })).toBe(0)
    expect(h.service.listTasks().map(task => task.id)).toEqual(['m1'])
    expect(() => h.service.importLedger({ nope: true })).toThrow(/tasks/)
    await h.cleanup()
  })

  it('persists every mutation to the ledger file', async () => {
    const h = await harness()
    h.service.createTask({ id: 'p1', title: 'Persisted' })
    await vi.waitFor(async () => {
      const onDisk = JSON.parse(await readFile(h.ledgerPath, 'utf8')) as Array<Record<string, unknown>>
      expect(onDisk.map(row => row.id)).toEqual(['p1'])
    })
    await h.cleanup()
  })
})

describe('TaskBoardService execution', () => {
  it('runs the full happy path: create → permission command → rename → prompt', async () => {
    const h = await harness(['ws-9'])
    await h.service.start()
    h.service.createTask({
      id: 't1', title: 'Nightly', prompt: 'sweep', mode: 'writer', permission: 'workspace-write', workspaceId: 'ws-9',
    })
    const started = await h.service.startRun('t1')
    expect(started).toMatchObject({ executionId: 'uuid-1', sessionId: 's1' })

    expect(h.api.creates[0]?.payload).toMatchObject({ workspaceId: 'ws-9', agentPreset: 'writer' })
    expect(h.commands.lines).toEqual(['/permission workspace-write'])
    expect(h.api.renames[0]?.payload).toMatchObject({ sessionId: 's1', title: 'Nightly' })
    expect(h.api.prompts[0]?.payload).toMatchObject({
      sessionId: 's1', mode: 'queue', content: [{ type: 'text', text: 'sweep' }],
    })

    const task = firstTask(h.service)
    expect(task.status).toBe('running')
    expect(task.executions[0]).toMatchObject({ id: 'uuid-1', sessionId: 's1' })

    // Settlement rides the host-frame stream.
    h.api.frames({ type: 'host/session-status', sessionId: 's1', running: false })
    await vi.waitFor(() => {
      const settled = firstTask(h.service)
      expect(settled.executions[0]).toMatchObject({ result: 'succeeded', endedAt: BASE })
      expect(settled.status).toBe('done')
    })
    await h.cleanup()
  })

  it('falls back to the title when the prompt is blank and skips pins when absent', async () => {
    const h = await harness()
    await h.service.start()
    h.service.createTask({ id: 't1', title: 'OnlyTitle', prompt: '   ' })
    await h.service.startRun('t1')
    expect(h.commands.lines).toEqual([])
    expect(h.api.prompts[0]?.payload.content).toEqual([{ type: 'text', text: 'OnlyTitle' }])
    await h.cleanup()
  })

  it('settles failed on agent-error before the status flip, and ignores the late flip', async () => {
    const h = await harness()
    await h.service.start()
    h.service.createTask({ id: 't1', title: 'Boom', prompt: 'x' })
    await h.service.startRun('t1')
    h.api.frames({ type: 'host/agent-error', sessionId: 's1', message: 'quota exhausted' })
    await vi.waitFor(() => {
      const settled = firstTask(h.service)
      expect(settled.executions[0]).toMatchObject({ result: 'failed', error: 'quota exhausted' })
      expect(settled.status).toBe('failed')
    })
    h.api.frames({ type: 'host/session-status', sessionId: 's1', running: false })
    await new Promise((resolve) => { setTimeout(resolve, 20) })
    expect(firstTask(h.service).executions[0]?.result).toBe('failed')
    await h.cleanup()
  })

  it('enforces the run mutex and reports refusal through the scheduler face', async () => {
    const h = await harness()
    await h.service.start()
    h.service.createTask({ id: 't1', title: 'Busy', prompt: 'x' })
    const first = h.service.startRun('t1')
    await first
    await expect(h.service.runTask('t1')).resolves.toBe(false)
    await expect(h.service.startRun('t1')).rejects.toMatchObject({ code: 'conflict' })
    await expect(h.service.runTask('ghost')).resolves.toBe(false)
    await expect(h.service.startRun('ghost')).rejects.toMatchObject({ code: 'not-found' })
    await h.cleanup()
  })

  it('fails the run before create when the pinned workspace is unknown', async () => {
    const h = await harness(['ws-known'])
    await h.service.start()
    h.service.createTask({ id: 't1', title: 'Lost', workspaceId: 'ws-vanished' })
    await expect(h.service.startRun('t1')).rejects.toMatchObject({ code: 'conflict' })
    const task = firstTask(h.service)
    expect(task.executions[0]).toMatchObject({ result: 'failed', error: /not available/ })
    expect(h.api.creates).toHaveLength(0)
    await h.cleanup()
  })

  it('fails the run when session creation is refused', async () => {
    const h = await harness([], { createResult: 'fail' })
    await h.service.start()
    h.service.createTask({ id: 't1', title: 'Nope', prompt: 'x' })
    await expect(h.service.startRun('t1')).rejects.toThrow(/failed to start/)
    expect(firstTask(h.service).executions[0]?.result).toBe('failed')
    await h.cleanup()
  })

  it('fails the run when the permission command is not admitted', async () => {
    const h = await harness()
    await h.service.start()
    h.commands.matched = false
    h.service.createTask({ id: 't1', title: 'Pinned', permission: 'read-only' })
    await expect(h.service.startRun('t1')).rejects.toThrow(/not recognized/)
    const task = firstTask(h.service)
    expect(task.executions[0]).toMatchObject({ result: 'failed', error: /not recognized/, sessionId: 's1' })
    expect(h.api.prompts).toHaveLength(0)
    await h.cleanup()
  })
})

describe('scheduler wiring', () => {
  /** Seed an overdue every-minute schedule into the on-disk ledger. */
  async function harnessWithDueSchedule(apiOptions?: { createResult?: 'ok' | 'fail' }) {
    const home = await mkdtemp(join(tmpdir(), 'dsh-task-board-'))
    const ledgerPath = join(home, 'task-board', 'ledger.json')
    const { writeFile } = await import('node:fs/promises')
    await mkdir(dirname(ledgerPath), { recursive: true })
    await writeFile(ledgerPath, JSON.stringify([scheduledRow('cron')]), 'utf8')
    const api = makeApi(apiOptions)
    const { ctx } = makeContext(api)
    let seq = 0
    const service = new TaskBoardService(ctx as unknown as Context, {
      ledgerPath, now: () => BASE, uuid: () => `uuid-${String(++seq)}`,
    })
    return {
      service,
      api,
      cleanup: async () => {
        service.stop()
        await service.flushPersistence().catch(() => {})
        await rm(home, { recursive: true, force: true })
      },
    }
  }

  it('fires a due schedule through the same run chain and rolls it forward', async () => {
    const h = await harnessWithDueSchedule()
    try {
      // start() arms the scheduler, whose immediate catch-up tick sees the
      // overdue schedule (the restart semantics: missed runs skip, but one
      // overdue trigger still fires).
      await h.service.start()
      await vi.waitFor(() => {
        const task = firstTask(h.service)
        expect(task.status).toBe('running')
        expect(task.schedule).toMatchObject({ lastTriggeredAt: BASE })
      })
      // The next whole-minute slot after the overdue instant (BASE - 1ms) is BASE.
      expect(firstTask(h.service).schedule?.nextRunAt).toBe(BASE)
      expect(h.api.prompts[0]?.payload).toMatchObject({ content: [{ type: 'text', text: 'prompt cron' }] })
    } finally {
      await h.cleanup()
    }
  })

  it('counts a trigger as accepted even when the launch fails afterwards', async () => {
    const h = await harnessWithDueSchedule({ createResult: 'fail' })
    try {
      await h.service.start()
      await vi.waitFor(() => {
        const task = firstTask(h.service)
        expect(task.executions[0]?.result).toBe('failed')
      })
      // Browser parity: the schedule rolled forward at acceptance, so a failed
      // launch does not re-fire the same slot every tick.
      const task = firstTask(h.service)
      expect(task.schedule?.lastTriggeredAt).toBe(BASE)
      expect(task.schedule?.nextRunAt).toBe(BASE)
    } finally {
      await h.cleanup()
    }
  })
})
