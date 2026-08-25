// Plugin wiring: apply() against a real cordis Context with stub services —
// route + upgrade registrations, the settings-driven live state (disabled →
// 404 everywhere and WS upgrade refused, body cap applied), the optional
// task-board whitelist extension, and teardown disposing cleanly.

import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as mobileRemote from '../src/index.ts'

function assertDefined<T>(value: T | undefined): asserts value is T {
  if (value === undefined) throw new Error('expected a value')
}

/** Temp workspace roots removed after each test. */
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(async (ctx) => {
    await ctx.fiber.dispose().catch(() => {})
  }))
})

/** A request double emitting its body on demand. */
function makeReq(url: string, headers: Record<string, string> = {}, body?: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & { method: string; url: string; headers: Record<string, string> }
  req.method = body === undefined ? 'GET' : 'POST'
  req.url = url
  req.headers = headers
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

function makeRes(): ServerResponse & { status?: number; written: string[] } {
  const out = new EventEmitter() as ServerResponse & { status?: number; written: string[] }
  out.written = []
  out.writeHead = ((status: number) => {
    out.status = status
    return out
  })
  out.end = ((chunk?: string | Uint8Array) => {
    if (chunk !== undefined) out.written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
    return out
  }) as typeof out.end
  return out
}

interface SocketDouble {
  writes: string[]
  ended: boolean
}

/** A socket double capturing raw writes for the refused-upgrade branch. */
function makeSocket(): Duplex & SocketDouble {
  const out = new EventEmitter() as unknown as Duplex & SocketDouble
  out.writes = []
  out.ended = false
  ;(out as unknown as { end: (chunk?: string) => void }).end = (chunk?: string) => {
    if (chunk !== undefined) out.writes.push(chunk)
    out.ended = true
  }
  ;(out as unknown as { destroy: () => void }).destroy = () => {}
  return out
}

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>
type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void

/** Minimal webServer double recording routes and upgrades. */
function fakeWebServer() {
  const routes = new Map<string, RouteHandler>()
  const upgrades = new Map<string, UpgradeHandler>()
  return {
    routes,
    upgrades,
    register(route: { path: string; handler: RouteHandler }): () => void {
      routes.set(route.path, route.handler)
      return () => { routes.delete(route.path) }
    },
    registerUpgrade(route: { path: string; handler: UpgradeHandler }): () => void {
      upgrades.set(route.path, route.handler)
      return () => { upgrades.delete(route.path) }
    },
  }
}

/** Idle apiproxy event sources that stop when their signal aborts. */
async function * untilAbort(signal: AbortSignal): AsyncGenerator<never> {
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => { resolve() }, { once: true })
  })
}

function fakeApiProxy() {
  return {
    respond: async (): Promise<{ accepted: true }> => ({ accepted: true }),
    events: {
      mux: (_request: unknown, signal: AbortSignal) => untilAbort(signal),
      host: (_request: unknown, signal: AbortSignal) => untilAbort(signal),
    },
  }
}

interface HarnessOptions {
  /** Fixed settings section the fake provider serves (undefined = no provider). */
  settings?: { enabled: boolean; maxRequestBytes: number }
  /** Whether the optional task-board service composes. */
  board?: boolean
  /** A registered workspace to expose through the registry (id 'ws-1'). */
  workspaceRoot?: string
}

/** Build a real Context, provide stub services, and activate the plugin. */
async function harness(options: HarnessOptions = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  const server = fakeWebServer()
  ctx.provide('webServer', server as never)
  ctx.provide('apiProxy', fakeApiProxy() as never)
  ctx.provide('workspaceRegistry', {
    list: () => options.workspaceRoot === undefined
      ? []
      : [{ id: 'ws-1', path: options.workspaceRoot }],
  } as never)
  if (options.settings !== undefined) {
    const section = options.settings
    ctx.provide('settings', {
      register: () => ({
        get: () => section,
        watch: () => () => {},
      }),
    } as never)
  }
  if (options.board ?? false) {
    ctx.provide('taskBoard', {
      listTasks: () => [{ id: 'tb-1' }],
      createTask: (body: unknown) => body,
      updateTask: (id: string) => ({ id }),
      deleteTask: () => {},
      startRun: async (id: string) => ({ executionId: 'e1', sessionId: id }),
    } as never)
  }
  await ctx.plugin({ inject: mobileRemote.inject, apply: mobileRemote.apply })
  const handler = server.routes.get('/api/mobile')
  if (handler === undefined) throw new Error('mobile routes were not registered')
  return {
    ctx,
    server,
    handler,
    upgrade: server.upgrades.get('/api/mobile/events'),
  }
}

describe('mobile-remote apply()', () => {
  it('registers the /api/mobile prefix route and the events upgrade', async () => {
    const app = await harness()
    expect(app.server.routes.has('/api/mobile')).toBe(true)
    expect(app.upgrade).toBeDefined()
  })

  it('serves info through the composed wiring while enabled by default', async () => {
    const app = await harness()
    const res = makeRes()
    await app.handler(makeReq('/api/mobile/info'), res)
    expect(res.status).toBe(200)
    const body = JSON.parse(res.written.at(-1) as string) as { ok: boolean; value: Record<string, unknown> }
    expect(body.ok).toBe(true)
    expect(body.value.protocolVersion).toBe(1)
    expect(typeof body.value.pluginVersion).toBe('string')
  })

  it('keeps task-board methods out of the whitelist while the service is absent', async () => {
    const app = await harness()
    const res = makeRes()
    await app.handler(
      makeReq('/api/mobile/rpc', { 'content-type': 'application/json' }, JSON.stringify({ method: 'task-board.list' })),
      res,
    )
    expect(res.status).toBe(403)
    expect((JSON.parse(res.written.at(-1) as string) as { error: { code: string } }).error.code).toBe('method-not-allowed')
  })

  it('extends the whitelist when the task-board service composes', async () => {
    const app = await harness({ board: true })
    const res = makeRes()
    await app.handler(
      makeReq('/api/mobile/rpc', { 'content-type': 'application/json' }, JSON.stringify({ method: 'task-board.list' })),
      res,
    )
    expect(res.status).toBe(200)
    expect(JSON.parse(res.written.at(-1) as string)).toEqual({ ok: true, value: [{ id: 'tb-1' }] })
  })

  it('answers 404 on HTTP and refuses the upgrade once settings disable the remote', async () => {
    const app = await harness({ settings: { enabled: false, maxRequestBytes: 1 << 20 } })
    const get = makeRes()
    await app.handler(makeReq('/api/mobile/info'), get)
    expect(get.status).toBe(404)

    // WS 拒升级：raw 404 response, no protocol negotiation.
    const socket = makeSocket()
    app.upgrade?.(makeReq('/api/mobile/events'), socket, Buffer.alloc(0))
    expect(socket.ended).toBe(true)
    expect(socket.writes.join('')).toContain('404 Not Found')
    expect(socket.writes.join('')).toContain('not-found')
  })

  it('applies a lowered request-body cap immediately after a save', async () => {
    const app = await harness({ settings: { enabled: true, maxRequestBytes: 8 } })
    const res = makeRes()
    await app.handler(
      makeReq('/api/mobile/rpc', { 'content-type': 'application/json' }, JSON.stringify({ method: 'session.list' })),
      res,
    )
    expect(res.status).toBe(413)
    expect((JSON.parse(res.written.at(-1) as string) as { error: { code: string } }).error.code).toBe('payload-too-large')
  })

  it('fans task-board change events out without live sockets and tears down cleanly', async () => {
    const app = await harness({ board: true })
    expect(() => { app.ctx.emit('task-board/changed', { tasks: [] }) }).not.toThrow()
    expect(app.server.routes.size).toBe(1)
    await app.ctx.fiber.dispose()
    expect(app.server.routes.size).toBe(0)
    expect(app.server.upgrades.size).toBe(0)
  })

  it('resolves workspace roots through the registry for fs reads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-mobile-apply-'))
    roots.push(root)
    await writeFile(join(root, 'card.txt'), 'apply fs', 'utf8')
    const app = await harness({ workspaceRoot: root })
    const read = makeRes()
    await app.handler(
      makeReq('/api/mobile/fs/read', { 'content-type': 'application/json' },
        JSON.stringify({ workspaceId: 'ws-1', path: 'card.txt' })),
      read,
    )
    expect(read.status).toBe(200)
    expect((JSON.parse(read.written.at(-1) as string) as { value: { content: string } }).value.content)
      .toBe('apply fs')

    // An id outside the registry answers not-found (the fallthrough arm).
    const ghost = makeRes()
    await app.handler(
      makeReq('/api/mobile/fs/read', { 'content-type': 'application/json' },
        JSON.stringify({ workspaceId: 'ghost', path: 'card.txt' })),
      ghost,
    )
    expect(ghost.status).toBe(404)
  })

  it('negotiates a live WebSocket upgrade through the composed wiring while enabled', async () => {
    const app = await harness({ board: true })
    assertDefined(app.upgrade)
    const server = createServer()
    server.on('upgrade', (req, socket, head) => { app.upgrade?.(req, socket, head) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port

    // One queued reader consumes every pushed frame in order.
    interface Frame { stream?: string; frame?: { type?: string } }
    const pending: Frame[] = []
    const waiters: Array<(frame: Frame) => void> = []
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/api/mobile/events`)
    socket.on('message', (data: Buffer) => {
      const frame = JSON.parse(data.toString('utf8')) as Frame
      const waiter = waiters.shift()
      if (waiter !== undefined) waiter(frame)
      else pending.push(frame)
    })
    const nextFrame = (): Promise<Frame> => {
      const buffered = pending.shift()
      if (buffered !== undefined) return Promise.resolve(buffered)
      return new Promise((resolve, reject) => {
        waiters.push(resolve)
        setTimeout(() => { reject(new Error('no frame within 2s')) }, 2000)
      })
    }

    try {
      const hello = await nextFrame()
      expect(hello.stream).toBe('meta')
      expect(hello.frame?.type).toBe('mobile/hello')
      // The cordis task-board fan-out reaches the live connection.
      ;(app.ctx.emit as (name: string, payload: unknown) => void)('task-board/changed', { tasks: [{ id: 'live' }] })
      const snapshot = await nextFrame()
      expect(snapshot.stream).toBe('taskboard')
      expect(snapshot.frame?.type).toBe('task-board/changed')
    } finally {
      socket.terminate()
      await new Promise<void>((resolve) => { setTimeout(resolve, 20); server.close(() => { resolve() }) })
    }
  })
})
