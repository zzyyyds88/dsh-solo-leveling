/**
 * The v1 RPC whitelist and its in-process forwarders. Each whitelisted method
 * maps to one apiproxy face call (or one taskBoard service call); requests
 * mint a fresh correlation id, responses are read through `.result` and
 * re-wrapped into the mobile envelope by the route layer. The task-board
 * group is appended only when the optional service is composed.
 * @module dsh-mobile-remote/core/whitelist
 */

import { randomUUID } from 'node:crypto'
import type {
  RequestPayload, ResponseValue, RpcMethodMap, RpcRequest, RpcResponse,
} from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'

/** Mint one branded correlation id for an upstream request. */
function mintRpcId(): RpcId {
  return RpcId(randomUUID())
}

/**
 * The narrow session face the whitelist drives (method-syntax members keep
 * bivariance: the real ctx.apiProxy satisfies it while tests substitute
 * plain fakes).
 */
export interface SessionsFace {
  list(request: RpcRequest<RequestPayload<'session.list'>>): Promise<RpcResponse<ResponseValue<'session.list'>>>
  create(request: RpcRequest<RequestPayload<'session.create'>>): Promise<RpcResponse<ResponseValue<'session.create'>>>
  history(request: RpcRequest<RequestPayload<'session.history'>>): Promise<RpcResponse<ResponseValue<'session.history'>>>
  prompt(request: RpcRequest<RequestPayload<'session.prompt'>>): Promise<RpcResponse<ResponseValue<'session.prompt'>>>
  cancel(request: RpcRequest<RequestPayload<'session.cancel'>>): Promise<RpcResponse<ResponseValue<'session.cancel'>>>
  fork(request: RpcRequest<RequestPayload<'session.fork'>>): Promise<RpcResponse<ResponseValue<'session.fork'>>>
  rename(request: RpcRequest<RequestPayload<'session.rename'>>): Promise<RpcResponse<ResponseValue<'session.rename'>>>
  models(request: RpcRequest<RequestPayload<'session.models'>>): Promise<RpcResponse<ResponseValue<'session.models'>>>
  selectModel(request: RpcRequest<RequestPayload<'session.selectModel'>>): Promise<RpcResponse<ResponseValue<'session.selectModel'>>>
  attachment(request: RpcRequest<RequestPayload<'session.attachment'>>): Promise<RpcResponse<ResponseValue<'session.attachment'>>>
}

/** The narrow llm face (catalog reads only). */
export interface LlmFace {
  providers(request: RpcRequest<RequestPayload<'llm.providers'>>): Promise<RpcResponse<ResponseValue<'llm.providers'>>>
  models(request: RpcRequest<RequestPayload<'llm.models'>>): Promise<RpcResponse<ResponseValue<'llm.models'>>>
}

/** The narrow host face (describe only). */
export interface HostFace {
  describe(request: RpcRequest<RequestPayload<'host.describe'>>): Promise<RpcResponse<ResponseValue<'host.describe'>>>
}

/** The narrow workspace face (list only). */
export interface WorkspaceFace {
  list(request: RpcRequest<RequestPayload<'workspace.list'>>): Promise<RpcResponse<ResponseValue<'workspace.list'>>>
}

/** Every apiproxy group the whitelist forwards to. */
export interface ApiFaces {
  sessions: SessionsFace
  llm: LlmFace
  host: HostFace
  workspace: WorkspaceFace
}

/**
 * The task-board service slice the whitelist drives — the same surface the
 * board's own HTTP routes serve, read structurally so tests substitute fakes.
 */
export interface TaskBoardFace {
  listTasks(): readonly unknown[]
  createTask(body: unknown): unknown
  updateTask(id: string, patch: unknown): unknown
  deleteTask(id: string): void
  startRun(id: string): Promise<{ executionId: string; sessionId: string }>
}

/** One forwarder: business payload in, full upstream response out. */
export type RpcForwarder = (payload: unknown) => Promise<RpcResponse<unknown>>

/**
 * Build the base whitelist (every apiproxy-backed method).
 * @param api - the gateway faces to call in-process.
 * @returns the method → forwarder table.
 */
export function buildWhitelist(api: ApiFaces): Map<string, RpcForwarder> {
  const routes = new Map<string, RpcForwarder>()
  // Generic over the map key so each row's payload cast typechecks against the
  // face it forwards to (the same compiler lock the apiproxy carrier uses).
  const unary = <K extends keyof RpcMethodMap>(
    method: K,
    invoke: (request: RpcRequest<RequestPayload<K>>) => Promise<RpcResponse<ResponseValue<K>>>,
  ): void => {
    routes.set(method, async payload =>
      await invoke({ rpcId: mintRpcId(), payload: payload as RequestPayload<K> }))
  }
  unary('host.describe', request => api.host.describe(request))
  unary('session.list', request => api.sessions.list(request))
  unary('session.create', request => api.sessions.create(request))
  unary('session.history', request => api.sessions.history(request))
  unary('session.prompt', request => api.sessions.prompt(request))
  unary('session.cancel', request => api.sessions.cancel(request))
  unary('session.fork', request => api.sessions.fork(request))
  unary('session.rename', request => api.sessions.rename(request))
  unary('session.models', request => api.sessions.models(request))
  unary('session.selectModel', request => api.sessions.selectModel(request))
  unary('session.attachment', request => api.sessions.attachment(request))
  unary('llm.providers', request => api.llm.providers(request))
  unary('llm.models', request => api.llm.models(request))
  unary('workspace.list', request => api.workspace.list(request))
  return routes
}

/** Extract a required string field from an object payload. */
function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key]
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${key} is required and must be a non-empty string`)
  }
  return value
}

/**
 * Append the task-board group onto a whitelist. Thrown validation errors and
 * service rejections propagate as rejections; the route layer folds them into
 * envelope errors.
 * @param routes - the table to extend.
 * @param board - the task-board service face.
 */
export function extendWhitelistWithTaskBoard(routes: Map<string, RpcForwarder>, board: TaskBoardFace): void {
  const wrap = <T>(run: () => T | Promise<T>): Promise<RpcResponse<unknown>> =>
    Promise.resolve().then(run).then(value => ({ rpcId: mintRpcId(), result: { ok: true as const, value } }))
  routes.set('task-board.list', async () => wrap(() => board.listTasks()))
  routes.set('task-board.create', async payload => wrap(() => board.createTask(payload)))
  routes.set('task-board.update', async (payload) => {
    const record = requireRecord(payload)
    return wrap(() => board.updateTask(requireString(record, 'id'), record.patch))
  })
  routes.set('task-board.delete', async (payload) => {
    const record = requireRecord(payload)
    return wrap(() => {
      board.deleteTask(requireString(record, 'id'))
      return { deleted: true }
    })
  })
  routes.set('task-board.run', async (payload) => {
    const record = requireRecord(payload)
    return wrap(() => board.startRun(requireString(record, 'id')))
  })
}

/** Narrow an unknown payload to an object (undefined otherwise). */
function requireRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('payload must be an object')
  }
  return payload as Record<string, unknown>
}
