/**
 * TaskBoardService — the ledger of record and the in-process scheduler owner.
 *
 * The host half owns what the browser half used to keep in localStorage and a
 * tab heartbeat: the task ledger (in-memory snapshot persisted to
 * `$DSH_HOME/task-board/ledger.json` through tmp+rename atomic replacement on
 * every mutation) and one SchedulerService tick. Executions run through
 * `ctx.apiProxy.sessions` in-process with the same pinned targets the browser
 * executor applied (workspace / agent preset / permission preset), and each
 * mutation is broadcast on the `task-board/changed` cordis event so the SSE
 * route, other host plugins, and (via the mobile plugin) the phone remote all
 * see full-snapshot updates.
 *
 * Execution settlement: after the run's session is created the service watches
 * the apiProxy host-frame stream; `host/agent-error` settles the pending
 * execution as failed and `host/session-status(running:false)` settles it as
 * succeeded (whichever arrives first wins; the second becomes a no-op). This
 * is deliberately narrower than the browser reconciler — the host has no
 * conversation snapshots of its own — and runs interrupted by a host restart
 * are settled as `cancelled` during the next load so a card can never stick
 * in `running`.
 * @module dsh-host-task-board/host/service
 */
import { randomUUID } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
// Type-only edges: resolve the Context merges this service reads —
// `ctx.apiProxy` (the gateway), `ctx.workspaceRegistry` (pinned-workspace
// validation), plus the optional command/agent faces fetched via ctx.get.
import type {} from '@deepseek-ai/dsh-host-apiproxy'
import type { HostFrame, PromptContentPart, RpcRequest, RpcResponse } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import type {} from '@deepseek-ai/dsh-workspace'
import { BoardError } from '../core/board-error.ts'
import { loadLedgerFile, normalizeTaskRow, saveLedgerFile } from '../core/ledger.ts'
import { nextRunAtMs, isValidCron } from '../core/schedule.ts'
import { SchedulerService } from '../core/scheduler.ts'
import {
  isTaskStatus, settleExecution, startExecution, withSchedule,
  TASK_PERMISSIONS,
  type ExecutionRecord, type NewTaskInput, type TaskPermission, type TaskRecord,
} from '../core/tasks.ts'

/** Ledger location under the harness home. */
export const LEDGER_RELATIVE_PATH = 'ledger.json'

/** Human rendering of any thrown value. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Mint one branded correlation id for an apiProxy request. */
function mintRpcId(): RpcId {
  return RpcId(randomUUID())
}

/**
 * The narrow ApiProxy slice the executor drives (a structural face: tests
 * substitute plain fakes, while the real `ctx.apiProxy` satisfies it through
 * method bivariance). Requests carry `{rpcId, payload}`; responses are read
 * through `.result.ok` / `.result.value`.
 */
export interface TaskBoardApiFace {
  sessions: {
    create(request: RpcRequest<{ workspaceId?: string; agentPreset?: string }>):
    Promise<RpcResponse<{ sessionId: string; agentPreset?: string }>>
    rename(request: RpcRequest<{ sessionId: string; title: string }>): Promise<RpcResponse<unknown>>
    prompt(request: RpcRequest<{ sessionId: string; mode: 'queue'; content: PromptContentPart[] }>):
    Promise<RpcResponse<{ accepted: true; command?: { kind: 'success'; text?: string } }>>
  }
  events: {
    host(request: RpcRequest<{}>, signal: AbortSignal): AsyncIterable<RpcRequest<HostFrame>>
  }
}

/** The command-runtime slice used to admit `/permission <id>` (structural). */
interface CommandExecutionFace {
  execute(
    agent: unknown,
    line: string,
    images: readonly unknown[],
    signal: AbortSignal,
  ): Promise<{ result: { kind: string; text?: string } } | undefined>
}

/** The agent-registry slice used to resolve the execution session's agent. */
interface AgentRegistryFace {
  get(id: string): unknown
}

/** Editable fields the update endpoint accepts (everything else is host-owned). */
export interface TaskUpdatePatch {
  title?: string
  description?: string
  prompt?: string
  workspaceId?: string | undefined
  mode?: string | undefined
  permission?: TaskPermission | undefined
  status?: TaskRecord['status']
  /** Rule fields to change; when present the whole rule is re-validated and recomputed. */
  schedule?: { enabled?: boolean; cron?: string }
}

/** Service construction overrides (tests inject a temp ledger path / clock). */
export interface TaskBoardOptions {
  /** Absolute ledger file path; defaults to `$DSH_HOME/task-board/ledger.json`. */
  ledgerPath?: string
  /** Clock; defaults to Date.now. */
  now?: () => number
  /** Id minting; defaults to randomUUID. */
  uuid?: () => string
}

/**
 * One execution awaiting settlement, keyed by its dsh session id.
 */
interface PendingExecution {
  taskId: string
  executionId: string
}

/**
 * The board's single writer: ledger state, persistence, scheduling, and
 * executions (see module doc).
 */
export class TaskBoardService extends Service {
  private tasks: TaskRecord[] = []
  private scheduler: SchedulerService | undefined
  private started = false
  private stopped = false
  /** Captured once start() runs (the injection guarantees availability). */
  private api: TaskBoardApiFace | undefined
  /** Session id -> execution awaiting settlement (see module doc). */
  private readonly pendingBySession = new Map<string, PendingExecution>()
  /** Serializes ledger writes so rapid mutations cannot interleave renames. */
  private writeChain: Promise<void> = Promise.resolve()
  /** Aborts the host-frame watch on shutdown. */
  private readonly shutdown = new AbortController()
  private readonly ledgerPath: string
  private readonly now: () => number
  private readonly uuid: () => string

  /**
   * Constructing registers the instance as the `taskBoard` service.
   * @param ctx - context carrying webServer, apiProxy, and workspaceRegistry.
   * @param options - test overrides (ledger path / clock / ids).
   */
  constructor(ctx: Context, options: TaskBoardOptions = {}) {
    super(ctx, 'taskBoard')
    this.ledgerPath = options.ledgerPath ?? dshHomePath('task-board', LEDGER_RELATIVE_PATH)
    this.now = options.now ?? (() => Date.now())
    this.uuid = options.uuid ?? ((): string => randomUUID())
  }

  // --- lifecycle -------------------------------------------------------------

  /**
   * Load the ledger, then arm everything that reads it: routes may already be
   * registered (they serve whatever is loaded), so the scheduler and frame
   * watcher only start after recovery completes.
   */
  async start(): Promise<void> {
    if (this.started || this.stopped) return
    this.started = true
    this.api = this.ctx.apiProxy as TaskBoardApiFace
    this.tasks = await loadLedgerFile(this.ledgerPath)
    this.recoverInterruptedExecutions()
    this.startScheduler()
    void this.watchHostFrames(this.shutdown.signal)
    this.emitChanged()
  }

  /** Stop ticking, abort the frame watch, and refuse further runs (idempotent). */
  stop(): void {
    this.stopped = true
    this.started = false
    this.scheduler?.dispose()
    this.scheduler = undefined
    this.shutdown.abort()
  }

  /**
   * Resolve once every queued ledger write reached disk (tests and graceful
   * shutdown use it; ordinary callers rely on the chain's ordering alone).
   */
  async flushPersistence(): Promise<void> {
    await this.writeChain
  }

  // --- reads -----------------------------------------------------------------

  /**
   * The current in-memory ledger (the SSE/route snapshot source).
   * @returns the task records in ledger order.
   */
  listTasks(): readonly TaskRecord[] {
    return this.tasks
  }

  // --- CRUD ------------------------------------------------------------------

  /**
   * Append a task. Accepts either minimal create fields (`NewTaskInput`) or a
   * fuller row (id/createdAt/executions included) — the client diff-sync and
   * the migrate path send rows they already hold, and honoring their identity
   * keeps their ids stable across the move onto the host.
   * @param body - the JSON request body (task fields at the top level).
   * @returns the stored record.
   * @throws BoardError bad-request on invalid fields or a blank title;
   *   conflict when a provided id already exists.
   */
  createTask(body: unknown): TaskRecord {
    const input = this.coerceCreateInput(body)
    if (input === undefined) {
      throw new BoardError('bad-request', 'invalid task payload (title is required and must be non-blank)')
    }
    if (this.tasks.some(task => task.id === input.id)) {
      throw new BoardError('conflict', `task "${input.id}" already exists`)
    }
    this.tasks = [...this.tasks, input]
    this.persistAndEmit()
    return input
  }

  /**
   * Patch one task's editable fields. Host-owned fields (executions, ids,
   * timestamps beyond updatedAt) are ignored in the patch: the ledger copy a
   * client diffed against may be stale, and overwriting execution history or
   * a live status with it would lose real runs.
   * @param id - the task to update.
   * @param patch - editable-field changes (explicit undefined clears a pin).
   * @returns the updated record.
   * @throws BoardError not-found on an unknown id; bad-request on invalid values.
   */
  updateTask(id: string, patch: unknown): TaskRecord {
    const index = this.tasks.findIndex(task => task.id === id)
    if (index === -1) throw new BoardError('not-found', `task "${id}" not found`)
    const current = this.tasks[index] as TaskRecord
    const next = this.applyPatch(current, patch)
    const tasks = [...this.tasks]
    tasks[index] = next
    this.tasks = tasks
    this.persistAndEmit()
    return next
  }

  /**
   * Remove one task.
   * @param id - the task to remove.
   * @throws BoardError not-found on an unknown id.
   */
  deleteTask(id: string): void {
    if (!this.tasks.some(task => task.id === id)) {
      throw new BoardError('not-found', `task "${id}" not found`)
    }
    this.tasks = this.tasks.filter(task => task.id !== id)
    this.persistAndEmit()
  }

  /**
   * Import a client ledger exactly once: accepted only while the host ledger
   * is empty (the idempotence guard for two tabs racing their migration);
   * otherwise the batch is discarded and `{imported: 0}` reports the no-op.
   * Invalid rows are dropped by the shared normalizer.
   * @param body - the JSON request body (`{tasks: unknown[]}`).
   * @returns how many rows were imported.
   * @throws BoardError bad-request when `tasks` is missing or not an array.
   */
  importLedger(body: unknown): number {
    if (typeof body !== 'object' || body === null || !Array.isArray((body as Record<string, unknown>).tasks)) {
      throw new BoardError('bad-request', 'migrate expects a {tasks: [...]} array')
    }
    if (this.tasks.length > 0) return 0
    const imported: TaskRecord[] = []
    const seen = new Set<string>()
    for (const row of (body as Record<string, unknown>).tasks as unknown[]) {
      const task = normalizeTaskRow(row)
      if (task === undefined || seen.has(task.id)) continue
      seen.add(task.id)
      imported.push(task)
    }
    if (imported.length === 0) return 0
    this.tasks = [...this.tasks, ...imported]
    // An imported row may claim `running` from a browser run that never
    // settled; the same recovery rule as a restart applies (no frame watch
    // existed for those sessions), so they cannot wedge the run mutex.
    this.recoverInterruptedExecutions()
    this.persistAndEmit()
    return imported.length
  }

  // --- execution ---------------------------------------------------------------

  /**
   * Execute a task: open an execution record, flip the card to running, and
   * drive the real session chain in the background. A second call while the
   * task is already running is refused (scheduler + manual-run mutex).
   * @param id - the task to execute.
   * @returns the execution/session pair once the session exists.
   * @throws BoardError not-found on an unknown task; conflict while the task
   *   is already running or when the execution session cannot be created.
   */
  async startRun(id: string): Promise<{ executionId: string; sessionId: string }> {
    const accepted = this.acceptRun(id)
    if ('error' in accepted) throw accepted.error
    const { task, execution } = accepted
    const sessionId = await this.openExecutionSession(task, execution)
    return { executionId: execution.id, sessionId }
  }

  /**
   * The scheduler face of {@link startRun}: acceptance means the card flipped
   * to running (browser parity — the schedule rolls forward once the trigger
   * is taken); a later launch failure settles the execution record failed
   * instead of keeping the slot, which would re-fire every tick.
   */
  async runTask(id: string): Promise<boolean> {
    const accepted = this.acceptRun(id)
    if ('error' in accepted) return false
    const { task, execution } = accepted
    try {
      await this.openExecutionSession(task, execution)
    } catch {
      // Already settled as failed by the launch chain.
    }
    return true
  }

  // --- internals ---------------------------------------------------------------

  /**
   * Settle leftover unfinished executions from before a restart. The frame
   * watch only sees events from now on, so a run whose session ended while
   * the host was down would otherwise pin its card in `running` forever (and
   * block future runs via the mutex); they settle as cancelled instead.
   */
  private recoverInterruptedExecutions(): void {
    // A running card whose newest execution never settled cannot receive any
    // future frame (its run predates this process), so it settles cancelled.
    const isUnsettledRunning = (task: TaskRecord): boolean => {
      if (task.status !== 'running') return false
      const execution = task.executions[task.executions.length - 1]
      return execution !== undefined && execution.endedAt === undefined
    }
    if (!this.tasks.some(isUnsettledRunning)) return
    const now = this.now()
    this.tasks = this.tasks.map((task) => {
      if (!isUnsettledRunning(task)) return task
      const execution = task.executions[task.executions.length - 1] as ExecutionRecord
      return settleExecution(task, execution.id, 'cancelled', now, 'interrupted by host restart')
    })
    console.warn('[dsh-task-board] settled executions left running by a previous host process')
  }

  /** Arm the cron heartbeat; ticks gate on apiProxy readiness. */
  private startScheduler(): void {
    const api = this.api
    this.scheduler = new SchedulerService({
      tasks: () => this.tasks,
      now: () => this.now(),
      runTask: id => this.runTask(id),
      applySchedule: (id, nextRunAt, lastTriggeredAt) => { this.rollSchedule(id, nextRunAt, lastTriggeredAt) },
      ready: () => !this.stopped && api !== undefined,
    })
    this.scheduler.start()
  }

  /**
   * Roll a schedule forward (scheduler callback): persist the next due instant
   * and this trigger instant. No-op for tasks without a rule (deleted mid-tick).
   */
  private rollSchedule(id: string, nextRunAt: number | undefined, lastTriggeredAt: number | undefined): void {
    const now = this.now()
    this.tasks = this.tasks.map(task =>
      task.id === id && task.schedule !== undefined
        ? withSchedule(task, { nextRunAt, lastTriggeredAt }, now)
        : task)
    this.persistAndEmit()
  }

  /** Open the execution record and flip the card (shared by manual and scheduled runs). */
  private acceptRun(id: string): { task: TaskRecord; execution: ExecutionRecord } | { error: BoardError } {
    const task = this.tasks.find(candidate => candidate.id === id)
    if (task === undefined) return { error: new BoardError('not-found', `task "${id}" not found`) }
    if (task.status === 'running') return { error: new BoardError('conflict', `task "${id}" is already running`) }
    const { task: next, execution } = startExecution(task, this.now(), this.uuid())
    this.tasks = this.tasks.map(candidate => candidate.id === id ? next : candidate)
    this.persistAndEmit()
    return { task: next, execution }
  }

  /**
   * The post-acceptance chain: validate the pinned workspace, create the
   * session (with pinned preset), admit the pinned permission, best-effort
   * rename, then queue the task prompt. Every failure settles the run failed;
   * the returned session id is already attached to the execution record.
   */
  private async openExecutionSession(task: TaskRecord, execution: ExecutionRecord): Promise<string> {
    try {
      if (task.workspaceId !== undefined
        && !this.ctx.workspaceRegistry.list().some(workspace => String(workspace.id) === task.workspaceId)) {
        throw new Error(`task workspace is not available: ${task.workspaceId}`)
      }
      const created = await this.createExecutionSession(task)
      if (!created.result.ok) throw new Error(messageOf(created.result.error))
      const sessionId = created.result.value.sessionId
      this.attachSessionId(execution.id, sessionId)
      this.pendingBySession.set(sessionId, { taskId: task.id, executionId: execution.id })
      try {
        await this.applyPermissionPin(sessionId, task.permission)
        // Best-effort rename so the run is recognizable in the session list.
        try {
          await this.requireApi().sessions.rename({ rpcId: mintRpcId(), payload: { sessionId, title: task.title } })
        } catch { /* rename is cosmetic */ }
        const text = task.prompt.trim() !== '' ? task.prompt : task.title
        const prompted = await this.requireApi().sessions.prompt({
          rpcId: mintRpcId(),
          payload: { sessionId, mode: 'queue', content: [{ type: 'text', text }] },
        })
        if (!prompted.result.ok) throw new Error(messageOf(prompted.result.error))
      } catch (error) {
        this.pendingBySession.delete(sessionId)
        throw error
      }
      return sessionId
    } catch (error) {
      this.settle(task.id, execution.id, 'failed', messageOf(error))
      throw error instanceof BoardError ? error : new BoardError('conflict', `execution failed to start: ${messageOf(error)}`)
    }
  }

  /** sessions.create with the task-pinned workspace/preset (branded wire fields). */
  private async createExecutionSession(task: TaskRecord): Promise<RpcResponse<{ sessionId: string; agentPreset?: string }>> {
    return this.requireApi().sessions.create({
      rpcId: mintRpcId(),
      payload: {
        // The pin was validated against the workspace registry above; the
        // narrow wire face here carries it as a plain string.
        ...(task.workspaceId === undefined ? {} : { workspaceId: task.workspaceId }),
        ...(task.mode === undefined ? {} : { agentPreset: task.mode }),
      },
    })
  }

  /**
   * Admit the pinned permission preset through the same channel the browser
   * executor used: the `/permission <id>` slash command against the command
   * runtime (never prompt content — a leading-slash prompt would reach the
   * model as literal text). Both faces are optional composition members; a
   * deployment without them fails the run like the browser half did.
   */
  private async applyPermissionPin(sessionId: string, permission: TaskPermission | undefined): Promise<void> {
    if (permission === undefined) return
    const commands = this.ctx.get('commands') as CommandExecutionFace | undefined
    const agents = this.ctx.get('agents') as AgentRegistryFace | undefined
    if (commands === undefined || agents === undefined) {
      throw new Error(`this deployment does not support permission presets (task asks for ${permission})`)
    }
    const agent = agents.get(sessionId)
    if (agent === undefined) throw new Error('execution session is not ready for the permission command')
    const line = `/permission ${permission}`
    const executed = await commands.execute(agent, line, [], new AbortController().signal)
    if (executed === undefined) throw new Error(`permission command not recognized: ${line}`)
    if (executed.result.kind !== 'success') {
      throw new Error(`permission command rejected: ${executed.result.text ?? line}`)
    }
  }

  /** Record which session ran an execution (persist + broadcast). */
  private attachSessionId(executionId: string, sessionId: string): void {
    const now = this.now()
    this.tasks = this.tasks.map((task) => {
      if (!task.executions.some(execution => execution.id === executionId)) return task
      return {
        ...task,
        updatedAt: now,
        executions: task.executions.map(execution =>
          execution.id === executionId ? { ...execution, sessionId } : execution),
      }
    })
    this.persistAndEmit()
  }

  /**
   * Settle one execution from the frame watch or a failed launch chain:
   * re-reads the freshest record, applies the pure transition (no-op when the
   * execution is gone or already settled), and drops the pending entry.
   */
  private settle(taskId: string, executionId: string, outcome: 'succeeded' | 'failed' | 'cancelled', error: string | undefined): void {
    for (const [key, pending] of this.pendingBySession) {
      if (pending.executionId === executionId) this.pendingBySession.delete(key)
    }
    const task = this.tasks.find(candidate => candidate.id === taskId)
    if (task === undefined) return
    const next = settleExecution(task, executionId, outcome, this.now(), error)
    if (next === task) return
    this.tasks = this.tasks.map(candidate => candidate.id === taskId ? next : candidate)
    this.persistAndEmit()
  }

  /**
   * Consume the apiProxy host-frame stream and settle pending executions:
   * agent errors fail first (typically ahead of the status flip), and a
   * running:false status settles success unless an error already did. The
   * loop dies with the shutdown signal and never rejects.
   */
  private async watchHostFrames(signal: AbortSignal): Promise<void> {
    try {
      const frames = this.requireApi().events.host({ rpcId: mintRpcId(), payload: {} }, signal)
      for await (const frame of frames) {
        const payload = frame.payload
        if (payload.type === 'host/agent-error') {
          const pending = this.pendingBySession.get(payload.sessionId)
          if (pending !== undefined) this.settle(pending.taskId, pending.executionId, 'failed', payload.message)
          continue
        }
        if (payload.type === 'host/session-status' && !payload.running) {
          const pending = this.pendingBySession.get(payload.sessionId)
          if (pending !== undefined) this.settle(pending.taskId, pending.executionId, 'succeeded', undefined)
        }
      }
    } catch {
      // Shutdown abort or gateway teardown: the watch ends with the service.
    }
  }

  // --- patching ----------------------------------------------------------------

  /** Apply the whitelisted patch surface to one task (see {@link updateTask}). */
  private applyPatch(current: TaskRecord, patch: unknown): TaskRecord {
    if (typeof patch !== 'object' || patch === null) {
      throw new BoardError('bad-request', 'update expects a {patch} object')
    }
    const raw = patch as Record<string, unknown>
    const now = this.now()

    let title = current.title
    if ('title' in raw) {
      if (typeof raw.title !== 'string' || raw.title.trim() === '') {
        throw new BoardError('bad-request', 'title must be a non-blank string')
      }
      title = raw.title
    }
    let description = current.description
    if ('description' in raw) {
      if (typeof raw.description !== 'string') throw new BoardError('bad-request', 'description must be a string')
      description = raw.description
    }
    let prompt = current.prompt
    if ('prompt' in raw) {
      if (typeof raw.prompt !== 'string') throw new BoardError('bad-request', 'prompt must be a string')
      prompt = raw.prompt
    }
    const pins = this.patchTargetPins(raw)

    let status = current.status
    if ('status' in raw) {
      if (!isTaskStatus(raw.status)) throw new BoardError('bad-request', 'status must be a known column')
      status = raw.status
    }

    let next: TaskRecord = {
      ...current,
      title: title.trim(),
      description,
      prompt,
      status,
      updatedAt: now,
      ...pins,
    }
    if ('schedule' in raw) {
      next = this.applySchedulePatch(next, raw.schedule, now)
    }
    return next
  }

  /** Normalize the execution-target pins (null/blank clears, unknown permission refuses). */
  private patchTargetPins(
    raw: Record<string, unknown>,
  ): Pick<TaskRecord, 'workspaceId' | 'mode' | 'permission'> {
    const pins: Pick<TaskRecord, 'workspaceId' | 'mode' | 'permission'> = {}
    // Wire convention: absent key = keep, explicit null or blank string =
    // clear (the JSON form of the controller's "explicit undefined clears").
    const pinOf = (key: 'workspaceId' | 'mode'): string | undefined => {
      const value = raw[key]
      if (value === undefined || value === null) return undefined
      if (typeof value !== 'string') throw new BoardError('bad-request', `${key} must be a string or null`)
      const trimmed = value.trim()
      return trimmed === '' ? undefined : trimmed
    }
    if ('workspaceId' in raw) pins.workspaceId = pinOf('workspaceId')
    if ('mode' in raw) pins.mode = pinOf('mode')
    if ('permission' in raw) {
      const value = raw.permission
      if (value === undefined || value === null) {
        pins.permission = undefined
      } else if (typeof value !== 'string'
        || !(TASK_PERMISSIONS as readonly string[]).includes(value)) {
        throw new BoardError('bad-request', 'permission must be a known preset id or null')
      } else {
        pins.permission = value as TaskPermission
      }
    }
    return pins
  }

  /** Validate + recompute the whole schedule rule (setSchedule semantics). */
  private applySchedulePatch(task: TaskRecord, patch: unknown, now: number): TaskRecord {
    if (typeof patch !== 'object' || patch === null) {
      throw new BoardError('bad-request', 'schedule patch must be an object')
    }
    const raw = patch as { enabled?: unknown; cron?: unknown }
    const cron = (typeof raw.cron === 'string' ? raw.cron : task.schedule?.cron ?? '').trim()
    if (!isValidCron(cron)) throw new BoardError('bad-request', `invalid cron expression: ${JSON.stringify(cron)}`)
    const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : task.schedule?.enabled ?? false
    return withSchedule(task, {
      enabled,
      cron,
      nextRunAt: enabled ? nextRunAtMs(cron, now) : undefined,
    }, now)
  }

  // --- create coercion -----------------------------------------------------------

  /** Coerce a create/migrate-style body into a stored row (undefined = reject). */
  private coerceCreateInput(body: unknown): TaskRecord | undefined {
    if (typeof body !== 'object' || body === null) return undefined
    const record = body as Record<string, unknown>
    const now = this.now()
    // Text fields trim like the browser's create transition; a blank title
    // (after trimming) is the one rejection.
    const input: NewTaskInput & { id?: string; createdAt?: number; updatedAt?: number; status?: unknown } = {
      title: typeof record.title === 'string' ? record.title.trim() : '',
      description: typeof record.description === 'string' ? record.description.trim() : '',
      prompt: typeof record.prompt === 'string' ? record.prompt.trim() : '',
      workspaceId: typeof record.workspaceId === 'string' ? record.workspaceId : undefined,
      mode: typeof record.mode === 'string' ? record.mode : undefined,
      // Re-validated by normalizeTaskRow below; the cast only satisfies the
      // narrow NewTaskInput face.
      permission: typeof record.permission === 'string' ? record.permission as TaskPermission : undefined,
    }
    if (input.title === '') return undefined
    const minted = normalizeTaskRow({
      id: typeof record.id === 'string' && record.id !== '' ? record.id : this.uuid(),
      title: input.title,
      description: input.description,
      prompt: input.prompt,
      status: record.status,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : now,
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : now,
      executions: Array.isArray(record.executions) ? record.executions : [],
      schedule: record.schedule,
      workspaceId: input.workspaceId,
      mode: input.mode,
      permission: input.permission,
    })
    return minted
  }

  // --- persistence / broadcast -----------------------------------------------

  /** Persist through the ordered write chain, then broadcast the snapshot. */
  private persistAndEmit(): void {
    const snapshot = this.tasks
    this.writeChain = this.writeChain.then(async () => {
      await saveLedgerFile(this.ledgerPath, snapshot)
    }).catch((error: unknown) => {
      // Persistence faults degrade to a warning: the in-memory ledger stays
      // live (same policy the browser store applied to quota failures).
      console.error('[dsh-task-board] task ledger write failed (persistence skipped)', error)
    })
    this.emitChanged()
  }

  /** Broadcast the full-snapshot change event (SSE and host consumers follow). */
  private emitChanged(): void {
    this.ctx.emit('task-board/changed', { tasks: this.tasks })
  }

  /** The captured apiProxy (present between start and stop). */
  private requireApi(): TaskBoardApiFace {
    if (this.api === undefined) throw new Error('task-board service is not started')
    return this.api
  }
}
