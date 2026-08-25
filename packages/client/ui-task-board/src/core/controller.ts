/**
 * Board controller: the single owner of task-ledger view state.
 *
 * It keeps the ledger in memory (the host half is the ledger of record — this
 * copy reloads whenever the store reports an external change, i.e. an SSE
 * snapshot), persists local mutations through the {@link TaskStore} diff
 * replay, and hands real executions to the host through the injected runner
 * face (`POST /api/task-board/run`). The browser no longer schedules or
 * drives sessions itself: the running card, its execution record, and the
 * settlement all arrive through the next external reload. The controller
 * still closes the board view whenever the user navigates to a session (the
 * sessions-list `current` selection changes).
 *
 * The per use-case domain transitions (create/update/delete/schedule) live in
 * dedicated modules under core/use-cases and are applied here; the controller
 * owns only the orchestration seam (state, persistence, notify, navigation).
 */
import type { TaskStore } from './store.ts'
import {
  withStatus,
  type NewTaskInput, type TaskRecord, type TaskStatus,
} from './tasks.ts'
import { applyCreateTask } from './use-cases/task-create.ts'
import { applyDeleteTask } from './use-cases/task-delete.ts'
import { applyScheduleNextRun as applyScheduleRollForward, applySetSchedule } from './use-cases/task-schedule.ts'
import { applyUpdateTask, type TaskUpdatePatch } from './use-cases/task-update.ts'

/** The sessions face the controller needs for navigation awareness. */
export interface SessionsControllerFace {
  list: {
    getSnapshot(): { current: string | undefined }
    subscribe(fn: () => void): () => void
  }
  /** Select a session as current (navigates the conversation view). */
  open(id: string): void
}

/** Controller dependencies (all swappable in tests). */
export interface ControllerDeps {
  store: TaskStore
  /**
   * Launch one real execution through the host (`POST /api/task-board/run`);
   * resolves true when the host accepted the run. The resulting running card
   * and its settlement arrive through the store's external reload.
   */
  runner: (id: string) => Promise<boolean>
  sessions: SessionsControllerFace
  /** Clock; defaults to Date.now. */
  now?: () => number
  /** Id minting; defaults to a random-uuid. */
  uuid?: () => string
}

/** One workspace option the execution-target pickers offer. */
export interface ExecutionWorkspaceOption {
  workspaceId: string
  /** Display label (workspace title; the wiring falls back to the path). */
  title: string
}

/** One agent-preset option the execution-target pickers offer. */
export interface ExecutionPresetOption {
  id: string
  name?: string
  description?: string
  /** Why this preset cannot compose a session; the pickers disable it. */
  broken?: string
  isDefault: boolean
}

/** The execution-target option sets the UI feeds into the controller. */
export interface ExecutionOptionsSnapshot {
  workspaces: readonly ExecutionWorkspaceOption[]
  presets: readonly ExecutionPresetOption[]
}

/** Immutable controller snapshot for UI subscriptions. */
export interface ControllerSnapshot {
  tasks: readonly TaskRecord[]
  boardOpen: boolean
  selectedTaskId: string | undefined
  /** Picker option sets (workspace list + agent-preset roster). */
  executionOptions: ExecutionOptionsSnapshot
}

/**
 * The selected task (resolved from the ledger), or undefined.
 * @param snapshot - the controller snapshot to read the selection from.
 * @returns the task whose id is selected, or undefined when nothing is selected.
 */
export function selectedTaskOf(snapshot: ControllerSnapshot): TaskRecord | undefined {
  if (snapshot.selectedTaskId === undefined) return undefined
  return snapshot.tasks.find(task => task.id === snapshot.selectedTaskId)
}

function randomUuid(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Read the current selection off a session-list snapshot (structural). */
function currentOf(sessions: SessionsControllerFace): string | undefined {
  return sessions.list.getSnapshot().current
}

/**
 * Board controller (see module doc). All mutations bump the snapshot and
 * persist through the store; UI and DOM mounts subscribe and re-render.
 */
export class BoardController {
  private tasks: TaskRecord[] = []
  private boardOpen = false
  private selectedTaskId: string | undefined
  private executionOptions: ExecutionOptionsSnapshot = { workspaces: [], presets: [] }
  private listeners = new Set<() => void>()
  private disposers: Array<() => void> = []
  private readonly now: () => number
  private readonly uuid: () => string

  /** @param deps - store, execution service, and the sessions navigation face. */
  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.uuid = deps.uuid ?? randomUuid
  }

  // --- lifecycle -------------------------------------------------------------

  /** Load the persisted ledger and start the navigation/status subscriptions. */
  start(): void {
    this.tasks = this.deps.store.load()
    // The host half is the ledger of record: whenever the store reports an
    // external change (an SSE snapshot), reload so a task deleted elsewhere
    // stops firing here — and is never written back by this stale copy.
    const unsubscribeExternal = this.deps.store.subscribeExternal?.(() => {
      this.tasks = this.deps.store.load()
      this.notify()
    })
    if (unsubscribeExternal !== undefined) this.disposers.push(unsubscribeExternal)
    this.disposers.push(this.deps.sessions.list.subscribe(() => {
      this.onSessionsChanged()
    }))
    this.notify()
  }

  /** Stop all subscriptions and drop retained state (idempotent). */
  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose()
    this.listeners.clear()
  }

  // --- snapshot / subscription ------------------------------------------------

  /**
   * The current immutable controller snapshot.
   * @returns the full controller snapshot (ledger, board, selection, pickers).
   */
  getSnapshot(): ControllerSnapshot {
    return {
      tasks: this.tasks,
      boardOpen: this.boardOpen,
      selectedTaskId: this.selectedTaskId,
      executionOptions: this.executionOptions,
    }
  }

  /**
   * Subscribe to controller snapshots.
   * @param fn - called whenever the snapshot changes.
   * @returns an unsubscribe function.
   */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  // --- view state -------------------------------------------------------------

  /** Open the board view (a no-op when already open). */
  openBoard(): void {
    if (this.boardOpen) return
    // Baseline the selection the board opened against: the board stays open
    // until the user navigates (selection changes), never on mere status
    // updates of the already-selected session.
    this.lastCurrent = currentOf(this.deps.sessions)
    this.boardOpen = true
    this.notify()
  }

  /** Close the board view (a no-op when already closed). */
  closeBoard(): void {
    if (!this.boardOpen) return
    this.boardOpen = false
    this.notify()
  }

  /** Toggle the board view between open and closed. */
  toggleBoard(): void {
    if (this.boardOpen) this.closeBoard()
    else this.openBoard()
  }

  /**
   * Select a task for the detail view; ignored when the id is not in the ledger.
   * @param id - the task to select.
   */
  openTask(id: string): void {
    if (this.tasks.some(task => task.id === id)) {
      this.selectedTaskId = id
      this.notify()
    }
  }

  /** Clear the task selection (a no-op when nothing is selected). */
  closeTask(): void {
    if (this.selectedTaskId === undefined) return
    this.selectedTaskId = undefined
    this.notify()
  }

  // --- task mutations (use-case transitions in core/use-cases) -----------------

  /**
   * Create a task in the ledger (blank titles are rejected).
   * @param input - raw user input for the new task.
   * @returns the minted task, or undefined when the input was rejected.
   */
  createTask(input: NewTaskInput): TaskRecord | undefined {
    const { task, tasks } = applyCreateTask(this.tasks, input, this.now(), this.uuid())
    if (task === undefined) return undefined
    this.tasks = [...tasks]
    this.persistAndNotify()
    return task
  }

  /**
   * Apply an editable-field patch to one task.
   * @param id - the task to update.
   * @param patch - fields to change (explicit undefined clears a field).
   */
  updateTask(id: string, patch: TaskUpdatePatch): void {
    this.tasks = [...applyUpdateTask(this.tasks, id, patch, this.now())]
    this.persistAndNotify()
  }

  /**
   * Replace (a part of) the picker option sets the UI feeds (workspace list
   * and agent-preset roster come from the runtime, not the ledger).
   * @param patch - option sets to replace (absent fields keep their current value).
   */
  setExecutionOptions(patch: Partial<ExecutionOptionsSnapshot>): void {
    this.executionOptions = { ...this.executionOptions, ...patch }
    this.notify()
  }

  /**
   * Move a task to a new column.
   * @param id - the task to move.
   * @param status - the target column.
   */
  moveTask(id: string, status: TaskStatus): void {
    this.tasks = this.tasks.map(task => task.id === id ? withStatus(task, status, this.now()) : task)
    this.persistAndNotify()
  }

  /**
   * Delete a task from the ledger, clearing the selection when it referenced it.
   * @param id - the task to remove.
   */
  deleteTask(id: string): void {
    const { tasks, selectionCleared } = applyDeleteTask(this.tasks, this.selectedTaskId, id)
    this.tasks = [...tasks]
    if (selectionCleared) this.selectedTaskId = undefined
    this.persistAndNotify()
  }

  // --- scheduling ---------------------------------------------------------------

  /**
   * Update a task's schedule rule. A blank or invalid cron expression is
   * rejected (returns false, state untouched). When the rule ends up enabled
   * the next run instant is computed immediately; a disabled rule carries no
   * next-run instant. Delegates the domain transition to the schedule use case.
   * @param id - the task to schedule.
   * @param patch - fields to change (absent fields keep their current value).
   * @returns true when applied, false when rejected (invalid cron / unknown task).
   */
  setSchedule(id: string, patch: { enabled?: boolean; cron?: string }): boolean {
    const { tasks, applied } = applySetSchedule(this.tasks, id, patch, this.now())
    if (!applied) return false
    this.tasks = [...tasks]
    this.persistAndNotify()
    return true
  }

  /**
   * Roll a task's schedule forward (scheduler callback): persist the next due
   * instant and the trigger instant of this run. No-op when the task has no
   * schedule rule (it was deleted mid-tick, for example).
   * @param id - the task to roll forward.
   * @param nextRunAt - the next due instant (undefined clears it).
   * @param lastTriggeredAt - the trigger instant of this run.
   */
  applyScheduleNextRun(id: string, nextRunAt: number | undefined, lastTriggeredAt: number | undefined): void {
    const next = applyScheduleRollForward(this.tasks, id, nextRunAt, lastTriggeredAt, this.now())
    this.tasks = [...next]
    this.persistAndNotify()
  }

  /**
   * Jump to an execution's session transcript. Selecting the session changes
   * `current`, which closes the board (the conversation view takes over).
   * @param sessionId - the execution session to open.
   */
  openSession(sessionId: string): void {
    this.deps.sessions.open(sessionId)
  }

  // --- execution ---------------------------------------------------------------

  /**
   * Execute a task for real through the host. A second call while the task is
   * already running is ignored (the host enforces the same mutex).
   * @param id - the task to execute.
   * @returns true when the run was accepted, false when the task is unknown or already running.
   */
  async runTask(id: string): Promise<boolean> {
    const task = this.tasks.find(candidate => candidate.id === id)
    if (task === undefined || task.status === 'running') return false
    return this.deps.runner(id)
  }

  /**
   * Re-run a settled task (the host flips it straight back to running).
   * @param id - the task to re-run (a no-op when the task is unknown).
   */
  async rerunTask(id: string): Promise<void> {
    await this.runTask(id)
  }

  // --- internals ---------------------------------------------------------------

  /** Close the board when the user navigates away from it. */
  private onSessionsChanged(): void {
    if (!this.boardOpen) return
    const current = currentOf(this.deps.sessions)
    if (current !== this.lastCurrent) this.closeBoard()
    this.lastCurrent = current
  }

  private lastCurrent: string | undefined = undefined

  private persistAndNotify(): void {
    this.deps.store.save(this.tasks)
    this.notify()
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn()
  }
}
