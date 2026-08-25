// /api/task-board/* HTTP surface: same-origin fence, method/content-type/body
// bounds, the CRUD+run+migrate envelopes (including BoardError status
// mapping), and the SSE stream lifecycle (initial snapshot, broadcast,
// heartbeat, teardown).

import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { BoardError } from '../src/core/board-error.ts'
import { TASK_BOARD_API_PREFIX, registerTaskBoardRoutes } from '../src/host/routes.ts'

/** A request double with just what the handlers touch (headers/method/url/body). */
function makeReq(method: string, url: string, headers: Record<string, string> = {}, body?: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & { method: string; url: string; headers: Record<string, string> }
  req.method = method
  req.url = url
  req.headers = headers
  // The oversized-body path tears the request down; doubles accept it as a no-op.
  ;(req as { destroy: () => void }).destroy = () => {}
  if (body !== undefined) {
    setImmediate(() => {
      req.emit('data', Buffer.from(body, 'utf8'))
      req.emit('end')
    })
  } else {
    setImmediate(() => { req.emit('end') })
  }
  return req
}

/** A response double capturing writeHead/write/end calls. */
interface ResDouble {
  status: number | undefined
  headers: Record<string, unknown>
  written: string[]
  ended: boolean
}

function makeRes(): ServerResponse & ResDouble {
  const res = {
    status: undefined as number | undefined,
    headers: {} as Record<string, unknown>,
    written: [] as string[],
    ended: false,
  }
  const out = new EventEmitter() as ServerResponse & ResDouble
  Object.assign(out, res)
  out.writeHead = ((status: number, headers?: Record<string, unknown>) => {
    out.status = status
    out.headers = headers ?? {}
    return out
  }) as typeof out.writeHead
  out.write = ((chunk: string) => {
    out.written.push(chunk)
    return true
  }) as typeof out.write
  out.end = ((chunk?: string) => {
    if (chunk !== undefined) out.written.push(chunk)
    out.ended = true
    return out
  }) as typeof out.end
  return out
}

/** The recorded webserver registrations plus a mutable captured context. */
function makeServer() {
  const routes: Array<{ kind: string; path: string; handler: unknown }> = []
  let changedListener: (() => void) | undefined
  const ctx = {
    webServer: {
      register(route: { kind: string; path: string; handler: unknown }): () => void {
        routes.push(route)
        return () => {
          const at = routes.findIndex(entry => entry.path === route.path)
          if (at !== -1) routes.splice(at, 1)
        }
      },
    },
    on(_name: string, listener: () => void): () => void {
      changedListener = listener
      return () => { changedListener = undefined }
    },
  }
  return {
    ctx: ctx as unknown as Context,
    routes,
    emitChanged: (): void => { changedListener?.() },
  }
}

/** A stub of the service face the routes call, with programmable answers. */
function makeService() {
  return {
    tasks: [] as unknown[],
    createAnswer: undefined as unknown,
    updateError: undefined as BoardError | undefined,
    runAnswer: { executionId: 'e1', sessionId: 's1' } as { executionId: string; sessionId: string } | Error,
    imported: 0,
    deletedIds: [] as string[],
    listTasks() { return this.tasks },
    createTask(body: unknown) {
      if (this.createAnswer instanceof Error) throw this.createAnswer
      return this.createAnswer ?? body
    },
    updateTask() {
      if (this.updateError !== undefined) throw this.updateError
      return { id: 't1' }
    },
    deleteTask(id: string) {
      if (id === 'ghost') throw new BoardError('not-found', 'task "ghost" not found')
      this.deletedIds.push(id)
    },
    importLedger() { return this.imported },
    async startRun(): Promise<{ executionId: string; sessionId: string }> {
      if (this.runAnswer instanceof Error) throw this.runAnswer
      return this.runAnswer
    },
  }
}

interface RoutePair {
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  sse: (req: IncomingMessage, res: ServerResponse) => void
}

/** Register the routes against the fake server and unpack the two handlers. */
function mounted(service = makeService()): {
  handler: RoutePair['handler']
  sse: RoutePair['sse']
  server: ReturnType<typeof makeServer>
  service: ReturnType<typeof makeService>
  dispose: () => void
} {
  const server = makeServer()
  // The stub answers with plain fixtures; the structural face is satisfied by
  // construction, and the cast keeps unknown[] fixture types out of the way.
  const dispose = registerTaskBoardRoutes(server.ctx, service as unknown as Parameters<typeof registerTaskBoardRoutes>[1])
  const prefix = server.routes.find(route => route.kind === 'prefix') as { handler: RoutePair['handler'] }
  const exact = server.routes.find(route => route.path === `${TASK_BOARD_API_PREFIX}/events`) as { handler: RoutePair['sse'] }
  return { handler: prefix.handler, sse: exact.handler, server, service, dispose }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('same-origin fence', () => {
  it('rejects cross-site fetches before any operation', async () => {
    const app = mounted()
    const res = makeRes()
    await Promise.resolve(app.handler(makeReq('GET', '/api/task-board/tasks', { 'sec-fetch-site': 'cross-site' }), res))
    expect(res.status).toBe(403)
    expect(JSON.parse(res.written.at(-1) as string)).toEqual({ ok: false, error: 'cross-site-request-rejected' })
  })

  it('rejects an Origin that does not match Host', async () => {
    const app = mounted()
    const res = makeRes()
    await Promise.resolve(app.handler(makeReq('GET', '/api/task-board/tasks', { origin: 'https://evil.example', host: 'local:3080' }), res))
    expect(res.status).toBe(403)
  })

  it('admits requests without browser origin markers (curl/node)', async () => {
    const app = mounted()
    const res = makeRes()
    await Promise.resolve(app.handler(makeReq('GET', '/api/task-board/tasks'), res))
    expect(res.status).toBe(200)
  })
})

describe('JSON operations', () => {
  it('serves the ledger snapshot on GET tasks', async () => {
    const app = mounted()
    app.service.tasks = [{ id: 't1' }]
    const res = makeRes()
    await Promise.resolve(app.handler(makeReq('GET', '/api/task-board/tasks'), res))
    expect(res.status).toBe(200)
    expect(JSON.parse(res.written.at(-1) as string)).toEqual({ ok: true, value: [{ id: 't1' }] })
  })

  it('answers 404 with the error envelope for unknown endpoints', async () => {
    const app = mounted()
    const get = makeRes()
    await Promise.resolve(app.handler(makeReq('GET', '/api/task-board/whatever'), get))
    expect(get.status).toBe(404)

    const post = makeRes()
    await Promise.resolve(app.handler(makeReq('POST', '/api/task-board/nope', { 'content-type': 'application/json' }, '{}'), post))
    expect(post.status).toBe(404)
    expect((JSON.parse(post.written.at(-1) as string) as { error: { code: string } }).error.code).toBe('not-found')

    const put = makeRes()
    await Promise.resolve(app.handler(makeReq('PUT', '/api/task-board/tasks'), put))
    expect(put.status).toBe(405)
  })

  it('creates a task and enforces the JSON media type and body bounds', async () => {
    const app = mounted()
    const created = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/tasks/create', { 'content-type': 'application/json' }, '{"title":"A"}'),
      created,
    ))
    expect(created.status).toBe(200)
    expect(JSON.parse(created.written.at(-1) as string)).toEqual({ ok: true, value: { title: 'A' } })

    const form = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/tasks/create', { 'content-type': 'text/plain' }, 'title=A'),
      form,
    ))
    expect(form.status).toBe(415)

    const broken = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/tasks/create', { 'content-type': 'application/json' }, '{oops'),
      broken,
    ))
    expect(broken.status).toBe(400)

    const oversized = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/tasks/migrate'.replace('/migrate', '/create'),
        { 'content-type': 'application/json' }, 'x'.repeat((1 << 20) + 2)),
      oversized,
    ))
    expect(oversized.status).toBe(400)
    expect((JSON.parse(oversized.written.at(-1) as string) as { error: { code: string } }).error.code).toBe('bad-request')
  })

  it('maps service rejections onto their statuses', async () => {
    const app = mounted()
    app.service.updateError = new BoardError('not-found', 'task "x" not found')
    const missing = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/tasks/update', { 'content-type': 'application/json' }, '{"id":"x","patch":{}}'),
      missing,
    ))
    expect(missing.status).toBe(404)

    app.service.updateError = new BoardError('conflict', 'already running')
    const busy = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/tasks/update', { 'content-type': 'application/json' }, '{"id":"x","patch":{}}'),
      busy,
    ))
    expect(busy.status).toBe(409)

    app.service.updateError = new BoardError('bad-request', 'invalid cron')
    const bad = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/tasks/update', { 'content-type': 'application/json' }, '{"id":"x","patch":{}}'),
      bad,
    ))
    expect(bad.status).toBe(400)

    const ghost = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/tasks/delete', { 'content-type': 'application/json' }, '{"id":"ghost"}'),
      ghost,
    ))
    expect(ghost.status).toBe(404)

    const noId = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/tasks/delete', { 'content-type': 'application/json' }, '{}'),
      noId,
    ))
    expect(noId.status).toBe(400)
  })

  it('runs a task and reports migrate results', async () => {
    const app = mounted()
    const ran = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/run', { 'content-type': 'application/json' }, '{"id":"t1"}'),
      ran,
    ))
    expect(ran.status).toBe(200)
    expect(JSON.parse(ran.written.at(-1) as string)).toEqual({
      ok: true, value: { executionId: 'e1', sessionId: 's1' },
    })

    app.service.runAnswer = new BoardError('conflict', 'task "t1" is already running')
    const busy = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/run', { 'content-type': 'application/json' }, '{"id":"t1"}'),
      busy,
    ))
    expect(busy.status).toBe(409)

    const migrated = makeRes()
    await Promise.resolve(app.handler(
      makeReq('POST', '/api/task-board/migrate', { 'content-type': 'application/json' }, '{"tasks":[]}'),
      migrated,
    ))
    expect(migrated.status).toBe(200)
    expect(JSON.parse(migrated.written.at(-1) as string)).toEqual({ ok: true, value: { imported: 0 } })
  })
})

describe('SSE change stream', () => {
  it('opens with a retry line and an immediate snapshot, then broadcasts changes', async () => {
    vi.useFakeTimers()
    try {
      const app = mounted()
      app.service.tasks = [{ id: 'seed' }]
      const req = makeReq('GET', '/api/task-board/events')
      const res = makeRes()
      app.sse(req, res)
      expect(res.headers['content-type']).toContain('text/event-stream')
      expect(res.written[0]).toBe('retry: 2000\n\n')
      expect(res.written[1]).toContain('event: change')
      expect(res.written[1]).toContain('"tasks":[{"id":"seed"}]')

      app.service.tasks = [{ id: 'next' }]
      app.server.emitChanged()
      expect(res.written.at(-1)).toContain('"tasks":[{"id":"next"}]')

      // Heartbeat comments keep proxies alive while subscribers are connected.
      const pingCount = res.written.length
      await vi.advanceTimersByTimeAsync(15_000)
      expect(res.written.length).toBe(pingCount + 1)
      expect(res.written.at(-1)).toBe(': ping\n\n')

      // The last disconnect (the request closes) stops the heartbeat.
      req.emit('close')
      const afterClose = res.written.length
      await vi.advanceTimersByTimeAsync(60_000)
      expect(res.written.length).toBe(afterClose)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ends open streams and unregisters routes on dispose', async () => {
    const app = mounted()
    const res = makeRes()
    app.sse(makeReq('GET', '/api/task-board/events'), res)
    expect(app.server.routes).toHaveLength(2)
    app.dispose()
    expect(app.server.routes).toHaveLength(0)
    expect(res.ended).toBe(true)
  })
})
