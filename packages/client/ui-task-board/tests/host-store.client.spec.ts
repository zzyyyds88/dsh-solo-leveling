// HostApiTaskStore: the diff replay onto /api/task-board/*, SSE-driven
// ingest + external reload notifications, and the one-shot localStorage
// migration (success removes the local copy, failure retries).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STORAGE_KEY } from '../src/core/store.ts'
import type { TaskRecord } from '../src/core/tasks.ts'
import { HostApiTaskStore } from '../src/client/host-store.ts'

/** One valid task record. */
function task(id: string, overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    title: `T ${id}`,
    description: '',
    prompt: 'p',
    status: 'todo',
    createdAt: 1,
    updatedAt: 1,
    executions: [],
    ...overrides,
  }
}

interface RecordedCall {
  path: string
  body: unknown
}

/** A fetch double recording calls and answering from a handler. */
function fetchRecorder(handler?: (call: RecordedCall) => { status?: number; body?: unknown }): {
  calls: RecordedCall[]
  fetch: typeof fetch
  failNext: () => void
} {
  const calls: RecordedCall[] = []
  let failOnce = false
  const fn = (async (path: unknown, init?: { body?: string }) => {
    const call: RecordedCall = {
      path: String(path),
      body: init?.body === undefined ? undefined : JSON.parse(init.body) as unknown,
    }
    calls.push(call)
    if (failOnce) {
      failOnce = false
      return { ok: false, status: 500, json: async () => undefined } as Response
    }
    if (handler === undefined) {
      return { ok: true, status: 200, json: async () => undefined } as Response
    }
    const answer = handler(call)
    return {
      ok: (answer.status ?? 200) < 300,
      status: answer.status ?? 200,
      json: async () => answer.body,
    } as Response
  }) as typeof fetch
  return {
    calls,
    fetch: fn,
    failNext: () => { failOnce = true },
  }
}

/** A minimal localStorage face seeded for migration tests. */
function storageFake(initial: Record<string, string> = {}): {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  removed: string[]
} {
  const map = new Map(Object.entries(initial))
  const removed: string[] = []
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => {
      map.delete(key)
      removed.push(key)
    },
    removed,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('diff replay', () => {
  it('replays create/update/delete operations in save order', async () => {
    const rec = fetchRecorder()
    const store = new HostApiTaskStore({ fetchFn: rec.fetch })

    store.save([task('a')])
    store.save([task('a', { title: 'A2' }), task('b')])
    store.save([task('b')])
    await vi.waitFor(() => {
      expect(rec.calls).toHaveLength(4)
    })
    expect(rec.calls.map(call => call.path)).toEqual([
      '/api/task-board/tasks/create',
      '/api/task-board/tasks/update',
      '/api/task-board/tasks/create',
      '/api/task-board/tasks/delete',
    ])
    expect(rec.calls[0]?.body).toMatchObject({ id: 'a', title: 'T a' })
    expect(rec.calls[1]?.body).toEqual({
      id: 'a',
      patch: {
        title: 'A2', description: '', prompt: 'p',
        workspaceId: null, mode: null, permission: null,
        status: 'todo', schedule: undefined,
      },
    })
    expect(rec.calls[3]?.body).toEqual({ id: 'a' })
    expect(store.load().map(entry => entry.id)).toEqual(['b'])
  })

  it('skips identical saves and serializes bursts without reordering', async () => {
    const rec = fetchRecorder()
    const store = new HostApiTaskStore({ fetchFn: rec.fetch })
    const rows = [task('a'), task('b')]
    store.save(rows)
    store.save(rows)
    store.load() // must not disturb pending ops
    expect(store.load()).toEqual(rows)
    // Only the first save's two creates replay; the identical second save diffs empty.
    await vi.waitFor(() => {
      expect(rec.calls).toHaveLength(2)
      expect(rec.calls.every(call => call.path === '/api/task-board/tasks/create')).toBe(true)
    })
  })

  it('logs per-operation failures and keeps the chain alive', async () => {
    const rec = fetchRecorder()
    const store = new HostApiTaskStore({ fetchFn: rec.fetch })
    const error = vi.spyOn(console, 'error')
    rec.failNext()
    store.save([task('a')])
    store.save([task('a'), task('c')])
    // Op 1 (create a) fails and logs; op 2 (create c, from the second diff)
    // still runs afterwards.
    await vi.waitFor(() => {
      expect(rec.calls).toHaveLength(2)
      expect(error).toHaveBeenCalled()
    })
    expect(rec.calls[1]?.path).toBe('/api/task-board/tasks/create')
  })

  it('clear deletes every known task', async () => {
    const rec = fetchRecorder()
    const store = new HostApiTaskStore({ fetchFn: rec.fetch })
    store.save([task('a'), task('b')])
    await vi.waitFor(() => {
      expect(rec.calls).toHaveLength(2)
    })
    store.clear()
    await vi.waitFor(() => {
      expect(rec.calls.map(call => call.path)).toEqual([
        '/api/task-board/tasks/create',
        '/api/task-board/tasks/create',
        '/api/task-board/tasks/delete',
        '/api/task-board/tasks/delete',
      ])
    })
    expect(store.load()).toEqual([])
  })
})

describe('SSE ingest + reload subscription', () => {
  it('notifies reload listeners on snapshots and filters invalid rows', () => {
    const store = new HostApiTaskStore({ storage: storageFake() })
    const seen: TaskRecord[][] = []
    const unsubscribe = store.subscribeExternal(() => { seen.push(store.load()) })

    store.ingest([{ nope: true }, task('keep')])
    expect(seen).toEqual([[task('keep')]])

    // An unchanged snapshot does not fire another reload.
    store.ingest([task('keep')])
    expect(seen).toHaveLength(1)

    unsubscribe()
    store.ingest([task('gone')])
    expect(seen).toHaveLength(1)
    expect(store.load()).toEqual([task('gone')])
  })

  it('ignores malformed frames', () => {
    const store = new HostApiTaskStore({ storage: storageFake() })
    store.ingest('garbage')
    store.ingest(null)
    expect(store.load()).toEqual([])
  })
})

describe('one-shot localStorage migration', () => {
  it('uploads local rows on the first empty snapshot and removes them after a full import', async () => {
    const local = [JSON.parse(JSON.stringify(task('legacy-1')))]
    const storage = storageFake({ [DEFAULT_STORAGE_KEY]: JSON.stringify(local) })
    const rec = fetchRecorder()
    const store = new HostApiTaskStore({ fetchFn: rec.fetch, storage })

    store.ingest([]) // the board's very first snapshot: host ledger is empty
    await vi.waitFor(() => {
      expect(rec.calls.some(call => call.path === '/api/task-board/migrate')).toBe(true)
    })
    const migrate = rec.calls.find(call => call.path === '/api/task-board/migrate')
    expect(migrate?.body).toEqual({ tasks: local })
    await vi.waitFor(() => {
      expect(storage.removed).toEqual([DEFAULT_STORAGE_KEY])
    })

    // One-shot: a later empty snapshot never re-uploads.
    store.ingest([])
    expect(rec.calls.filter(call => call.path === '/api/task-board/migrate')).toHaveLength(1)
  })

  it('keeps local rows when the upload fails and retries on the next empty snapshot', async () => {
    const storage = storageFake({ [DEFAULT_STORAGE_KEY]: JSON.stringify([JSON.parse(JSON.stringify(task('legacy-2')))]) })
    const rec = fetchRecorder()
    const warn = vi.spyOn(console, 'warn')

    const store = new HostApiTaskStore({ fetchFn: rec.fetch, storage })
    rec.failNext()
    store.ingest([])
    await vi.waitFor(() => {
      expect(rec.calls.some(call => call.path === '/api/task-board/migrate')).toBe(true)
    })
    // The failed upload keeps the local copy...
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalled()
    })
    expect(storage.removed).toEqual([])

    // ...and the one-shot flag resets, so the next empty snapshot retries.
    store.ingest([])
    await vi.waitFor(() => {
      expect(rec.calls.filter(call => call.path === '/api/task-board/migrate')).toHaveLength(2)
      expect(storage.removed).toEqual([DEFAULT_STORAGE_KEY])
    })
  })

  it('does nothing without local rows or a storage face', async () => {
    const rec = fetchRecorder()
    const empty = new HostApiTaskStore({ fetchFn: rec.fetch, storage: storageFake() })
    empty.ingest([])
    const orphaned = new HostApiTaskStore({ fetchFn: rec.fetch })
    orphaned.ingest([])
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    expect(rec.calls.filter(call => call.path === '/api/task-board/migrate')).toHaveLength(0)
  })
})
