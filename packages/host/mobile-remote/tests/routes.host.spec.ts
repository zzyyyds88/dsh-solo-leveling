// /api/mobile/* HTTP surface: disabled answering 404, info payload, RPC
// forwarding envelopes (success, upstream-error folding, method-not-allowed),
// respond wrapping and receipt mapping, body bounds/content-type, and the
// Range-streaming raw route (driven against a real temp workspace).

import { PassThrough } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ClientResponse, RpcReceipt, RpcResponse } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import { MobileError, statusForCode, type MobileErrorCode } from '../src/core/protocol.ts'
import { buildWhitelist, extendWhitelistWithTaskBoard, type ApiFaces, type TaskBoardFace } from '../src/core/whitelist.ts'

/** Bytes carrying the PNG magic (enough for sniffing; never decoded). */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
import { MobileFsService } from '../src/core/fs-service.ts'
import { parseRangeHeader, registerMobileRoutes, type RemoteState } from '../src/host/routes.ts'

/** Temp workspace roots to remove after each test. */
const roots: string[] = []

/** Drain the root list for afterEach cleanup. */
function spliceRoots(): string[] {
  return roots.splice(0)
}

/** A request double with just what the handlers touch. */
function makeReq(method: string, url: string, headers: Record<string, string> = {}, body?: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & { method: string; url: string; headers: Record<string, string> }
  req.method = method
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

interface ResDouble {
  status: number | undefined
  headers: Record<string, unknown> | undefined
  written: string[]
  ended: boolean
}

/** A response double capturing writeHead/write/end. */
function makeRes(): ServerResponse & ResDouble {
  const out = new EventEmitter() as ServerResponse & ResDouble
  out.status = undefined
  out.headers = undefined
  out.written = []
  out.ended = false
  out.writeHead = ((status: number, headers?: Record<string, unknown>) => {
    out.status = status
    out.headers = headers ?? {}
    return out
  }) as typeof out.writeHead
  out.write = ((chunk: string | Uint8Array) => {
    out.written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
    return true
  }) as typeof out.write
  out.end = ((chunk?: string | Uint8Array) => {
    if (chunk !== undefined) out.write(chunk)
    out.ended = true
    return out
  }) as typeof out.end
  return out
}

/** A streaming-capable response double for pipeline() (raw route). */
function makeStreamRes(): ServerResponse & ResDouble & { chunks: Buffer[]; done: Promise<void>; destroy(): void } {
  const stream = new PassThrough()
  const chunks: Buffer[] = []
  stream.on('data', (chunk: Buffer) => { chunks.push(chunk) })
  const done = new Promise<void>((resolve) => { stream.on('close', resolve) })
  // Delegate to the originals captured before overriding.
  const rawWrite = stream.write.bind(stream)
  const rawEnd = stream.end.bind(stream)
  const rawDestroy = stream.destroy.bind(stream)
  const out = stream as unknown as ServerResponse & ResDouble & { chunks: Buffer[]; done: Promise<void>; destroy(): void }
  out.chunks = chunks
  out.done = done
  out.status = undefined
  out.headers = undefined
  out.written = []
  out.ended = false
  out.writeHead = ((status: number, headers?: Record<string, unknown>) => {
    out.status = status
    out.headers = headers ?? {}
    return out
  }) as typeof out.writeHead
  out.write = ((chunk: string | Uint8Array) => {
    rawWrite(chunk)
    return true
  }) as typeof out.write
  out.end = ((chunk?: string | Uint8Array) => {
    if (chunk !== undefined) rawWrite(chunk)
    rawEnd()
    out.ended = true
    return out
  }) as typeof out.end
  out.destroy = () => { rawDestroy(); return out }
  return out
}

/** The gateway stub behind the whitelist: session.list answers ok,
 *  host.describe answers a business error, and every other method rejects with
 *  a plain Error (the route layer must fold it). The cast keeps fixture value
 *  types out of the way. */
function faces(): ApiFaces {
  const rejectWith = (name: string) => (): Promise<never> =>
    Promise.reject(new Error(`${name} should answer via result`))
  const stub = {
    sessions: {
      list: async (): Promise<RpcResponse<{ items: [] }>> => ({
        rpcId: RpcId('r'), result: { ok: true, value: { items: [] } },
      }),
      create: rejectWith('session.create'),
      history: rejectWith('session.history'),
      prompt: rejectWith('session.prompt'),
      cancel: rejectWith('session.cancel'),
      fork: rejectWith('session.fork'),
      rename: rejectWith('session.rename'),
      models: rejectWith('session.models'),
      selectModel: rejectWith('session.selectModel'),
      attachment: rejectWith('session.attachment'),
    },
    llm: { providers: rejectWith('llm.providers'), models: rejectWith('llm.models') },
    host: {
      describe: async (): Promise<RpcResponse<never>> => ({
        rpcId: RpcId('r'), result: { ok: false, error: { code: 'internal', message: 'boom', details: {} } },
      }),
    },
    workspace: { list: rejectWith('workspace.list') },
  }
  return stub
}

const BOARD: TaskBoardFace = {
  listTasks: () => [{ id: 't1' }],
  createTask: body => body,
  updateTask: id => ({ id }),
  deleteTask: () => {},
  startRun: id => Promise.resolve({ executionId: 'e1', sessionId: id }),
}

/** A board whose run path rejects with a non-Error value (hostile upstream). */
const THROWING_BOARD: TaskBoardFace = {
  ...BOARD,
  startRun: () => { throw 'plain-string-rejection' },
}

/** Mounted harness: captures the prefix route and serves handlers directly. */
async function mounted(options: {
  enabled?: boolean
  maxRequestBytes?: number
  board?: boolean
  throwingBoard?: boolean
  rootOf?: (workspaceId: string) => string | undefined
} = {}): Promise<{
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  root: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mobile-routes-'))
  roots.push(root)
  await writeFile(join(root, 'hello.txt'), 'hello raw', 'utf8')
  const state: RemoteState = {
    enabled: options.enabled ?? true,
    maxRequestBytes: options.maxRequestBytes ?? 1 << 20,
  }
  const routes = buildWhitelist(faces())
  if (options.throwingBoard === true) extendWhitelistWithTaskBoard(routes, THROWING_BOARD)
  else if (options.board ?? true) extendWhitelistWithTaskBoard(routes, BOARD)
  let handler!: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  const ctx = {
    webServer: {
      register(route: { handler: typeof handler }): () => void {
        handler = route.handler
        return () => {}
      },
    },
  }
  registerMobileRoutes(ctx as unknown as Context, {
    state,
    routes,
    fs: new MobileFsService(options.rootOf ?? (id => id === 'ws-1' ? root : undefined)),
    apiProxy: {
      respond: async (message: ClientResponse): Promise<RpcReceipt> => {
        if (message.rpcId.startsWith('live')) return { accepted: true }
        if (message.rpcId.startsWith('bad')) return { accepted: false, reason: 'bad-response' }
        return { accepted: false, reason: 'not-pending' }
      },
    },
    info: { pluginVersion: '9.9.9-test', hostVersion: '8.8.8-test' },
  })
  return { handler, root }
}

/** A POST request double with a JSON body. */
const post = (url: string, body: unknown): IncomingMessage =>
  makeReq('POST', url, { 'content-type': 'application/json' }, JSON.stringify(body))

// Temp roots accumulate from both the mounted harness and direct fixtures.
afterEach(async () => {
  await Promise.all(spliceRoots().map(root => rm(root, { recursive: true, force: true })))
})

describe('availability switch', () => {
  it('answers 404 with the envelope on every path while disabled', async () => {
    const app = await mounted({ enabled: false })
    const get = makeRes()
    await app.handler(makeReq('GET', '/api/mobile/info'), get)
    expect(get.status).toBe(404)
    expect(JSON.parse(get.written.at(-1) as string)).toMatchObject({ ok: false, error: { code: 'not-found' } })
    const rpc = makeRes()
    await app.handler(post('/api/mobile/rpc', { method: 'host.describe' }), rpc)
    expect(rpc.status).toBe(404)
  })

  it('serves info with versions and server time when enabled', async () => {
    const app = await mounted()
    const res = makeRes()
    await app.handler(makeReq('GET', '/api/mobile/info'), res)
    expect(res.status).toBe(200)
    const body = JSON.parse(res.written.at(-1) as string) as { ok: boolean; value: Record<string, unknown> }
    expect(body.ok).toBe(true)
    expect(body.value).toMatchObject({
      protocolVersion: 1,
      pluginVersion: '9.9.9-test',
      hostVersion: '8.8.8-test',
    })
    expect(typeof body.value.serverTime).toBe('number')
  })

  it('answers bare 405 for wrong methods on known paths', async () => {
    const app = await mounted()
    const get = makeRes()
    await app.handler(makeReq('GET', '/api/mobile/rpc'), get)
    expect(get.status).toBe(405)
    const del = makeRes()
    await app.handler(makeReq('DELETE', '/api/mobile/fs/raw'), del)
    expect(del.status).toBe(405)
  })

  it('answers 404 for unknown endpoints under the prefix', async () => {
    const app = await mounted()
    const res = makeRes()
    await app.handler(post('/api/mobile/nope', {}), res)
    expect(res.status).toBe(404)
    expect((JSON.parse(res.written.at(-1) as string) as { error: { code: string } }).error.code).toBe('not-found')
  })
})

describe('POST guards', () => {
  it('requires an application/json content-type (wrong type and missing)', async () => {
    const app = await mounted()
    const wrong = makeRes()
    await app.handler(makeReq('POST', '/api/mobile/rpc', { 'content-type': 'text/plain' }, '{}'), wrong)
    expect(wrong.status).toBe(400)
    expect((JSON.parse(wrong.written.at(-1) as string) as { error: { code: string } }).error.code).toBe('bad-request')
    const absent = makeRes()
    await app.handler(makeReq('POST', '/api/mobile/rpc', {}, '{}'), absent)
    expect(absent.status).toBe(400)
  })

  it('rejects malformed JSON bodies', async () => {
    const app = await mounted()
    const res = makeRes()
    await app.handler(makeReq('POST', '/api/mobile/rpc', { 'content-type': 'application/json' }, '{oops'), res)
    expect(res.status).toBe(400)
  })

  it('folds a request-stream failure onto the internal envelope', async () => {
    const app = await mounted()
    const req = new EventEmitter() as IncomingMessage & { method: string; url: string; headers: Record<string, string> }
    req.method = 'POST'
    req.url = '/api/mobile/rpc'
    req.headers = { 'content-type': 'application/json' }
    setImmediate(() => { req.emit('error', new Error('socket blew up')) })
    const res = makeRes()
    await app.handler(req, res)
    expect(res.status).toBe(500)
    expect((JSON.parse(res.written.at(-1) as string) as { error: { code: string } }).error.code).toBe('internal')
  })

  it('answers payload-too-large past the configured byte cap', async () => {
    const app = await mounted({ maxRequestBytes: 16 })
    const res = makeRes()
    await app.handler(
      makeReq('POST', '/api/mobile/rpc', { 'content-type': 'application/json' }, JSON.stringify({ method: 'x'.repeat(64) })),
      res,
    )
    expect(res.status).toBe(413)
    expect((JSON.parse(res.written.at(-1) as string) as { error: { code: string } }).error.code).toBe('payload-too-large')
  })

  it('accepts an empty body as an empty object', async () => {
    const app = await mounted()
    const res = makeRes()
    await app.handler(makeReq('POST', '/api/mobile/respond', { 'content-type': 'application/json' }, undefined), res)
    expect(res.status).toBe(400) // empty object → missing rpcId → bad-request
  })
})

describe('/api/mobile/rpc', () => {
  it('forwards whitelisted methods and unwraps the RpcResult value', async () => {
    const app = await mounted({ board: false })
    const res = makeRes()
    await app.handler(post('/api/mobile/rpc', { method: 'session.list', payload: { cursor: undefined } }), res)
    expect(res.status).toBe(200)
    expect(JSON.parse(res.written.at(-1) as string)).toEqual({ ok: true, value: { items: [] } })
  })

  it('folds upstream business errors onto the closed set, preserving the message', async () => {
    const app = await mounted()
    const res = makeRes()
    await app.handler(post('/api/mobile/rpc', { method: 'host.describe' }), res)
    expect(res.status).toBe(500)
    expect(JSON.parse(res.written.at(-1) as string)).toEqual({ ok: false, error: { code: 'internal', message: 'boom' } })
  })

  it('wraps a crashing forwarder (Error instance) as internal with its message', async () => {
    const app = await mounted()
    const res = makeRes()
    // The faces() stub's marker methods reject with plain Errors.
    await app.handler(post('/api/mobile/rpc', { method: 'session.create', payload: {} }), res)
    expect(res.status).toBe(500)
    expect((JSON.parse(res.written.at(-1) as string) as { error: { code: string; message: string } }).error)
      .toEqual({ code: 'internal', message: 'session.create should answer via result' })
  })

  it('wraps non-Error rejections via String()', async () => {
    const app = await mounted({ throwingBoard: true, board: false })
    const res = makeRes()
    await app.handler(post('/api/mobile/rpc', { method: 'task-board.run', payload: { id: 't1' } }), res)
    expect(res.status).toBe(500)
    expect((JSON.parse(res.written.at(-1) as string) as { error: { code: string; message: string } }).error)
      .toEqual({ code: 'internal', message: 'plain-string-rejection' })
  })

  it('answers method-not-allowed for methods outside the whitelist', async () => {
    const app = await mounted()
    for (const method of ['settings.update', 'credentials.set', 'llm.discoverModels', 'task-board.migrate']) {
      const res = makeRes()
      await app.handler(post('/api/mobile/rpc', { method }), res)
      expect(res.status).toBe(403)
      expect((JSON.parse(res.written.at(-1) as string) as { error: { code: string } }).error.code).toBe('method-not-allowed')
    }
  })

  it('answers bad-request when the method field is missing or not a string', async () => {
    const app = await mounted()
    for (const body of [{}, { method: 7 }, 'string', null]) {
      const res = makeRes()
      await app.handler(post('/api/mobile/rpc', body), res)
      expect(res.status).toBe(400)
    }
  })

  it('trims the task-board group when the service is absent', async () => {
    const app = await mounted({ board: false })
    const res = makeRes()
    await app.handler(post('/api/mobile/rpc', { method: 'task-board.list' }), res)
    expect(res.status).toBe(403)
  })

  it('serves task-board rows when composed', async () => {
    const app = await mounted()
    const res = makeRes()
    await app.handler(post('/api/mobile/rpc', { method: 'task-board.run', payload: { id: 't7' } }), res)
    expect(res.status).toBe(200)
    expect(JSON.parse(res.written.at(-1) as string)).toEqual({ ok: true, value: { executionId: 'e1', sessionId: 't7' } })
  })
})

describe('/api/mobile/respond', () => {
  it('wraps approval answers into a ClientResponse and reports acceptance', async () => {
    const seen: ClientResponse[] = []
    let handler!: (req: IncomingMessage, res: ServerResponse) => Promise<void>
    const ctx = { webServer: { register(route: { handler: typeof handler }): () => void { handler = route.handler; return () => {} } } }
    registerMobileRoutes(ctx as unknown as Context, {
      state: { enabled: true, maxRequestBytes: 1 << 20 },
      routes: buildWhitelist(faces()),
      fs: new MobileFsService(() => undefined),
      apiProxy: {
        respond: async (message) => {
          seen.push(message)
          return { accepted: true }
        },
      },
      info: { pluginVersion: 'p', hostVersion: 'h' },
    })
    const res = makeRes()
    await handler(
      post('/api/mobile/respond', {
        rpcId: 'srv-1',
        kind: 'approval',
        result: { sessionId: 's1', approvalId: 'a1', outcome: 'allowed-once' },
      }),
      res,
    )
    expect(res.status).toBe(200)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({
      type: 'client-response',
      rpcId: 'srv-1',
      result: { ok: true, value: { sessionId: 's1', approvalId: 'a1', outcome: 'allowed-once' } },
    })
    expect(JSON.parse(res.written.at(-1) as string)).toEqual({ ok: true, value: { accepted: true } })
  })

  it('maps not-pending receipts to not-found', async () => {
    const app = await mounted()
    const res = makeRes()
    await app.handler(
      post('/api/mobile/respond', {
        rpcId: 'ghost', kind: 'question',
        result: { sessionId: 's1', answer: { answers: [{ id: 'q1', selected: ['A'] }] } },
      }),
      res,
    )
    expect(res.status).toBe(404)
    expect((JSON.parse(res.written.at(-1) as string) as { error: { message: string } }).error.message)
      .toContain('no pending interaction')
  })

  it('maps bad-response receipts to bad-request', async () => {
    const app = await mounted()
    const res = makeRes()
    await app.handler(
      post('/api/mobile/respond', {
        rpcId: 'bad-1', kind: 'question',
        result: { sessionId: 's1', answer: { answers: [{ id: 'q1', selected: ['A'] }] } },
      }),
      res,
    )
    expect(res.status).toBe(400)
    expect((JSON.parse(res.written.at(-1) as string) as { error: { message: string } }).error.message)
      .toContain('rejected this response')
  })

  it('validates kind, rpcId, approval outcomes, and question answers', async () => {
    const app = await mounted()
    const cases: unknown[] = [
      {},
      { rpcId: '' },
      { rpcId: 'x', kind: 'other' },
      { rpcId: 'x', kind: 'approval', result: null },
      { rpcId: 'x', kind: 'approval', result: { sessionId: 's', approvalId: 'a', outcome: 'cancelled' } },
      { rpcId: 'x', kind: 'approval', result: { sessionId: '', approvalId: 'a', outcome: 'rejected' } },
      { rpcId: 'x', kind: 'question', result: 'nope' },
      { rpcId: 'x', kind: 'question', result: null },
      { rpcId: 'x', kind: 'question', result: { sessionId: 's', answer: {} } },
      { rpcId: 'x', kind: 'question', result: { sessionId: 's', answer: { answers: [{ selected: ['A'] }] } } },
      { rpcId: 'x', kind: 'question', result: { sessionId: 's', answer: { answers: [{ id: 'q', selected: [7] }] } } },
      { rpcId: 'x', kind: 'question', result: { sessionId: 's', answer: { answers: [{ id: 'q', selected: [], custom: 3 }] } } },
      'not-an-object',
    ]
    for (const body of cases) {
      const res = makeRes()
      await app.handler(post('/api/mobile/respond', body), res)
      expect(res.status).toBe(400)
    }
  })

  it('passes a valid multi-answer batch through to the gateway', async () => {
    const app = await mounted()
    const res = makeRes()
    await app.handler(
      post('/api/mobile/respond', {
        rpcId: 'q-1', kind: 'question',
        result: { sessionId: 's1', answer: { answers: [{ id: 'q1', selected: ['A', 'B'], custom: 'note' }] } },
      }),
      res,
    )
    // The harness responder answers not-pending for every non-'live' rpcId;
    // reaching that verdict proves validation passed.
    expect(res.status).toBe(404)
  })
})

describe('/api/mobile/fs/read', () => {
  it('serves a text preview and an image data URL', async () => {
    const app = await mounted()
    await writeFile(join(app.root, 'pic.png'), PNG_MAGIC)
    const text = makeRes()
    await app.handler(post('/api/mobile/fs/read', { workspaceId: 'ws-1', path: 'hello.txt' }), text)
    expect(text.status).toBe(200)
    const body = JSON.parse(text.written.at(-1) as string) as {
      ok: boolean
      value: { content: string; truncated: boolean; size: number; mtime: number }
    }
    expect(body.ok).toBe(true)
    expect(body.value.content).toBe('hello raw')
    expect(body.value.truncated).toBe(false)
    expect(body.value.size).toBe(Buffer.byteLength('hello raw', 'utf8'))
    expect(body.value.mtime).toBeGreaterThan(0)
    const image = makeRes()
    await app.handler(post('/api/mobile/fs/read', { workspaceId: 'ws-1', path: 'pic.png', asImage: true }), image)
    expect(image.status).toBe(200)
    expect((JSON.parse(image.written.at(-1) as string) as { value: { content: string } }).value.content)
      .toMatch(/^data:image\/png;base64,/)
  })

  it('answers bad-request for non-object bodies and missing fields', async () => {
    const app = await mounted()
    for (const body of ['str', null, {}, { workspaceId: 'ws-1' }, { path: 'a' }]) {
      const res = makeRes()
      await app.handler(post('/api/mobile/fs/read', body), res)
      expect(res.status).toBe(400)
    }
  })

  it('propagates fs errors (unknown workspace → not-found, escapes → bad-request)', async () => {
    const app = await mounted()
    const ghost = makeRes()
    await app.handler(post('/api/mobile/fs/read', { workspaceId: 'nope', path: 'x' }), ghost)
    expect(ghost.status).toBe(404)
    const escaper = makeRes()
    await app.handler(post('/api/mobile/fs/read', { workspaceId: 'ws-1', path: '../x' }), escaper)
    expect(escaper.status).toBe(400)
  })
})

describe('/api/mobile/fs/raw', () => {
  it('answers bad-request without query parameters', async () => {
    const app = await mounted()
    const res = makeRes()
    await app.handler(makeReq('GET', '/api/mobile/fs/raw'), res)
    expect(res.status).toBe(400)
  })

  it('streams whole files with content-length and derived mime', async () => {
    const app = await mounted()
    const res = makeStreamRes()
    await app.handler(makeReq('GET', '/api/mobile/fs/raw?ws=ws-1&path=hello.txt'), res)
    expect(res.status).toBe(200)
    expect(res.headers?.['content-length']).toBe(Buffer.byteLength('hello raw', 'utf8'))
    expect(String(res.headers?.['content-type'])).toContain('text/plain')
    await (res as unknown as { done: Promise<void> }).done
    expect(Buffer.concat(res.chunks).toString('utf8')).toBe('hello raw')
  })

  it('honors suffix and explicit ranges with 206 and rejects unsatisfiable ones', async () => {
    const app = await mounted()
    const mid = makeStreamRes()
    await app.handler(makeReq('GET', '/api/mobile/fs/raw?ws=ws-1&path=hello.txt', { range: 'bytes=2-5' }), mid)
    expect(mid.status).toBe(206)
    expect(mid.headers?.['content-range']).toBe(`bytes 2-5/${String(Buffer.byteLength('hello raw', 'utf8'))}`)
    await (mid as unknown as { done: Promise<void> }).done
    expect(Buffer.concat(mid.chunks).toString('utf8')).toBe('llo ')

    const tail = makeStreamRes()
    await app.handler(makeReq('GET', '/api/mobile/fs/raw?ws=ws-1&path=hello.txt', { range: 'bytes=-4' }), tail)
    expect(tail.status).toBe(206)

    const invalid = makeRes()
    await app.handler(makeReq('GET', '/api/mobile/fs/raw?ws=ws-1&path=hello.txt', { range: 'bytes=99-100' }), invalid)
    expect(invalid.status).toBe(416)

    const garbage = makeRes()
    await app.handler(makeReq('GET', '/api/mobile/fs/raw?ws=ws-1&path=hello.txt', { range: 'bytes=a-b' }), garbage)
    expect(garbage.status).toBe(416)
  })

  it('maps fs errors: unknown workspace → not-found, escapes → bad-request', async () => {
    const app = await mounted()
    const ghost = makeRes()
    await app.handler(makeReq('GET', '/api/mobile/fs/raw?ws=nope&path=x.txt'), ghost)
    expect(ghost.status).toBe(404)
    const escaper = makeRes()
    await app.handler(makeReq('GET', '/api/mobile/fs/raw?ws=ws-1&path=../x.txt'), escaper)
    expect(escaper.status).toBe(400)
    const missing = makeRes()
    await app.handler(makeReq('GET', '/api/mobile/fs/raw?ws=ws-1&path=gone.txt'), missing)
    expect(missing.status).toBe(404)
  })

  it('folds a crashing registry lookup onto the internal envelope', async () => {
    const app = await mounted({ rootOf: () => { throw new Error('registry exploded') } })
    const res = makeRes()
    await app.handler(makeReq('GET', '/api/mobile/fs/raw?ws=anything&path=x.txt'), res)
    expect(res.status).toBe(500)
    expect((JSON.parse(res.written.at(-1) as string) as { error: { message: string } }).error.message)
      .toContain('registry exploded')
  })
})

describe('parseRangeHeader', () => {
  const SIZE = 10
  it('returns null without a header and parses plain/suffix ranges', () => {
    expect(parseRangeHeader(undefined, SIZE)).toBeNull()
    expect(parseRangeHeader('bytes=0-3', SIZE)).toEqual({ start: 0, end: 3 })
    expect(parseRangeHeader('bytes=6-', SIZE)).toEqual({ start: 6, end: 9 })
    expect(parseRangeHeader('bytes=-3', SIZE)).toEqual({ start: 7, end: 9 })
    expect(parseRangeHeader(' bytes=1-2 ', SIZE)).toEqual({ start: 1, end: 2 })
    expect(parseRangeHeader('bytes=1-99', SIZE)).toEqual({ start: 1, end: 9 })
  })

  it('marks malformed and unsatisfiable requests invalid', () => {
    expect(parseRangeHeader('bytes=', SIZE)).toBe('invalid')
    expect(parseRangeHeader('items=1-2', SIZE)).toBe('invalid')
    expect(parseRangeHeader('bytes=-', SIZE)).toBe('invalid')
    expect(parseRangeHeader('bytes=-0', SIZE)).toBe('invalid')
    expect(parseRangeHeader('bytes=5-2', SIZE)).toBe('invalid')
    expect(parseRangeHeader('bytes=10-11', SIZE)).toBe('invalid')
    expect(parseRangeHeader('bytes=0-3', 0)).toBe('invalid')
    expect(parseRangeHeader('bytes=-3', 0)).toBe('invalid')
  })
})

describe('error envelope mapping', () => {
  it('maps every closed-set code onto its HTTP status', () => {
    const statuses: Record<MobileErrorCode, number> = {
      'method-not-allowed': 403,
      'bad-request': 400,
      unauthorized: 401,
      'not-found': 404,
      'payload-too-large': 413,
      internal: 500,
    }
    for (const [code, status] of Object.entries(statuses)) {
      const error = new MobileError(code as MobileErrorCode, 'm')
      expect(error.code).toBe(code)
      expect(error.message).toBe('m')
      expect(statusForCode(code as MobileErrorCode)).toBe(status)
    }
  })
})
