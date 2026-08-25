/**
 * /api/task-board/* route layer: JSON envelope (`{ok,value}` / `{ok,error}`)
 * CRUD + run + migrate, plus one SSE change stream. The service owns ledger
 * semantics; this layer owns HTTP shape, the same-origin fence, body bounds,
 * and subscriber bookkeeping.
 *
 * Every route sits behind the access-gate's global pre-dispatch gate, so no
 * route-local authentication is needed; the same-origin fence (copied from
 * ui-skin-center) closes the cross-site browser vector the gate does not see.
 * @module dsh-host-task-board/host/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { BoardError, isBoardError } from '../core/board-error.ts'
import type { TaskRecord } from '../core/tasks.ts'

/** Route prefix (JSON operations use exact subpaths under it). */
export const TASK_BOARD_API_PREFIX = '/api/task-board'

/** SSE keep-alive comment interval (proxies drop idle connections). */
const HEARTBEAT_MS = 15_000

/** Maximum accepted JSON body (1 MiB covers any realistic ledger batch). */
const MAX_BODY_BYTES = 1 << 20

interface Subscriber {
  res: ServerResponse
}

/** One JSON response. */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** The success envelope. */
function ok(value: unknown): unknown {
  return { ok: true, value }
}

/**
 * Same-origin fence. Browsers send `Sec-Fetch-Site` on every fetch: same-site
 * and cross-site pages both resolve their `Origin` here, so the checks are:
 * a `cross-site` fetch is always rejected, and an `Origin` that does not
 * match the request `Host` is rejected. Requests without either header
 * (curl, node http, old browsers) pass — this is a local single-user tool,
 * and the fence only targets the cross-site browser vector.
 *
 * Function bodies copied verbatim from packages/client/ui-skin-center/src/routes.ts.
 */
function isSameOriginRequest(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site === 'cross-site') return false
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    const host = req.headers.host
    if (typeof host !== 'string' || host === '') return false
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  return true
}

/** Reject cross-site requests with 403. */
function requireSameOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  if (isSameOriginRequest(req)) return true
  json(res, 403, { ok: false, error: 'cross-site-request-rejected' })
  return false
}

/**
 * Read one bounded JSON request body. Rejects with 'body-too-large' past the
 * cap and 'invalid-json' on parse failure; an empty body resolves to null.
 */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body-too-large'))
        queueMicrotask(() => req.destroy())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid-json'))
      }
    })
    req.on('error', reject)
  })
}

/** Require the method or answer 405. */
function requireMethod(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (req.method === method) return true
  json(res, 405, { ok: false, error: 'method-not-allowed' })
  return false
}

/** Translate a service rejection into its envelope/status pair. */
function fail(res: ServerResponse, error: BoardError): void {
  const status = error.code === 'not-found' ? 404 : error.code === 'conflict' ? 409 : 400
  json(res, status, { ok: false, error: { code: error.code, message: error.message } })
}

/** Run one POST operation, mapping throws onto the envelope. */
async function servePost(
  res: ServerResponse,
  run: () => unknown,
): Promise<void> {
  try {
    json(res, 200, ok(await Promise.resolve(run())))
  } catch (error) {
    if (isBoardError(error)) {
      fail(res, error)
      return
    }
    console.error('[dsh-task-board] route handler failed:', error)
    json(res, 400, { ok: false, error: { code: 'bad-request', message: error instanceof Error ? error.message : String(error) } })
  }
}

/**
 * Register the /api/task-board routes (exact subpaths + one SSE stream).
 * @param ctx - context carrying webServer; also the change-event source.
 * @param service - the task-board service face the routes call.
 * @returns the disposer removing routes, subscribers, and the heartbeat.
 */
export function registerTaskBoardRoutes(
  ctx: Context,
  service: {
    listTasks(): readonly TaskRecord[]
    createTask(body: unknown): TaskRecord
    updateTask(id: string, patch: unknown): TaskRecord
    deleteTask(id: string): void
    importLedger(body: unknown): number
    startRun(id: string): Promise<{ executionId: string; sessionId: string }>
  },
): () => void {
  const subscribers = new Set<Subscriber>()
  let heartbeatTimer: NodeJS.Timeout | undefined

  /** Push one full-snapshot change frame to one subscriber. */
  const pushChange = (subscriber: Subscriber, tasks: readonly TaskRecord[]): void => {
    subscriber.res.write(`event: change\ndata: ${JSON.stringify({ tasks })}\n\n`)
  }

  const broadcast = (): void => {
    for (const subscriber of subscribers) pushChange(subscriber, service.listTasks())
  }
  const disposeChanged = ctx.on('task-board/changed', broadcast)

  const ensureHeartbeat = (): void => {
    if (heartbeatTimer !== undefined) return
    heartbeatTimer = setInterval(() => {
      for (const current of subscribers) current.res.write(': ping\n\n')
    }, HEARTBEAT_MS)
  }

  const stopHeartbeat = (): void => {
    if (heartbeatTimer === undefined) return
    clearInterval(heartbeatTimer)
    heartbeatTimer = undefined
  }

  /** Extract a required non-empty string field from a JSON object payload. */
  function strField(payload: Record<string, unknown>, key: string): string {
    const value = payload[key]
    if (typeof value !== 'string' || value === '') throw new BoardError('bad-request', `${key} is required`)
    return value
  }

  /** Narrow a body to an object (empty object for absent/malformed bodies). */
  function asRecord(payload: unknown): Record<string, unknown> {
    return typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
  }

  const postRoutes: Record<string, (payload: unknown) => unknown> = {
    [`${TASK_BOARD_API_PREFIX}/tasks/create`]: payload => service.createTask(payload),
    [`${TASK_BOARD_API_PREFIX}/tasks/update`]: (payload) => {
      const record = asRecord(payload)
      return service.updateTask(strField(record, 'id'), record.patch)
    },
    [`${TASK_BOARD_API_PREFIX}/tasks/delete`]: (payload) => {
      service.deleteTask(strField(asRecord(payload), 'id'))
      return { deleted: true }
    },
    [`${TASK_BOARD_API_PREFIX}/run`]: (payload) => {
      const id = strField(asRecord(payload), 'id')
      return service.startRun(id)
    },
    [`${TASK_BOARD_API_PREFIX}/migrate`]: payload => ({ imported: service.importLedger(payload) }),
  }

  /** GET /api/task-board/tasks — the whole ledger snapshot. */
  const listRoute = (req: IncomingMessage, res: ServerResponse): void => {
    if (!requireMethod(req, res, 'GET')) return
    if (!requireSameOrigin(req, res)) return
    json(res, 200, ok(service.listTasks()))
  }

  /**
   * POST /api/task-board/tasks/create|update|delete, /run, /migrate — JSON
   * content type enforced (blocks form-based CSRF simple requests), bounded
   * body, envelope errors.
   */
  const postRoute = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    const route = postRoutes[pathname]
    if (route === undefined) {
      json(res, 404, { ok: false, error: { code: 'not-found', message: `no such task-board endpoint: ${pathname}` } })
      return
    }
    // Cross-site simple requests cannot set application/json, so the media
    // check blocks form-based CSRF before the body is even read.
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      json(res, 415, { ok: false, error: { code: 'bad-request', message: 'content-type must be application/json' } })
      return
    }
    let payload: unknown
    try {
      payload = await readJsonBody(req)
    } catch {
      json(res, 400, { ok: false, error: { code: 'bad-request', message: 'request body must be valid JSON within the size limit' } })
      return
    }
    await servePost(res, () => route(payload))
  }

  /** GET /api/task-board/events — the SSE change stream. */
  const eventsRoute = (req: IncomingMessage, res: ServerResponse): void => {
    if (!requireMethod(req, res, 'GET')) return
    if (!requireSameOrigin(req, res)) return
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    res.write('retry: 2000\n\n')
    // A freshly opened stream receives the current snapshot immediately, so a
    // page that connects after the last mutation still loads without polling.
    const subscriber: Subscriber = { res }
    pushChange(subscriber, service.listTasks())
    subscribers.add(subscriber)
    ensureHeartbeat()
    req.on('close', () => {
      subscribers.delete(subscriber)
      if (subscribers.size === 0) stopHeartbeat()
    })
  }

  const handler = (req: IncomingMessage, res: ServerResponse): void | Promise<void> => {
    // Same-origin fence first: never let a cross-site page reach any operation,
    // regardless of method or content-type.
    if (!requireSameOrigin(req, res)) return
    if (req.method === 'GET') {
      const pathname = new URL(req.url ?? '/', 'http://x').pathname
      if (pathname === `${TASK_BOARD_API_PREFIX}/tasks`) {
        listRoute(req, res)
        return
      }
      json(res, 404, { ok: false, error: { code: 'not-found', message: `no such task-board endpoint: ${pathname}` } })
      return
    }
    if (req.method === 'POST') {
      return postRoute(req, res)
    }
    json(res, 405, { ok: false, error: 'method-not-allowed' })
  }

  const disposers = [
    ctx.webServer.register({ kind: 'prefix', path: TASK_BOARD_API_PREFIX, handler }),
    ctx.webServer.register({ kind: 'exact', path: `${TASK_BOARD_API_PREFIX}/events`, handler: eventsRoute }),
    disposeChanged,
  ]
  return () => {
    for (const dispose of disposers) dispose()
    stopHeartbeat()
    for (const subscriber of subscribers) subscriber.res.end()
    subscribers.clear()
  }
}
