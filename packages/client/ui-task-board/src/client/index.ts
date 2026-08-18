/**
 * Task-board client plugin: wires the framework-free core (controller,
 * execution service, store) to the real client runtime and mounts the two
 * DOM surfaces — the sidebar entry row and the board view in the center
 * column.
 *
 * Failure policy: DOM mounting problems are logged, never thrown — the web
 * shell fails the whole boot when a plugin apply throws, and an external
 * plugin must not take the GUI down.
 */
import type { ClientContext, SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle, PromptContentPart } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the locale plugin's Context merge (ctx.locale) and its
// LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: declares the keyed `settings.plugin.item` slot (plugin-config section).
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { BoardController } from '../core/controller.ts'
import { ExecutionService } from '../core/execution.ts'
import { SchedulerService } from '../core/scheduler.ts'
import { LocalStorageTaskStore } from '../core/store.ts'
import { claimTaskboardApply, releaseTaskboardApply } from './apply-guard.ts'
import { mountBoard } from './board-mount.tsx'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { TaskBoardSettingsCard, TaskBoardSettingsCardController, type TaskBoardSettings } from './TaskBoardSettingsCard.tsx'
import { en, zh, type TaskBoardKey } from './locales.ts'

/** Locale namespace this plugin owns. */
const NS = 'task-board'

/** Settings namespace the settings card edits (the Host plugin registers it). */
const TASK_BOARD_NS = 'task-board'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Task-board surface copy. */
    'task-board': TaskBoardKey
  }
}


/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'sessions', 'workspaces', 'connection', 'settingsScope', 'locale', 'remote']

/**
 * Mount the task board.
 * @param ctx - client root context (services: sessions, workspaces).
 */
export function apply(ctx: ClientContext): void {
  // A duplicated client injection (module factory executed twice in one page
  // lifetime) would otherwise mount a second sidebar entry and board view.
  // First application wins; later calls become no-ops (see apply-guard.ts).
  if (!claimTaskboardApply()) return

  // Release the claim when this fiber unloads (the loader supports plugin
  // unloads / hot-reloads), so a rebuilt bundle can claim again in the same
  // page instead of being silently dropped.
  ctx.effect(() => releaseTaskboardApply, 'task-board: apply claim')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'task-board: dictionaries')

  // Plugin configuration card: one staged form over the `task-board` settings
  // namespace, contributed to the Web UI plugin group.
  const settingsScope = ctx.settingsScope.bind<TaskBoardSettings>({ namespace: TASK_BOARD_NS })
  const settingsCard = new TaskBoardSettingsCardController(settingsScope)
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: TASK_BOARD_NS,
    locale: NS,
    inject: () => settingsCard.inject(),
  }, TaskBoardSettingsCard))

  // The sidebar entry and board view mount once the settings scope settles;
  // while the scope is still loading, the composition default is unknown, so
  // nothing mounts yet. Only an unavailable scope (no settings surface served)
  // falls back to the composition default (enabled).
  let uiDisposer: (() => void) | undefined
  const mountUi = (): void => {
    if (uiDisposer !== undefined) return
    const sessions = ctx.sessions
    const workspaces = ctx.workspaces
    const connection = ctx.get('connection') as ConnectionHandle

    // Core wiring: real runtime faces into the framework-free services.
    const store = new LocalStorageTaskStore()
    const exec = new ExecutionService({
      sessions: {
        list: sessions.list,
        binding: (id) => {
          const binding = sessions.binding(id as SessionId)
          if (binding === undefined) return undefined
          const { session } = binding
          return {
            session: {
              rename: title => session.rename(title),
              prompt: (content, mode) =>
                session.prompt(content as PromptContentPart[], mode).then(result =>
                  result.ok ? { ok: true as const } : { ok: false as const, error: result.error }),
              command: line =>
                session.command(line).then(result =>
                  result.ok ? { ok: true as const, matched: result.value.matched } : { ok: false as const, error: result.error }),
              getSnapshot: () => session.getSnapshot(),
              subscribe: fn => session.subscribe(fn),
            },
          }
        },
        noteAgentPreset: (sessionId, agentPreset) =>{  sessions.noteAgentPreset(sessionId as SessionId, agentPreset) },
      },
      workspaces: {
        list: workspaces.list,
        connectWorkspace: id => workspaces.connectWorkspace(id as WorkspaceId),
      },
      presets: {
        select: async (sessionId, agentPreset) => {
          try {
            const response = await connection.api.agentPresets.select({ sessionId: sessionId as SessionId, agentPreset })
            return response.result.ok ? { ok: true as const } : { ok: false as const, error: response.result.error }
          } catch (error) {
            return { ok: false as const, error }
          }
        },
      },
      history: {
        loadTail: async (sessionId) => {
          const response = await connection.api.sessions.history({
            sessionId: sessionId as SessionId,
            maxMessages: 20,
          })
          return response.result.ok
            ? { events: response.result.value.events.map(entry => entry.event) }
            : undefined
        },
      },
    })
    const controller = new BoardController({
      store,
      exec,
      sessions: {
        list: sessions.list,
        open: (id) =>{  sessions.open(id as SessionId) },
      },
    })
    controller.start()

    // Scheduled runs: a browser-side heartbeat that triggers due tasks through
    // the same run path as the manual Run button. The first tick is gated on
    // the session list baseline so a page-load catch-up never fires into a
    // not-yet-ready runtime; tab visibility recovery ticks immediately.
    const scheduler = new SchedulerService({
      tasks: () => controller.getSnapshot().tasks,
      now: () => Date.now(),
      runTask: id => controller.runTask(id),
      applySchedule: (id, nextRunAt, lastTriggeredAt) =>{
        controller.applyScheduleNextRun(id, nextRunAt, lastTriggeredAt) },
      ready: () => sessions.list.getSnapshot().phase === 'ready',
      environment: {
        addEventListener: (type, listener) =>{  document.addEventListener(type, listener) },
        removeEventListener: (type, listener) =>{  document.removeEventListener(type, listener) },
      },
    })
    scheduler.start()

    const disposers: Array<() => void> = []

    // Execution-target option feeds: the workspace list drives the workspace
    // picker, and the agent-preset roster drives the mode picker. Both are
    // runtime facts (not ledger state), so the wiring pushes them into the
    // controller on change; the preset roster is re-read after reconnects
    // because a reconnect may serve a different deployment.
    const pushWorkspaceOptions = (): void => {
      const snapshot = workspaces.list.getSnapshot()
      controller.setExecutionOptions({
        workspaces: snapshot.items.map(item => ({
          workspaceId: item.workspaceId,
          title: item.title !== '' ? item.title : item.path,
        })),
      })
    }
    pushWorkspaceOptions()
    disposers.push(workspaces.list.subscribe(pushWorkspaceOptions))
    const pushPresetOptions = async (): Promise<void> => {
      try {
        const response = await connection.api.agentPresets.list({})
        if (!response.result.ok) return
        controller.setExecutionOptions({
          presets: response.result.value.presets.map(preset => ({
            id: preset.id,
            name: preset.name ?? '',
            description: preset.description ?? '',
            broken: preset.broken ?? '',
            isDefault: preset.isDefault,
          })),
        })
      } catch (error) {
        // A failed roster read leaves the previous options in place; the
        // picker stays usable and the next reconnect retries the read.
        console.error('[dsh-task-board] agent preset roster read failed', error)
      }
    }
    void pushPresetOptions()
    disposers.push(ctx.on('connection/reset', () => { void pushPresetOptions() }))
    try {
      disposers.push(mountSidebarEntry(controller))
      disposers.push(mountBoard(controller))
    } catch (error) {
      // DOM failures degrade the board, never the GUI.
      console.error('[dsh-task-board] mount failed:', error)
    }

    uiDisposer = () => {
      for (const dispose of disposers.splice(0)) dispose()
      scheduler.dispose()
      controller.dispose()
      uiDisposer = undefined
    }
  }
  const syncEnabled = (): void => {
    const snapshot = settingsScope.getSnapshot()
    const enabled = snapshot.status === 'ready'
      ? snapshot.value?.enabled ?? true
      : snapshot.status === 'unavailable'
    if (enabled) mountUi()
    else uiDisposer?.()
  }
  settingsScope.subscribe(syncEnabled)
  syncEnabled()
}
