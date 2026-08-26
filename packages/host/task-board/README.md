# @deepseek-ai/dsh-host-task-board

Host half of the DSH task board: the ledger of record, the in-process cron scheduler, real executions, and the /api/task-board/* routes. The browser half (`@deepseek-ai/dsh-client-ui-task-board`) is a pure view over these routes; the mobile remote consumes the same service.

## Purpose

- Owns the task ledger as a single in-memory snapshot persisted to `$DSH_HOME/task-board/ledger.json` (tmp + rename atomic replacement on every mutation; a corrupt file starts empty with a warning).
- Runs one SchedulerService inside the host process: 60s tick over 5-field cron rules, missed runs skip (an overdue task fires once and rolls forward), and a task that is already running skips its due instant.
- Executes tasks through `ctx.apiProxy.sessions` in-process: `sessions.create` with the pinned workspace / agent preset, the pinned permission preset admitted through the `/permission <id>` command before the turn starts, a best-effort rename to the task title, then `sessions.prompt` with the task prompt.
- Settles executions from the apiProxy host-frame stream (`host/agent-error` fails first, `host/session-status(running:false)` settles success); runs interrupted by a host restart settle as cancelled on the next load so no card sticks in running.
- Serves `/api/task-board/*` behind the access gate with a same-origin fence: GET `tasks`, POST `tasks/create|update|delete`, POST `run` (→ `{executionId, sessionId}`), POST `migrate` (accepted only while the ledger is empty — the two-tab race guard), and GET `events` SSE (`event: change` full snapshots, immediate snapshot on connect, 15s heartbeat).
- Emits `task-board/changed` (full snapshot) after every mutation for host consumers and the SSE bridge.
- Exposes the service as `ctx.taskBoard` for other host plugins.

## Configuration

None. Tick cadence, body limits, and the ledger location are constants; there is deliberately nothing to tune in v1.

## Model Experience

None, as the board registers no tool, prompt section, or schema of its own; the sessions its scheduler starts carry the task's own prompt through the standard session chain.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- No missed-run catch-up queue: by design, a run whose due instant passed while nothing was armed fires once and rolls forward.
- Settlement is frame-driven only: a session that ends without any host frame (host restart mid-run) is settled as cancelled at the next load rather than reconciled from the conversation log.
