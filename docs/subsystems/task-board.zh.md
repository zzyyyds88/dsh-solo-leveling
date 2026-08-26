# 任务看板

[English](task-board.md) | 中文

任务看板把 DSH 看板台账作为持久的 host 侧快照来持有：五列任务记录（含 cron 调度与执行历史）持久化到 `$DSH_HOME/task-board/ledger.json`，且只由 host 进程内的 `ctx.taskBoard` 服务（[`@deepseek-ai/dsh-host-task-board`](../../packages/host/task-board)）改动。网页看板（[`@deepseek-ai/dsh-client-ui-task-board`](../../packages/client/ui-task-board)）与手机遥控是同一批 `/api/task-board/*` 路由（SSE 全量快照）之上的纯视图，都不持有定时器或台账状态。组装、执行结算与路由行为由该[包](../../packages/host/task-board)负责；本页记录其他 host 插件消费的服务与事件面。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxtaskboard--taskboardservice"></a>

### `ctx.taskBoard` — `TaskBoardService`

The board's single writer: ledger state, persistence, scheduling, and executions (see module doc).

```ts cordis-catalog
/**
 * Load the ledger, then arm everything that reads it: routes may already be
 * registered (they serve whatever is loaded), so the scheduler and frame
 * watcher only start after recovery completes.
 */
async start(): Promise<void>

/** Stop ticking, abort the frame watch, and refuse further runs (idempotent). */
stop(): void

/**
 * Resolve once every queued ledger write reached disk (tests and graceful
 * shutdown use it; ordinary callers rely on the chain's ordering alone).
 */
async flushPersistence(): Promise<void>

/**
 * The current in-memory ledger (the SSE/route snapshot source).
 * @returns the task records in ledger order.
 */
listTasks(): readonly TaskRecord[]

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
createTask(body: unknown): TaskRecord

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
updateTask(id: string, patch: unknown): TaskRecord

/**
 * Remove one task.
 * @param id - the task to remove.
 * @throws BoardError not-found on an unknown id.
 */
deleteTask(id: string): void

/**
 * Import a client ledger exactly once: accepted only while the host ledger
 * is empty (the idempotence guard for two tabs racing their migration);
 * otherwise the batch is discarded and `{imported: 0}` reports the no-op.
 * Invalid rows are dropped by the shared normalizer.
 * @param body - the JSON request body (`{tasks: unknown[]}`).
 * @returns how many rows were imported.
 * @throws BoardError bad-request when `tasks` is missing or not an array.
 */
importLedger(body: unknown): number

/**
 * Execute a task: open an execution record, flip the card to running, and
 * drive the real session chain in the background. A second call while the
 * task is already running is refused (scheduler + manual-run mutex).
 * @param id - the task to execute.
 * @returns the execution/session pair once the session exists.
 * @throws BoardError not-found on an unknown task; conflict while the task
 *   is already running or when the execution session cannot be created.
 */
async startRun(id: string): Promise<{ executionId: string; sessionId: string }>

/**
 * The scheduler face of {@link startRun}: acceptance means the card flipped
 * to running (browser parity — the schedule rolls forward once the trigger
 * is taken); a later launch failure settles the execution record failed
 * instead of keeping the slot, which would re-fire every tick.
 * @param id - the task to execute.
 * @returns whether the run was accepted (an unknown task or a held mutex
 *   yields false instead of throwing).
 */
async runTask(id: string): Promise<boolean>
```

Source: [`packages/host/task-board/src/host/service.ts`](../../packages/host/task-board/src/host/service.ts)

<a id="task-board-events"></a>

### `task-board/*` events

<a id="task-boardchanged--emit"></a>

#### `task-board/changed` — emit

The task ledger changed; the argument is the new full snapshot. Emitted after every mutation (CRUD, execution records, schedule roll-forward).

```ts cordis-catalog
/**
 * The task ledger changed; the argument is the new full snapshot. Emitted
 * after every mutation (CRUD, execution records, schedule roll-forward).
 * @param payload - `{tasks}` full-snapshot envelope.
 * @mode emit
 */
'task-board/changed'(payload: { tasks: readonly TaskRecord[] }): void
```

Source: [`packages/host/task-board/src/index.ts`](../../packages/host/task-board/src/index.ts)
<!-- END GENERATED cordis-surface -->
