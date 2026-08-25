/**
 * Host-side WebSocket carrier for the mobile events downlink. One App
 * connection consumes two independent apiproxy iterators (mux + host) plus a
 * task-board fan-out; upstream traffic stays on HTTP POST, so any client
 * message is a protocol violation answered with close(1008). Frames ride the
 * mobile envelope `{"stream":"mux"|"host"|"taskboard"|"meta","frame":{...}}`;
 * mux/host envelopes additionally carry the iterator's rpcId so answerable
 * frames (approval/question requested) can be responded to by rpcId.
 * @module dsh-mobile-remote/host/events
 */

import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import WebSocket, { WebSocketServer } from 'ws'
import type { HostFrame, MuxFrame, RpcError, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import { PING_INTERVAL_MS, PROTOCOL_VERSION } from '../core/protocol.ts'

/** Stream label of one envelope. */
export type MobileStream = 'mux' | 'host' | 'taskboard' | 'meta'

/** The wire envelope pushed to the app. */
export interface MobileFrameEnvelope {
  stream: MobileStream
  frame: unknown
  /** Correlation id for answerable/push frames of the mux and host streams. */
  rpcId?: string
}

/** The event-stream openers the downlink consumes (the apiproxy events face). */
export interface EventStreams {
  mux(request: RpcRequest<{ since?: Record<string, number> }>, signal: AbortSignal): AsyncIterable<RpcRequest<MuxFrame>>
  host(request: RpcRequest<{}>, signal: AbortSignal): AsyncIterable<RpcRequest<HostFrame>>
}

/**
 * Owns upgrade negotiation and frame pumping for `/api/mobile/events`
 * (mirrors the connection plugin's WebSocketDownlinks).
 */
export class MobileDownlinks {
  private readonly server = new WebSocketServer({ noServer: true })
  private readonly pumps = new Set<Promise<void>>()
  private readonly sockets = new Set<WebSocket>()

  /** @param streams - the event streams to consume per connection. */
  constructor(private readonly streams: EventStreams) {}

  /**
   * Push one full task-board snapshot to every live connection (the cordis
   * `task-board/changed` bridge in apply() calls this).
   * @param tasks - the new snapshot.
   */
  broadcastTaskBoard(tasks: readonly unknown[]): void {
    for (const socket of this.sockets) {
      void this.send(socket, {
        stream: 'taskboard',
        frame: { type: 'task-board/changed', tasks },
      }).catch(() => {})
    }
  }

  /**
   * Upgrade one socket and start pumping both streams until either side closes.
   * @param req - HTTP upgrade request.
   * @param socket - raw socket transferred by the HTTP server.
   * @param head - bytes already read after the upgrade headers.
   */
  handle(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.server.handleUpgrade(req, socket, head, (websocket) => {
      const abort = new AbortController()
      websocket.once('close', () => { abort.abort() })
      websocket.once('error', () => { abort.abort() })
      // Upstream traffic stays on HTTP POST: any client message is a violation.
      websocket.once('message', () => {
        websocket.close(1008, 'downlink only')
      })
      this.sockets.add(websocket)
      websocket.once('close', () => { this.sockets.delete(websocket) })
      const ping = setInterval(() => { websocket.ping() }, PING_INTERVAL_MS)
      websocket.once('close', () => { clearInterval(ping) })
      /* v8 ignore start -- handleUpgrade only runs once the socket is OPEN, so the hello send cannot fail in composition. */
      void this.send(websocket, {
        stream: 'meta',
        frame: { type: 'mobile/hello', protocolVersion: PROTOCOL_VERSION, serverTime: Date.now() },
      }).catch(() => {})
      /* v8 ignore stop */
      this.spawn(websocket, 'mux', this.streams.mux({ rpcId: RpcId(randomUUID()), payload: {} }, abort.signal), abort)
      this.spawn(websocket, 'host', this.streams.host({ rpcId: RpcId(randomUUID()), payload: {} }, abort.signal), abort)
    })
  }

  /**
   * Terminate owned sockets and await frame pumps (plugin teardown).
   * @returns resolves after every socket and source iterator stopped.
   */
  async close(): Promise<void> {
    for (const socket of this.sockets) socket.terminate()
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      })
    })
    await Promise.all(this.pumps)
    this.sockets.clear()
  }

  /** Spawn one tracked pump. */
  private spawn(
    socket: WebSocket,
    stream: Exclude<MobileStream, 'taskboard' | 'meta'>,
    frames: AsyncIterable<RpcRequest<MuxFrame | HostFrame>>,
    abort: AbortController,
  ): void {
    const pump = this.pump(socket, stream, frames, abort)
    this.pumps.add(pump)
    void pump.then(() => { this.pumps.delete(pump) })
  }

  /** Forward one stream's frames; failures degrade to a stream/error frame. */
  private async pump(
    socket: WebSocket,
    stream: 'mux' | 'host',
    frames: AsyncIterable<RpcRequest<MuxFrame | HostFrame>>,
    abort: AbortController,
  ): Promise<void> {
    try {
      for await (const frame of frames) {
        await this.send(socket, { stream, frame: frame.payload, rpcId: String(frame.rpcId) })
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        const failure: RpcError = { code: 'internal', message: String(error), details: {} }
        try {
          await this.send(socket, { stream, frame: { type: 'stream/error', error: failure }, rpcId: randomUUID() })
        } catch {
          // Socket loss won the race; no downstream remains to receive it.
        }
      }
    } finally {
      abort.abort()
      if (socket.readyState === WebSocket.OPEN) socket.close()
    }
  }

  /** Send one envelope, rejecting when the socket closed before delivery. */
  private send(socket: WebSocket, envelope: MobileFrameEnvelope): Promise<void> {
    return new Promise((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) {
        reject(new Error('websocket closed before frame delivery'))
        return
      }
      socket.send(JSON.stringify(envelope), (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
}
