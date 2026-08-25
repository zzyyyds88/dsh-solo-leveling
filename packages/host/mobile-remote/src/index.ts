/**
 * @deepseek-ai/dsh-host-mobile-remote — the phone-remote BFF between the DSH
 * Reins app and the dsh host. Exposes the small `/api/mobile/*` HTTP surface
 * (protocol handshake, whitelisted in-process RPC, interaction responses,
 * workspace-gated artifact reads) and one downstream-only WebSocket event
 * stream on the shared webserver; consumes `ctx.apiProxy`, the optional
 * `ctx.taskBoard`, and the workspace registry without inventing business
 * logic. Authentication rides the access gate's global pre-dispatch gate.
 *
 * The browser half of this feature is the separate settings-card package
 * `@deepseek-ai/dsh-client-ui-mobile-remote`.
 * @module @deepseek-ai/dsh-host-mobile-remote
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-host-apiproxy'
import type {} from '@deepseek-ai/dsh-workspace'
// Type-only edge: declares the 'task-board/changed' Context event this plugin
// fans out to connected phones (the service itself stays an optional dep).
import type {} from '@deepseek-ai/dsh-host-task-board'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { DEFAULT_MAX_REQUEST_BYTES, MOBILE_EVENTS_PATH, MobileError } from './core/protocol.ts'
import { buildWhitelist, extendWhitelistWithTaskBoard } from './core/whitelist.ts'
import { MobileFsService } from './core/fs-service.ts'
import { HOST_VERSION, PLUGIN_VERSION } from './core/version.ts'
import { MobileDownlinks } from './host/events.ts'
import { registerMobileRoutes } from './host/routes.ts'

/** Required services: the route registry, the gateway, and the workspace roots. */
export const inject = ['webServer', 'apiProxy', 'workspaceRegistry']

/** Settings namespace owning the remote's total switch and body cap. */
const SETTINGS_NS = settingsNamespace('mobile-remote')

/** Resolved settings section shape (schema defaults applied). */
interface RemoteSettings {
  enabled: boolean
  maxRequestBytes: number
}

/**
 * Mount the mobile-remote BFF: routes, upgrade path, task-board fan-out, and
 * the live settings wiring.
 * @param ctx - context carrying webServer, apiProxy, and workspaceRegistry.
 */
export function apply(ctx: Context): void {
  /** Live state read per request / per upgrade (settings save takes effect immediately). */
  const state = { enabled: true, maxRequestBytes: DEFAULT_MAX_REQUEST_BYTES }
  /** Latest resolved section reader (installed when a settings provider composes). */
  let readSection: (() => RemoteSettings) | undefined

  installSettingsSection(ctx, SETTINGS_NS, z.object({
    enabled: z.boolean().default(true),
    maxRequestBytes: z.natural().min(1).default(DEFAULT_MAX_REQUEST_BYTES),
  }), {
    enabled: true,
    maxRequestBytes: DEFAULT_MAX_REQUEST_BYTES,
  }, {
    setSource: (get) => { readSection = get },
    onChange: () => {
      /* v8 ignore start -- setSource is installed before every onChange; the guard only covers a provider vanishing mid-write. */
      const section = readSection?.()
      if (section === undefined) return
      /* v8 ignore stop */
      state.enabled = section.enabled
      state.maxRequestBytes = section.maxRequestBytes
    },
  })

  // Whitelist v1: apiproxy-backed methods now, the task-board group appended
  // only while that service is composed (capability downgrade otherwise).
  const routes = buildWhitelist(ctx.apiProxy)
  ctx.inject(['taskBoard'], (boardCtx) => {
    extendWhitelistWithTaskBoard(routes, boardCtx.taskBoard)
  })

  const fs = new MobileFsService((workspaceId) => {
    for (const workspace of ctx.workspaceRegistry.list()) {
      if (String(workspace.id) === workspaceId) return workspace.path
    }
    return undefined
  })

  const downlinks = new MobileDownlinks(ctx.apiProxy.events)

  ctx.effect(() => registerMobileRoutes(ctx, {
    state,
    routes,
    fs,
    apiProxy: ctx.apiProxy,
    info: { pluginVersion: PLUGIN_VERSION, hostVersion: HOST_VERSION },
  }), 'dsh-mobile-remote: /api/mobile routes')

  ctx.effect(() => ctx.webServer.registerUpgrade({
    path: MOBILE_EVENTS_PATH,
    handler: (req, socket, head) => {
      if (!state.enabled) {
        const body = '{"ok":false,"error":{"code":"not-found","message":"mobile remote is disabled"}}'
        socket.end([
          'HTTP/1.1 404 Not Found',
          'Connection: close',
          'Content-Type: application/json; charset=utf-8',
          `Content-Length: ${String(Buffer.byteLength(body))}`,
          '',
          body,
        ].join('\r\n'))
        return
      }
      downlinks.handle(req, socket, head)
    },
  }), 'dsh-mobile-remote: /api/mobile/events WebSocket')

  ctx.effect(() => ctx.on('task-board/changed', ({ tasks }) => {
    downlinks.broadcastTaskBoard(tasks)
  }), 'dsh-mobile-remote: task-board fan-out')

  ctx.effect(() => () => {
    /* v8 ignore start -- close() only rejects when the acceptor already stopped (a torn-down composition); teardown then just logs. */
    void downlinks.close().catch((error: unknown) => {
      ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
    })
    /* v8 ignore stop */
  }, 'dsh-mobile-remote: downlink teardown')
}

/** Re-export for tests and compositions that answer with structured errors. */
export { MobileError }
