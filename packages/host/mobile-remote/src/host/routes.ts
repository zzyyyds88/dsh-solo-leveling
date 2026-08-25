/**
 * /api/mobile/* route layer: the info/whitelisted-RPC/respond/fs-read JSON
 * endpoints and the Range-streaming raw endpoint, all speaking one envelope
 * (`{ok,value}` / `{ok:false,error:{code,message}}`). The access gate runs
 * ahead of every route (global pre-dispatch), so this layer owns no
 * authentication of its own. The `enabled` switch is read live per request:
 * disabled answers 404 on HTTP and refuses the WS upgrade.
 * @module dsh-mobile-remote/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { ApiProxy, ClientResponse, RpcReceipt } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { MobileEnvelope } from '../core/protocol.ts'
import { MobileError, foldErrorCode, mobileFail, mobileOk, statusForCode } from '../core/protocol.ts'
import type { RpcForwarder } from '../core/whitelist.ts'
import type { MobileFsService } from '../core/fs-service.ts'

/** Live remote state shared with the settings wiring and the upgrade route. */
export interface RemoteState {
  /** Total switch: false turns every /api/mobile/* answer into 404. */
  enabled: boolean
  /** POST body cap in bytes (payload-too-large past this). */
  maxRequestBytes: number
}

/** Route dependencies built by apply(). */
export interface MobileRouteOptions {
  state: RemoteState
  /** The whitelist table (task-board rows appended when the service composes). */
  routes: Map<string, RpcForwarder>
  fs: MobileFsService
  /** The gateway face answering /api/mobile/respond. */
  apiProxy: Pick<ApiProxy, 'respond'>
  /** Static identity values reported by /api/mobile/info. */
  info: { pluginVersion: string; hostVersion: string }
}

/** Extract a string field from an object payload. */
function strField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

/** Read one bounded JSON body; throws the closed-set errors. */
async function readJsonBody(req: IncomingMessage, cap: number): Promise<unknown> {
  const chunks: Buffer[] = await new Promise<Buffer[]>((resolve, reject) => {
    const collected: Buffer[] = []
    let total = 0
    req.on('error', reject)
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > cap) {
        // Tear the request down (a no-op on event-emitter doubles).
        ;(req as unknown as { destroy?: () => void }).destroy?.()
        reject(new MobileError('payload-too-large', 'request body exceeds the configured limit'))
        return
      }
      collected.push(chunk)
    })
    req.on('end', () => { resolve(collected) })
  })
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new MobileError('bad-request', 'malformed JSON body')
  }
}

/** Write one JSON envelope response. */
function json(res: ServerResponse, status: number, envelope: MobileEnvelope<unknown>): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(envelope))
}

/** Write a bare carrier-level status (outside the envelope contract). */
function bare(res: ServerResponse, status: number): void {
  res.writeHead(status)
  res.end()
}

/** The parsed request URL (node:http always sets url on server requests). */
function requestUrl(req: IncomingMessage): URL {
  /* v8 ignore next -- node:http always sets url on server requests; the field is optional only on client-side types. */
  return new URL(req.url ?? '/', 'http://x')
}

/** The request pathname. */
function requestPathname(req: IncomingMessage): string {
  return requestUrl(req).pathname
}

/**
 * Parse a single-range `bytes=start-end` header against the file size.
 * Multi-range is invalid; suffix ranges select the last N bytes.
 * @param header - the raw Range header (undefined when absent).
 * @param size - the file size ranges clamp against.
 * @returns clamped inclusive start/end, 'invalid' for malformed/unsatisfiable, or null when absent.
 */
export function parseRangeHeader(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (header === undefined) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  const first = match?.[1]
  const last = match?.[2]
  if (first === undefined || last === undefined || (first === '' && last === '')) return 'invalid'
  if (first === '') {
    const suffix = Number(last)
    if (suffix <= 0 || size === 0) return 'invalid'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(first)
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1)
  if (size === 0 || start > end || start >= size) return 'invalid'
  return { start, end }
}

/**
 * Build the /api/mobile/respond handler over the gateway's respond face:
 * wraps the app's answer into a ClientResponse echoing the server request's
 * rpcId and reports the transport receipt.
 * @param apiProxy - the gateway providing respond().
 * @returns an async responder mapping the request body to an envelope value.
 */
export function buildResponder(apiProxy: Pick<ApiProxy, 'respond'>): (body: unknown) => Promise<MobileEnvelope<unknown>> {
  const APPROVAL_OUTCOMES = new Set(['allowed-once', 'rejected'])
  /** Validate one question-answer batch against the wire schema's shape. */
  function validateAnswer(value: unknown): unknown {
    if (typeof value !== 'object' || value === null) {
      throw new MobileError('bad-request', 'question result expects {sessionId, answer}')
    }
    const raw = value as Record<string, unknown>
    const answer = raw.answer
    const answers = typeof answer === 'object' && answer !== null
      ? (answer as Record<string, unknown>).answers
      : undefined
    if (!Array.isArray(answers)) {
      throw new MobileError('bad-request', 'question result expects answer.answers as an array')
    }
    for (const item of answers) {
      if (typeof item !== 'object' || item === null) {
        throw new MobileError('bad-request', 'each answer item expects {id, selected[], custom?}')
      }
      const record = item as Record<string, unknown>
      const selected = Array.isArray(record.selected) ? record.selected : undefined
      if (typeof record.id !== 'string' || selected === undefined
        || !selected.every(option => typeof option === 'string')) {
        throw new MobileError('bad-request', 'each answer item expects {id, selected[], custom?}')
      }
      if (record.custom !== undefined && typeof record.custom !== 'string') {
        throw new MobileError('bad-request', 'answer item custom must be a string')
      }
    }
    return value
  }

  return async (body) => {
    if (typeof body !== 'object' || body === null) {
      throw new MobileError('bad-request', 'respond expects an object')
    }
    const record = body as Record<string, unknown>
    const rpcId = strField(record, 'rpcId')
    if (rpcId === undefined || rpcId === '') {
      throw new MobileError('bad-request', 'rpcId is required')
    }
    // Approval answers accept only the two client-givable outcomes;
    // cancelled/unavailable are host-side outcomes (see apiproxy approvals).
    let message: ClientResponse
    if (record.kind === 'approval') {
      const result = record.result
      if (typeof result !== 'object' || result === null) {
        throw new MobileError('bad-request', 'approval result expects {sessionId, approvalId, outcome}')
      }
      const payload = result as Record<string, unknown>
      if (typeof payload.sessionId !== 'string' || payload.sessionId === ''
        || typeof payload.approvalId !== 'string' || payload.approvalId === ''
        || typeof payload.outcome !== 'string' || !APPROVAL_OUTCOMES.has(payload.outcome)) {
        throw new MobileError('bad-request', 'approval result expects sessionId, approvalId, and outcome allowed-once|rejected')
      }
      message = { type: 'client-response', rpcId: RpcId(rpcId), result: { ok: true, value: result } }
    } else if (record.kind === 'question') {
      message = { type: 'client-response', rpcId: RpcId(rpcId), result: { ok: true, value: validateAnswer(record.result) } }
    } else {
      throw new MobileError('bad-request', "kind must be 'approval' or 'question'")
    }
    const receipt: RpcReceipt = await apiProxy.respond(message)
    if (receipt.accepted) return mobileOk({ accepted: true })
    throw new MobileError(
      receipt.reason === 'not-pending' ? 'not-found' : 'bad-request',
      receipt.reason === 'not-pending' ? 'no pending interaction for this rpcId' : 'the deployment rejected this response',
    )
  }
}

/**
 * Register the /api/mobile prefix route (the upgrade path is registered by
 * apply() beside it).
 * @param ctx - context carrying the webServer service.
 * @param options - live state, whitelist, fs service, and downlink.
 * @returns the route disposer.
 */
export function registerMobileRoutes(ctx: Context, options: MobileRouteOptions): () => void {
  const { state, routes, fs, apiProxy, info } = options
  const respond = buildResponder(apiProxy)

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!state.enabled) {
      json(res, 404, mobileFail(new MobileError('not-found', 'mobile remote is disabled')))
      return
    }
    const pathname = requestPathname(req)
    if (req.method === 'GET') {
      if (pathname === '/api/mobile/info') {
        json(res, 200, mobileOk({
          protocolVersion: 1,
          pluginVersion: info.pluginVersion,
          hostVersion: info.hostVersion,
          serverTime: Date.now(),
        }))
        return
      }
      if (pathname === '/api/mobile/fs/raw') {
        await serveRaw(req, res)
        return
      }
      bare(res, 405)
      return
    }
    if (req.method !== 'POST') {
      bare(res, 405)
      return
    }
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      json(res, statusForCode('bad-request'), mobileFail(new MobileError('bad-request', 'content-type must be application/json')))
      return
    }
    let body: unknown
    try {
      body = await readJsonBody(req, state.maxRequestBytes)
    } catch (error) {
      const mobile = error instanceof MobileError ? error : new MobileError('internal', String(error))
      json(res, statusForCode(mobile.code), mobileFail(mobile))
      return
    }
    try {
      switch (pathname) {
        case '/api/mobile/rpc': await handleRpc(body, res); return
        case '/api/mobile/respond': {
          json(res, 200, await respond(body))
          return
        }
        case '/api/mobile/fs/read': await handleFsRead(body, res); return
        default:
          json(res, 404, mobileFail(new MobileError('not-found', `no such endpoint: ${pathname}`)))
      }
    } catch (error) {
      const mobile = error instanceof MobileError ? error : new MobileError('internal', error instanceof Error ? error.message : String(error))
      json(res, statusForCode(mobile.code), mobileFail(mobile))
    }
  }

  /** Forward one whitelisted RPC and re-wrap its RpcResult into the envelope. */
  async function handleRpc(body: unknown, res: ServerResponse): Promise<void> {
    if (typeof body !== 'object' || body === null || typeof (body as Record<string, unknown>).method !== 'string') {
      throw new MobileError('bad-request', 'rpc expects {method, payload}')
    }
    const { method, payload } = body as { method: string; payload: unknown }
    const forwarder = routes.get(method)
    if (forwarder === undefined) {
      throw new MobileError('method-not-allowed', `method "${method}" is not whitelisted`)
    }
    const response = await forwarder(payload)
    if (!response.result.ok) {
      const code = foldErrorCode(response.result.error.code)
      throw new MobileError(code, response.result.error.message)
    }
    json(res, 200, mobileOk(response.result.value))
  }

  /** Serve one preview read. */
  async function handleFsRead(body: unknown, res: ServerResponse): Promise<void> {
    if (typeof body !== 'object' || body === null) {
      throw new MobileError('bad-request', 'fs/read expects an object')
    }
    const record = body as Record<string, unknown>
    const workspaceId = strField(record, 'workspaceId')
    const path = strField(record, 'path')
    if (workspaceId === undefined || path === undefined) {
      throw new MobileError('bad-request', 'workspaceId and path are required')
    }
    const read = await fs.read(workspaceId, path, record.asImage === true)
    json(res, 200, mobileOk(read))
  }

  /**
   * Stream one workspace file raw with single-range support (large files and
   * downloads never sit in host memory).
   */
  async function serveRaw(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = requestUrl(req)
    const ws = url.searchParams.get('ws')
    const path = url.searchParams.get('path')
    if (ws === null || ws === '' || path === null || path === '') {
      json(res, statusForCode('bad-request'), mobileFail(new MobileError('bad-request', 'ws and path query parameters are required')))
      return
    }
    let file: Awaited<ReturnType<typeof fs.raw>>
    try {
      file = await fs.raw(ws, path)
    } catch (error) {
      const mobile = error instanceof MobileError ? error : new MobileError('internal', String(error))
      json(res, statusForCode(mobile.code), mobileFail(mobile))
      return
    }
    const range = parseRangeHeader(req.headers.range, file.size)
    if (range === 'invalid') {
      res.writeHead(416, { 'content-range': `bytes */${String(file.size)}` })
      res.end()
      return
    }
    const headers: Record<string, string | number> = {
      'content-type': file.mime,
      'cache-control': 'no-cache',
      'accept-ranges': 'bytes',
      'x-content-type-options': 'nosniff',
    }
    if (range === null) {
      headers['content-length'] = file.size
      res.writeHead(200, headers)
    } else {
      headers['content-range'] = `bytes ${String(range.start)}-${String(range.end)}/${String(file.size)}`
      headers['content-length'] = range.end - range.start + 1
      res.writeHead(206, headers)
    }
    try {
      await pipeline(createReadStream(file.abs, range === null ? undefined : { start: range.start, end: range.end }), res)
    } catch {
      /* v8 ignore next 2 -- a client abort mid-stream (or file vanished after stat) leaves only response teardown. */
      res.destroy()
    }
  }

  return ctx.webServer.register({ kind: 'prefix', path: '/api/mobile', handler })
}
