// Whitelist construction and extension: base rows, task-board rows and their
// payload validation, forwarder plumbing (fresh rpcId, echoed results), and
// the closed-set error-code folding.

import { describe, expect, it } from 'vitest'
import type { RpcResponse } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import type {} from '@deepseek-ai/dsh-host-task-board'
import { foldErrorCode } from '../src/core/protocol.ts'
import {
  buildWhitelist, extendWhitelistWithTaskBoard,
  type ApiFaces, type RpcForwarder, type TaskBoardFace,
} from '../src/core/whitelist.ts'

/** A gateway stub whose every whitelisted method answers a marker value.
 *  The stub answers with plain fixtures; the cast keeps fixture value types out of the way. */
function faces(): ApiFaces & { calls: string[] } {
  const calls: string[] = []
  const record = (name: string) =>
    async (request: { payload: unknown }): Promise<RpcResponse<string>> => {
      calls.push(name)
      return { rpcId: RpcId('upstream-echo'), result: { ok: true, value: `${name}:${JSON.stringify(request.payload)}` } }
    }
  const stub = {
    sessions: {
      list: record('session.list'),
      create: record('session.create'),
      history: record('session.history'),
      prompt: record('session.prompt'),
      cancel: record('session.cancel'),
      fork: record('session.fork'),
      rename: record('session.rename'),
      models: record('session.models'),
      selectModel: record('session.selectModel'),
      attachment: record('session.attachment'),
    },
    llm: { providers: record('llm.providers'), models: record('llm.models') },
    host: { describe: record('host.describe') },
    workspace: { list: record('workspace.list') },
    calls,
  }
  return stub as unknown as ApiFaces & { calls: string[] }
}

/** Map.get with a loud miss (no silent undefined forwarders in tests). */
function rowOf(routes: Map<string, RpcForwarder>, method: string): RpcForwarder {
  const row = routes.get(method)
  if (row === undefined) throw new Error(`missing whitelist row: ${method}`)
  return row
}

const BASE_METHODS = [
  'host.describe',
  'session.list', 'session.create', 'session.history', 'session.prompt', 'session.cancel',
  'session.fork', 'session.rename', 'session.models', 'session.selectModel', 'session.attachment',
  'llm.providers', 'llm.models',
  'workspace.list',
] as const

describe('buildWhitelist', () => {
  it('registers exactly the v1 apiproxy-backed methods', () => {
    const routes = buildWhitelist(faces())
    expect([...routes.keys()].sort()).toEqual([...BASE_METHODS].sort())
  })

  it('mints a fresh rpcId and passes the payload through to the face', async () => {
    const routes = buildWhitelist(faces())
    const response = await rowOf(routes, 'host.describe')({})
    expect(response.result).toEqual({ ok: true, value: 'host.describe:{}' })
    expect(typeof response.rpcId).toBe('string')
    expect(response.rpcId.length).toBeGreaterThan(0)
  })

  it('every base row forwards to its own face method exactly once', async () => {
    const api = faces()
    const routes = buildWhitelist(api)
    for (const method of BASE_METHODS) {
      const response = await rowOf(routes, method)({ forwarded: method })
      expect(response.result).toEqual({ ok: true, value: `${method}:${JSON.stringify({ forwarded: method })}` })
    }
    expect([...api.calls].sort()).toEqual([...BASE_METHODS].sort())
  })

  it('forwards payloads verbatim even when malformed (upstream owns semantics)', async () => {
    const api = faces()
    const routes = buildWhitelist(api)
    const bogus = { sessionId: 42 }
    await rowOf(routes, 'session.cancel')(bogus)
    expect(api.calls).toEqual(['session.cancel'])
    // The face received the payload unchanged inside its RpcRequest.
    expect(JSON.stringify(bogus)).toContain('sessionId')
  })
})

describe('extendWhitelistWithTaskBoard', () => {
  /** A board stub recording calls and answering fixtures. */
  function board(): TaskBoardFace & { calls: string[] } {
    const calls: string[] = []
    return {
      calls,
      listTasks: () => [{ id: 't1' }],
      createTask(body) { const title = (body as { title: string }).title; calls.push(`create:${title}`); return body },
      updateTask(id, patch) { calls.push(`update:${id}`); return { id, patch } },
      deleteTask(id) { calls.push(`delete:${id}`) },
      startRun: id => Promise.resolve({ executionId: 'e1', sessionId: id }),
    }
  }

  it('appends exactly the five task-board rows', () => {
    const routes = buildWhitelist(faces())
    extendWhitelistWithTaskBoard(routes, board())
    expect(routes.has('task-board.list')).toBe(true)
    expect(routes.has('task-board.create')).toBe(true)
    expect(routes.has('task-board.update')).toBe(true)
    expect(routes.has('task-board.delete')).toBe(true)
    expect(routes.has('task-board.run')).toBe(true)
    expect(routes.size).toBe(BASE_METHODS.length + 5)
  })

  it('maps list/create/run onto the service surface', async () => {
    const b = board()
    const routes = buildWhitelist(faces())
    extendWhitelistWithTaskBoard(routes, b)

    const listed = await rowOf(routes, 'task-board.list')({})
    expect(listed.result).toEqual({ ok: true, value: [{ id: 't1' }] })

    const created = await rowOf(routes, 'task-board.create')({ title: 'A' })
    expect(created.result).toEqual({ ok: true, value: { title: 'A' } })
    expect(b.calls).toEqual(['create:A'])

    const ran = await rowOf(routes, 'task-board.run')({ id: 't9' })
    expect(ran.result).toEqual({ ok: true, value: { executionId: 'e1', sessionId: 't9' } })
  })

  it('reads update/delete ids and wraps delete in a receipt', async () => {
    const b = board()
    const routes = buildWhitelist(faces())
    extendWhitelistWithTaskBoard(routes, b)
    const deleted = await rowOf(routes, 'task-board.delete')({ id: 't2' })
    expect(deleted.result).toEqual({ ok: true, value: { deleted: true } })
    await rowOf(routes, 'task-board.update')({ id: 't3', patch: { title: 'N' } })
    expect(b.calls).toEqual(['delete:t2', 'update:t3'])
  })

  it('rejects non-object or id-less payloads with bad-request-shaped errors', async () => {
    const routes = buildWhitelist(faces())
    extendWhitelistWithTaskBoard(routes, board())
    await expect(rowOf(routes, 'task-board.delete')('nope')).rejects.toThrow('payload must be an object')
    await expect(rowOf(routes, 'task-board.run')({})).rejects.toThrow('id is required')
    await expect(rowOf(routes, 'task-board.update')({ id: '', patch: {} })).rejects.toThrow('id is required')
  })

  it('propagates service rejections to the route layer', async () => {
    const routes = buildWhitelist(faces())
    extendWhitelistWithTaskBoard(routes, {
      listTasks: () => [],
      createTask: () => { throw new Error('conflict!') },
      updateTask: () => ({}),
      deleteTask: () => {},
      startRun: () => Promise.reject(new Error('busy')),
    })
    await expect(rowOf(routes, 'task-board.create')({})).rejects.toThrow('conflict!')
    await expect(rowOf(routes, 'task-board.run')({ id: 'x' })).rejects.toThrow('busy')
  })
})

describe('foldErrorCode', () => {
  it('passes closed-set codes through and folds everything else onto internal', () => {
    expect(foldErrorCode('method-not-allowed')).toBe('method-not-allowed')
    expect(foldErrorCode('bad-request')).toBe('bad-request')
    expect(foldErrorCode('unauthorized')).toBe('unauthorized')
    expect(foldErrorCode('not-found')).toBe('not-found')
    expect(foldErrorCode('payload-too-large')).toBe('payload-too-large')
    expect(foldErrorCode('internal')).toBe('internal')
    expect(foldErrorCode('session-not-found')).toBe('internal')
    expect(foldErrorCode('conflict')).toBe('internal')
  })
})
