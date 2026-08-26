/**
 * Host-backed TaskStore: the browser half's persistence seam over the host
 * half's `/api/task-board/*` routes.
 *
 * The seam contract (`load/save/clear`) stays synchronous, so this backend
 * keeps the last-known ledger in memory: `save` diffs it against the next
 * ledger and replays the difference onto the host (create/update/delete per
 * task), while the authoritative state flows back through the SSE change
 * stream — `ingest` swaps the cache and fires the external-change listeners,
 * and the board controller reloads exactly like it did off localStorage
 * storage events. Failures (host down, request rejected) are logged and leave
 * the cache optimistic; the next SSE snapshot re-baselines the truth.
 *
 * One-shot migration: while the host ledger is empty and this browser still
 * holds rows under `dsh.taskBoard.v1`, they are uploaded to `/migrate`; the
 * item is removed only when every row was imported, so a partial failure
 * retries on the next load instead of dropping data.
 * @module dsh-task-board/client/host-store
 */
import { DEFAULT_STORAGE_KEY, LocalStorageTaskStore, isTaskRecord, type TaskStore } from '../core/store.ts'
import type { TaskRecord } from '../core/tasks.ts'

/** Storage face the migration reads (the browser global in production). */
type LocalStorageFace = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Construction overrides (tests inject fakes). */
export interface HostApiTaskStoreOptions {
  /** Fetch implementation; defaults to the global fetch. */
  fetchFn?: typeof fetch
  /** localStorage face for the one-shot migration; defaults to globalThis.localStorage. */
  storage?: LocalStorageFace | undefined
}

/** One pending diff operation. */
interface LedgerOp {
  path: string
  body: Record<string, unknown>
}

/** Fields the host update endpoint accepts (everything else is host-owned). */
function editablePatchOf(task: TaskRecord): Record<string, unknown> {
  return {
    title: task.title,
    description: task.description,
    prompt: task.prompt,
    // Cleared pins ride as explicit nulls: JSON.stringify would drop
    // undefined keys, and an absent key means "keep" on the host.
    workspaceId: task.workspaceId ?? null,
    mode: task.mode ?? null,
    permission: task.permission ?? null,
    status: task.status,
    ...(task.schedule === undefined
      ? {}
      : { schedule: { enabled: task.schedule.enabled, cron: task.schedule.cron } }),
  }
}

/** Whether two records differ in any field the host persists. */
function differs(before: TaskRecord, after: TaskRecord): boolean {
  return JSON.stringify(editablePatchOf(before)) !== JSON.stringify(editablePatchOf(after))
}

/**
 * The host API backend of the task ledger (see module doc).
 */
export class HostApiTaskStore implements TaskStore {
  private cache: TaskRecord[] = []
  private readonly listeners = new Set<() => void>()
  /** Serializes diff replay so rapid saves cannot reorder on the wire. */
  private opChain: Promise<void> = Promise.resolve()
  private migrationAttempted = false
  private readonly fetchFn: typeof fetch
  private readonly storage: LocalStorageFace | undefined

  /** @param options - fetch/storage overrides (tests). */
  constructor(options: HostApiTaskStoreOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis)
    this.storage = options.storage ?? readGlobalLocalStorage()
  }

  /** The last-known ledger (initially empty until the SSE snapshot lands). */
  load(): TaskRecord[] {
    return [...this.cache]
  }

  /**
   * Diff the previous cache against the next ledger and replay the difference
   * (creates, updates, deletes) onto the host in order. Fire-and-forget by
   * seam contract; failures are logged and healed by the next SSE snapshot.
   */
  save(tasks: readonly TaskRecord[]): void {
    const previous = new Map(this.cache.map(task => [task.id, task]))
    const ops: LedgerOp[] = []
    for (const task of tasks) {
      const before = previous.get(task.id)
      if (before === undefined) {
        ops.push({ path: '/api/task-board/tasks/create', body: task as unknown as Record<string, unknown> })
      } else if (differs(before, task)) {
        ops.push({
          path: '/api/task-board/tasks/update',
          body: { id: task.id, patch: editablePatchOf(task) },
        })
      }
      previous.delete(task.id)
    }
    for (const task of previous.values()) {
      ops.push({ path: '/api/task-board/tasks/delete', body: { id: task.id } })
    }
    this.cache = [...tasks]
    if (ops.length > 0) {
      this.opChain = this.opChain.then(() => this.replay(ops))
    }
  }

  /** Delete every known task on the host (the seam's clear verb). */
  clear(): void {
    const ids = this.cache.map(task => task.id)
    this.cache = []
    this.opChain = this.opChain.then(async () => {
      for (const id of ids) {
        await this.request('/api/task-board/tasks/delete', { id })
      }
    })
  }

  /**
   * Subscribe to host-driven ledger replacements (SSE snapshots). The board
   * controller registers its reload here, replacing the localStorage
   * storage-event cross-tab channel.
   */
  subscribeExternal(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Swap the cache with a host-snapshot and notify the reload listeners.
   * Rows failing the structural guard are dropped defensively; a malformed
   * frame degrades to a partial refresh, never a broken board.
   * @param rows - the raw `{tasks}` snapshot payload from the host.
   */
  ingest(rows: unknown): void {
    if (!Array.isArray(rows)) return
    const tasks = rows.filter(isTaskRecord)
    const changed = JSON.stringify(this.cache) !== JSON.stringify(tasks)
    this.cache = tasks
    // An empty snapshot means the host has nothing yet — exactly the window
    // the one-shot localStorage migration waits for (checked even when the
    // cache was already empty, i.e. the board's very first snapshot).
    if (tasks.length === 0) void this.migrateLocalLedger()
    if (!changed) return
    for (const listener of [...this.listeners]) listener()
  }

  /**
   * One-shot localStorage migration: upload the browser rows while the host
   * ledger is empty, and drop the local copy once the host accepted the batch
   * (an `{imported: 0}` answer means another tab migrated first — the data is
   * on the host either way). A failed upload keeps the local rows and retries
   * on the next empty snapshot.
   */
  async migrateLocalLedger(): Promise<void> {
    if (this.migrationAttempted) return
    if (this.cache.length > 0 || this.storage === undefined) return
    const local = new LocalStorageTaskStore(DEFAULT_STORAGE_KEY, this.storage).load()
    if (local.length === 0) return
    this.migrationAttempted = true
    try {
      await this.request('/api/task-board/migrate', { tasks: local })
      this.storage.removeItem(DEFAULT_STORAGE_KEY)
    } catch (error) {
      // Migration failures stay silent: the local rows survive and the next
      // empty-snapshot load retries.
      console.warn('[dsh-task-board] ledger migration deferred:', error)
      this.migrationAttempted = false
    }
  }

  /** Replay diff operations sequentially; individual failures log, chain lives on. */
  private async replay(ops: readonly LedgerOp[]): Promise<void> {
    for (const op of ops) {
      try {
        await this.request(op.path, op.body)
      } catch (error) {
        console.error(`[dsh-task-board] ${op.path} failed:`, error)
      }
    }
  }

  /** POST one JSON operation; resolves the decoded envelope, rejects on faults. */
  private async request(path: string, body: unknown): Promise<unknown> {
    const response = await this.fetchFn(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`${path} answered ${String(response.status)}`)
    return response.json()
  }
}

/** The browser localStorage when present (undefined in tests/node runs). */
function readGlobalLocalStorage(): LocalStorageFace | undefined {
  return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage
}
