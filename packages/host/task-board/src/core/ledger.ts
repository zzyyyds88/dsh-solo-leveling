/**
 * Task-ledger parsing and persistence for the host half.
 *
 * This is the host-side port of the browser store's validation logic
 * (`ui-task-board/src/core/store.ts`): a persisted document is an array of
 * task rows; structurally invalid rows are dropped, unknown statuses land in
 * `todo`, malformed schedules are stripped for later repair, and blank
 * execution-target strings clear their pin. The localStorage mechanics do not
 * carry over — the ledger of record is one JSON file under
 * `$DSH_HOME/task-board/ledger.json`, replaced atomically on every write.
 * @module dsh-host-task-board/core/ledger
 */
import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { ScheduleRule, TaskRecord } from './tasks.ts'
import { isTaskPermission, isTaskStatus } from './tasks.ts'
import { isValidCron } from './schedule.ts'

/** Log prefix shared with the browser half's diagnostics. */
const LOG_PREFIX = '[dsh-task-board]'

/**
 * Structural row check with the status left unvalidated (see {@link parseLedger}).
 * The `schedule` field is deliberately NOT checked here: a malformed schedule
 * never drops the task row — {@link normalizeSchedule} repairs or drops the
 * schedule alone.
 */
function isTaskRecordShape(value: unknown): value is Omit<TaskRecord, 'status'> & { status: unknown } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return false
  if (typeof record.title !== 'string') return false
  if (typeof record.description !== 'string') return false
  if (typeof record.prompt !== 'string') return false
  if (typeof record.createdAt !== 'number') return false
  if (typeof record.updatedAt !== 'number') return false
  if (record.workspaceId !== undefined && typeof record.workspaceId !== 'string') return false
  if (record.mode !== undefined && typeof record.mode !== 'string') return false
  if (record.permission !== undefined && typeof record.permission !== 'string') return false
  if (!Array.isArray(record.executions)) return false
  for (const execution of record.executions) {
    if (typeof execution !== 'object' || execution === null) return false
    const entry = execution as Record<string, unknown>
    if (typeof entry.id !== 'string') return false
    if (entry.sessionId !== undefined && typeof entry.sessionId !== 'string') return false
    if (typeof entry.startedAt !== 'number') return false
    if (entry.endedAt !== undefined && typeof entry.endedAt !== 'number') return false
    if (entry.result !== undefined && entry.result !== 'succeeded' && entry.result !== 'failed' && entry.result !== 'cancelled') return false
    if (entry.error !== undefined && typeof entry.error !== 'string') return false
  }
  return true
}

/** Collapse a blank persisted target string to undefined (clears the pin). */
function normalizeTargetId(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() === '' ? undefined : value
}

/** Normalize an unknown persisted status back into the closed status union. */
function normalizeStatus(status: unknown): TaskRecord['status'] {
  return isTaskStatus(status) ? status : 'todo'
}

/**
 * Repair a persisted schedule rule: drop rules without a usable cron string,
 * coerce booleans/numbers, and leave `nextRunAt`/`lastTriggeredAt` undefined
 * when missing (a fresh recompute or the next tick fixes them).
 */
function normalizeSchedule(schedule: unknown): ScheduleRule | undefined {
  if (typeof schedule !== 'object' || schedule === null) return undefined
  const rule = schedule as Record<string, unknown>
  // Reject (drop) a schedule whose cron is not a well-formed 5-field
  // expression: a malformed rule would otherwise linger as a never-firing
  // schedule instead of being dropped for later repair.
  if (typeof rule.cron !== 'string') return undefined
  if (rule.cron.trim() === '' || !isValidCron(rule.cron)) return undefined
  return {
    enabled: rule.enabled === true,
    cron: rule.cron,
    nextRunAt: typeof rule.nextRunAt === 'number' ? rule.nextRunAt : undefined,
    lastTriggeredAt: typeof rule.lastTriggeredAt === 'number' ? rule.lastTriggeredAt : undefined,
  }
}

/**
 * Whether an unknown value is a structurally valid task record (round-trips
 * through the board UI).
 * @param value - the unknown value to test.
 * @returns true when the value is a structurally valid task record.
 */
export function isTaskRecord(value: unknown): value is TaskRecord {
  return isTaskRecordShape(value) && isTaskStatus(value.status)
}

/**
 * Normalize one ledger row: invalid rows are dropped (undefined), everything
 * else is repaired field by field. Shared by file loading and the migrate
 * endpoint so both accept exactly the same input surface.
 * @param row - the unknown row to normalize.
 * @returns the normalized task record, or undefined when the row must be dropped.
 */
export function normalizeTaskRow(row: unknown): TaskRecord | undefined {
  // Status is normalized (an unknown status from a future version lands in
  // todo instead of dropping the row); the schedule is repaired field by
  // field; every other field must be valid.
  if (!isTaskRecordShape(row)) {
    console.warn(`${LOG_PREFIX} dropping invalid task row from ledger`, row)
    return undefined
  }
  // Always (re)assign the schedule: a repair that returns undefined must
  // clear a malformed persisted rule rather than leave it in the row.
  const task: TaskRecord = { ...row, status: normalizeStatus(row.status) }
  task.schedule = normalizeSchedule(row.schedule)
  // Execution targets are normalized like the schedule: blank strings
  // clear the pin and unknown permission strings from a future version
  // fall back to the session default instead of dropping the row.
  task.workspaceId = normalizeTargetId(row.workspaceId)
  task.mode = normalizeTargetId(row.mode)
  task.permission = isTaskPermission(row.permission) ? row.permission : undefined
  return task
}

/**
 * Parse + validate a serialized ledger document; invalid rows are dropped.
 * @param raw - the document text.
 * @returns the valid task rows in the document ([] when it is not a JSON array).
 */
export function parseLedger(raw: string): TaskRecord[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.error(`${LOG_PREFIX} persisted task ledger is not valid JSON; starting empty`, error)
    return []
  }
  if (!Array.isArray(parsed)) {
    console.error(`${LOG_PREFIX} persisted task ledger is not an array; starting empty`)
    return []
  }
  const tasks: TaskRecord[] = []
  for (const row of parsed) {
    const task = normalizeTaskRow(row)
    if (task !== undefined) tasks.push(task)
  }
  return tasks
}

/** Read + validate the ledger file; absence and read faults start from an empty ledger. */
export async function loadLedgerFile(path: string): Promise<TaskRecord[]> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`${LOG_PREFIX} task ledger read failed; starting empty`, error)
    }
    return []
  }
  return parseLedger(raw)
}

/**
 * Replace the ledger file in one atomic step (write tmp sibling + rename over
 * the target), creating parent directories. Write failures propagate to the
 * caller, which keeps serving the in-memory state and logs the fault.
 */
export async function saveLedgerFile(path: string, tasks: readonly TaskRecord[]): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(tasks, null, 2)}\n`, { mode: 0o600 })
}
