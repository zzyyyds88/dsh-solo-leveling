# dsh-task-board — DSH web GUI task board plugin

A DeepSeek Harness (DSH) GUI plugin: it adds a **task board** entry below "新会话" (New session) in the sidebar; clicking it switches the middle column entirely to a multi-column kanban view. Tasks execute for **real** through DSH's own session mechanism (`session.prompt`), and execution status is written back to the card in real time.

Since the task-board **host 化** (see `docs/工作区/任务看板host化.md`), this package is the browser half of a dual-package split: the ledger of record, the cron scheduler, and the executions live in the host half `@deepseek-ai/dsh-host-task-board` (`$DSH_HOME/task-board/ledger.json` + `/api/task-board/*`); this package is a pure view over those routes and shares one ledger with the mobile remote.

- Mounted as a cordis plugin + browser DOM extension inside the harness monorepo (`packages/client/ui-task-board` + `packages/host/task-board`).
- Unmounting restores the original state; other managed segments are unaffected.
- Task data persists in the host's `$DSH_HOME/task-board/ledger.json`; it survives page refreshes, and scheduling no longer depends on any browser tab staying open.

## Features

- **Sidebar entry**: injects a "任务看板" (task board) entry row inside the sidebar column (`[data-pane="sidebar"]` on older shells, `[class*="sidebarCol"]` on the DSH 0.1.0-rc.6 AppFrame layout) below the new-session button (wide rail shows icon + text, collapsed rail shows a bare icon, adapting to DSH skin tokens).
- **Multi-column board**: five columns — 待规划 (to plan) / 待办 (to do) / 进行中 (in progress) / 已完成 (done) / 已失败 (failed); cards show title, description, status, update time, and execution count; the top supports search filter, new task, and back to chat.
- **Task details**: click a card to open details (title/description/execution prompt/execution log) — it does **not** execute on a single click; the details offer "执行 / 重新执行" (Run / Re-run), "删除" (Delete, with confirm), "查看会话" (View session, jumps to the execution transcript), and a manual move to 待规划/待办.
- **Host-driven real execution**: on "执行" (Run), the client POSTs `/api/task-board/run`; the host creates the session in-process (`sessions.create` with the pinned workspace/preset), admits the pinned permission through the `/permission <id>` command before the turn starts, renames the session after the task title, and queues the task prompt via `sessions.prompt`. The execution session appears in the session list and can be opened to view the real transcript.
- **Per-task execution targets**: a task can pin where and how it runs — **workspace** (the execution session lands in that workspace, validated against the workspace registry on the host), **mode** (the agent preset the session is composed from at creation), and **permission** (a sandbox preset admitted through the `/permission <id>` command: read-only / workspace-write / danger-full-access). Blank pins fall back to the runtime defaults (recent workspace / deployment preset / session default). A pin that cannot be applied fails the run **before** the prompt is sent, so a task never silently runs under settings it did not ask for.
- **Status write-back**: card status (进行中 → 完成/失败) is settled by the host from the apiProxy host-frame stream (`host/agent-error` → failed, `host/session-status(running:false)` → done) and pushed to every open board through the SSE change stream.
- **Scheduled tasks**: the details panel can schedule a task — an enable switch + a 5-field cron expression (分 时 日 月 周, supporting `*` / `*/n` / `a-b` / comma lists) + common presets (daily 09:00, every hour, every 10 minutes, Mondays 09:00); enabling computes the "下次运行时间" (next run time) on the host, and the card shows a scheduled marker; at the due time the host scheduler takes the same real-execution path (as manual run) — even with every browser tab closed — and the execution session remains linkable.
- **System-prompt injection**: the loader entry (`src/index.ts`) registers a `plugin:task-board` section (order 200) via `SystemPrompt.section`, declaring this plugin's existence, capabilities, and limits to every agent — it is injected when the plugin is in the composition (after mount + DSH restart) and disappears when removed (after unmount + restart), so an agent needs no external docs to know how to work with this board.

## Directory structure

```
package.json / tsconfig.json / tsdown.config.ts   # workspace build
src/index.ts / src/invariant.ts                    # host loader entry: injects SystemPrompt section (no other behavior)
src/client/index.ts                                # apply(ctx): wires host store/SSE/run + mounts DOM
src/client/host-store.ts                           # TaskStore backend over /api/task-board/* (+ one-shot localStorage migration)
src/client/sidebar-entry.ts                        # sidebar entry injection (self-healing MutationObserver)
src/client/board-mount.tsx                         # middle-column board mount + show/hide toggle
src/client/board/*.tsx                             # React board views (columns/cards/details/new/confirm)
src/client/board.module.css                        # styles (--dsw-* tokens, adapting to theme/skin)
src/core/tasks.ts                                  # task model + state machine (pure functions)
src/core/schedule.ts                               # cron parsing + next-run time (pure functions)
src/core/store.ts                                  # TaskStore seam (localStorage backend = migration source; in-memory = tests)
src/core/controller.ts                             # controller (view state, diff replay, navigation awareness)
```

## Why it is wired this way (research conclusions)

- **No usable add-on slot in the sidebar**: the sidebar shell only declares two single slots, `sidebar.workspaces` / `sidebar.settings`, both already taken by ui-workspace / ui-settings; an external plugin cannot register a new slot (declaring means claiming, and duplicating throws). So the entry goes through the skin-precedent **DOM injection**, self-healed with a MutationObserver (when a React re-render touches the node it re-inserts within the same frame, no flicker).
- **The middle column cannot be replaced through a slot**: the `conversation` slot is single and already taken by ui-conversation. The board view mounts on the center column (`[data-pane="conversation"]` on older shells, `[class*="centerCol"]` on the DSH 0.1.0-rc.6 AppFrame layout) as a tail child node (outside React's ownership), toggled via the `<html data-dsh-taskboard-active>` attribute, keeping the chat subtree below mounted and stateful.
- **The ledger lives on the host**: client plugins run in the browser and the browser has no writable file channel, so the ledger of record moved to the host half's `$DSH_HOME/task-board/ledger.json` (atomic tmp+rename writes); the browser reads and mutates it through `/api/task-board/*` and receives full-snapshot pushes over SSE.
- **Execution rides the host gateway**: the browser only POSTs `/api/task-board/run`; the host drives `sessions.create` / `sessions.prompt` in-process with the pinned workspace/preset, admits the permission pin through the command runtime (the same `/permission <id>` channel the shell's own permission picker uses — never prompt content), and settles the run from the host-frame stream. A rejected admission or an unknown line fails the run before the prompt.
- **Settlement is frame-driven**: `host/agent-error` fails the pending execution first; a later or earlier `host/session-status(running:false)` settles success only if no error did. Runs left running by a host restart settle as cancelled at the next load so no card sticks in 进行中.
- **Scheduled tasks run in the host scheduler**: one SchedulerService ticks every minute inside the host process — missed runs skip (an overdue task fires once and rolls forward), a task that is 进行中 skips its due instant, and closing every browser tab does not stop it.
- **Every board sees the same ledger**: edits replay as create/update/delete diffs onto the routes, and each connected board reloads on the next SSE change snapshot (`EventSource('/api/task-board/events')`), replacing the old localStorage storage-event cross-tab channel.

## Install

Install the family aggregate package `@zzyyyds88/dsh-web-ui-all` (all plugins and skins in one) or this plugin alone:

```sh
### 从 npm 安装（推荐）
dsh plugin --profile web add @zzyyyds88/dsh-client-ui-task-board

### 从仓库安装（开发调试）
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-task-board

```

After installing, **restart `dsh web`** — a "任务看板" (task board) entry appears below "新会话" (New session) in the sidebar; a page refresh is not enough, the process must restart.

## Build

Prerequisites: Node ≥ 20 with the official NPM SDK reachable (configure the `NPM_TOKEN` env var + project `.npmrc` if still using private-scope auth; see the repo `docs/plugins.md`). Types and runtime APIs all come from the official NPM SDK (`@deepseek-ai/*` devDependencies); **no DSH source checkout is required**.

```sh
cd ~/code/dsh-web-ui/packages/dsh-task-board
pnpm install        # first time (run pnpm install at the workspace root)
pnpm run build      # produces lib/index.js + lib/client.js (tsdown + shared/tsdown.client.ts preset)
pnpm run typecheck  # type check (SDK package types from node_modules)
pnpm test           # vitest: storage read/write / state transitions / execution trigger
```

## Mount / Unmount

This plugin uses the official profile-bundle shape (package.json declares `dsh.bundle.patch` + `dsh.client`, see `cordis.patch.yml`). Mounting = registering the dependency and bundle rows in the web profile manifest (`~/.dsh/profiles/web/package.json`) and installing:

```sh
# Mount (registers dependencies + dsh.profile.bundles, pnpm install; takes effect after restarting the GUI)
node scripts/dsh-task-board.js mount

# View status
node scripts/dsh-task-board.js status

# Unmount (removes the registered rows; restores the original GUI after restart; task data is kept)
node scripts/dsh-task-board.js unmount
```

The rows registered in the profile manifest:

```json
{
  "dependencies": { "@zzyyyds88/dsh-client-ui-task-board": "link:/Users/zcl/code/dsh-web-ui/packages/dsh-task-board" },
  "dsh": { "profile": { "bundles": [ "...", "@zzyyyds88/dsh-client-ui-task-board" ] } }
}
```

> Note: the profile layer (bundle rows, `dsh.client` metadata) is read when the dsh web process starts, so a **restart of the dsh web GUI** is required after mount/unmount (a page refresh is not enough).

## Data storage location

- The task ledger of record lives on the host at `$DSH_HOME/task-board/ledger.json` (atomic replacement on every change; a corrupt file starts empty with a warning).
- Legacy browser rows under localStorage key `dsh.taskBoard.v1` migrate once, automatically: while the host ledger is empty, the first board load uploads them to `/api/task-board/migrate` and removes the local copy after every row is imported.
- The storage layer remains the `TaskStore` interface (`src/core/store.ts`); `client/host-store.ts` implements it over the host routes.

## Manual verification steps

1. `npm run build` → `node scripts/dsh-task-board.js mount` → refresh `http://127.0.0.1:3080`.
2. A "任务看板" (task board) entry row appears below "新会话" in the sidebar; click it → the middle column switches to the five-column board.
3. "+ 新建任务" (New task) with title/description/Prompt → the card appears in 待办 (to do). The dialog also offers 工作区/模式/权限 (workspace / mode / permission) pins — leave them blank for runtime defaults.
4. Pin a workspace/mode/permission on a task (in the dialog or the task detail) → run it → the execution session appears under the pinned workspace, its list row shows the pinned preset, and the session's permission selector shows the pinned permission.
5. Click the card → details show content and Prompt; click "执行" (Run) → the card becomes 进行中 (in progress) (a session named after the task title appears in the session list); after the agent finishes the card lands in 已完成 (done) or 已失败 (failed), the detail execution log has a result and time, and "查看会话" (View session) jumps to the real transcript.
6. Scheduled task: details → tick "定时运行" (Scheduled run) to enable, pick the preset "每 10 分钟" (every 10 minutes, cron `*/10 * * * *`); a scheduled marker appears on the card; wait for the next whole 10-minute mark, watch the card automatically enter 进行中 (in progress) and eventually complete, with "上次触发" (last trigger) showing a time and a new execution-log row (the session is linkable).
7. Refresh the page / restart DSH → tasks remain; unmount the plugin → the GUI restores to its original state.

## Acceptance checklist

- After mount, a "任务看板" (task board) entry appears in the sidebar; clicking toggles the board, and clicking a session item returns to the chat view
- New task (title + description/Prompt); tasks remain after refresh/restart (localStorage persistence)
- Click a card to open details (content + execution log); the details have "执行" (Run) and "删除" (Delete) buttons
- Execution really starts a session (its transcript is visible in the session list); card status follows the real execution progress; the details can jump to the execution session
- Delete has a confirm step, and the local store is synced-removed after deletion
- Scheduled tasks: cron config/preset/validation, next-run time, auto real execution at the due time, status write-back, scheduled card marker, scheduling resumes after refresh (browser-side scheduling, the tab must stay open)
- Per-task execution targets: workspace/mode/permission pins persist across refresh, drive the execution session, and an un-appliable pin (missing workspace, locked preset, unknown permission command) fails the run with the reason visible in the execution log
- One-click mount/unmount; after unmount the GUI restores and other managed segments are unaffected
- README + automated tests covering storage read/write, state transitions, execution trigger, cron parsing, and the scheduler

## Model Experience

Indirectly, through the system-prompt section the host half injects to announce the task board to every agent.

#### KV Cache effect

Stable while the section is mounted; the announcement text is constant per composition.

## Known Limitations and Deferred Work

- Scheduled tasks run in the in-tab browser scheduler, so a due task is skipped ("miss = skip") while its tab is closed; catch-up only fires for already-deferred due tasks on the next open.
- The task ledger persists only in browser localStorage, so it is not shared across devices and is cleared with the origin's storage.
- The scheduler fires at minute granularity, so cron expressions below one minute (or sub-minute delays) are not supported.
- The injected system-prompt section only appears after a dsh web restart following a composition change; a page refresh alone does not add or remove it.
