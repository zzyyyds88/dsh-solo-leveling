/**
 * @deepseek-ai/dsh-host-task-board — host half of the task board: the ledger
 * of record (`$DSH_HOME/task-board/ledger.json`), the in-process cron
 * scheduler (60s tick, missed runs skip), real executions through the API
 * gateway with the task's pinned workspace/preset/permission, and the
 * `/api/task-board/*` JSON + SSE routes. The browser half
 * (`@deepseek-ai/dsh-client-ui-task-board`, exports "./client") becomes a pure
 * view over these routes; both share one ledger.
 *
 * The host half owns no model-visible surface of its own: the board's agent
 * announcement stays with the client package's loader entry.
 * @module @deepseek-ai/dsh-host-task-board
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { TaskBoardService } from './host/service.ts'
import { registerTaskBoardRoutes } from './host/routes.ts'
import type { TaskRecord } from './core/tasks.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The task-board ledger service (the single writer of the board state). */
    taskBoard: TaskBoardService
  }
  interface Events {
    /**
     * The task ledger changed; the argument is the new full snapshot. Emitted
     * after every mutation (CRUD, execution records, schedule roll-forward).
     * @param payload - `{tasks}` full-snapshot envelope.
     * @mode emit
     */
    'task-board/changed'(payload: { tasks: readonly TaskRecord[] }): void
  }
}

/** Required services: the route registry, the in-process execution gateway, and the pinned-workspace validator. */
export const inject = ['webServer', 'apiProxy', 'workspaceRegistry']

export { TaskBoardService } from './host/service.ts'
export type { TaskBoardOptions, TaskUpdatePatch } from './host/service.ts'
export { registerTaskBoardRoutes, TASK_BOARD_API_PREFIX } from './host/routes.ts'
export { BoardError } from './core/board-error.ts'
export { parseLedger, normalizeTaskRow, loadLedgerFile, saveLedgerFile } from './core/ledger.ts'

/**
 * Mount the task-board service and its routes.
 * @param ctx - context carrying webServer, apiProxy, and workspaceRegistry.
 */
export function apply(ctx: Context): void {
  const service = new TaskBoardService(ctx)
  ctx.effect(() => registerTaskBoardRoutes(ctx, service), 'dsh-task-board: /api/task-board routes')
  ctx.effect(() => {
    void service.start()
    return () => { service.stop() }
  }, 'dsh-task-board: ledger service + scheduler')
}
