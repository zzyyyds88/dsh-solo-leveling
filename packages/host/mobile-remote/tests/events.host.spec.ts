// /api/mobile/events downlink: hello meta first, mux/host frames wrapped in
// the mobile envelope with their correlation rpcId, downstream-only discipline
// (client message → 1008), task-board fan-out, stream/error degradation, and
// teardown aborting every source. Direct-start mode over a real node:http
// upgrade server (the websocket-downlink spec's harness).

import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import type { HostFrame, MuxFrame, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import { MOBILE_EVENTS_PATH } from '../src/core/protocol.ts'
import { MobileDownlinks, type EventStreams, type MobileFrameEnvelope } from '../src/host/events.ts'

type MuxSource = (signal: AbortSignal) => AsyncIterable<RpcRequest<MuxFrame>>
type HostSource = (signal: AbortSignal) => AsyncIterable<RpcRequest<HostFrame>>

const running: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(running.splice(0).map(close => close()))
})

function untilAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => { resolve() }, { once: true })
  })
}

async function * idle<F>(signal: AbortSignal): AsyncGenerator<RpcRequest<F>> {
  await untilAbort(signal)
}

/** Streams stub with programmable mux/host sources. */
function streams(mux: MuxSource, host: HostSource = idle): EventStreams {
  return {
    mux: (_request, signal) => mux(signal),
    host: (_request, signal) => host(signal),
  }
}

async function serve(downlinks: MobileDownlinks): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer()
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://dsh.internal').pathname
    if (pathname === MOBILE_EVENTS_PATH) downlinks.handle(request, socket, head)
    else socket.destroy()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return {
    origin: `ws://127.0.0.1:${String(port)}`,
    close: async () => {
      await downlinks.close()
      await new Promise<void>(resolve => server.close(() => { resolve() }))
    },
  }
}

interface Envelope extends MobileFrameEnvelope {
  frame: Record<string, unknown>
  rpcId?: string
}

/**
 * A frame reader that never loses a message: one persistent listener feeds an
 * internal queue from construction time, and `next()` consumes frames in
 * order (sequential bare `once()` reads can miss same-flush frames).
 */
function frameReader(socket: WebSocket): { next: () => Promise<Envelope> } {
  const queue: Envelope[] = []
  const waiters: ((envelope: Envelope) => void)[] = []
  socket.on('message', (data: Buffer) => {
    const envelope = JSON.parse(data.toString('utf8')) as Envelope
    const waiter = waiters.shift()
    if (waiter !== undefined) waiter(envelope)
    else queue.push(envelope)
  })
  return {
    next: () => {
      const buffered = queue.shift()
      if (buffered !== undefined) return Promise.resolve(buffered)
      return new Promise((resolve) => { waiters.push(resolve) })
    },
  }
}

describe('mobile events downlink', () => {
  it('sends mobile/hello first, then forwards both streams with correlation ids', async () => {
    let muxAborted = false
    const downlinks = new MobileDownlinks(streams(
      async function * (signal): AsyncGenerator<RpcRequest<MuxFrame>> {
        try {
          yield { rpcId: RpcId('mux-stable-1'), payload: {
            type: 'approval/requested', sessionId: 's1', approvalId: 'a1', toolName: 'bash',
          } as MuxFrame }
          yield { rpcId: RpcId('push-2'), payload: {
            type: 'session/subscribed', sessionId: 's1', lastSeq: 4,
          } as MuxFrame }
          await untilAbort(signal)
        } finally {
          muxAborted = true
        }
      },
      async function * (signal): AsyncGenerator<RpcRequest<HostFrame>> {
        try {
          yield { rpcId: RpcId('host-1'), payload: {
            type: 'host/session-status', sessionId: 's1', running: true,
          } as HostFrame }
          await untilAbort(signal)
        } finally {
          // host source cleanup
        }
      },
    ))
    const host = await serve(downlinks)
    running.push(host.close)

    const socket = new WebSocket(`${host.origin}${MOBILE_EVENTS_PATH}`)
    // One queued reader consumes every frame in order, nothing lost between reads.
    const frames = frameReader(socket)

    const hello = await frames.next()
    expect(hello.stream).toBe('meta')
    expect(hello.frame.type).toBe('mobile/hello')
    expect(hello.frame.protocolVersion).toBe(1)
    expect(typeof hello.frame.serverTime).toBe('number')

    // The two pumps flush independently, so consume the next three frames and
    // assert on the delivered multiset rather than cross-stream ordering.
    const delivered = [await frames.next(), await frames.next(), await frames.next()]
    expect(delivered.map(envelope => `${envelope.stream}:${String(envelope.frame.type)}`).sort()).toEqual([
      'host:host/session-status',
      'mux:approval/requested',
      'mux:session/subscribed',
    ])
    const approval = delivered.find(envelope => envelope.frame.type === 'approval/requested') as Envelope
    expect(approval.rpcId).toBe('mux-stable-1')
    expect(approval.frame).toEqual({
      type: 'approval/requested', sessionId: 's1', approvalId: 'a1', toolName: 'bash',
    })
    const push = delivered.find(envelope => envelope.frame.type === 'session/subscribed') as Envelope
    expect(push.rpcId).toBe('push-2')

    socket.close()
    await vi.waitFor(() => { expect(muxAborted).toBe(true) })
  })

  it('closes with 1008 "downlink only" when the client sends anything', async () => {
    let aborted = false
    const downlinks = new MobileDownlinks(streams(async function * (signal) {
      try {
        await untilAbort(signal)
      } finally {
        aborted = true
      }
    }))
    const host = await serve(downlinks)
    running.push(host.close)
    const socket = new WebSocket(`${host.origin}${MOBILE_EVENTS_PATH}`)
    await once(socket, 'open')
    // The hello meta frame may or may not have flushed first; either way the
    // violation closes the connection.
    const closed = once(socket, 'close')
    socket.send('upstream payload')
    const [code, reason] = await closed as [number, Buffer]
    expect(code).toBe(1008)
    expect(String(reason)).toBe('downlink only')
    await vi.waitFor(() => { expect(aborted).toBe(true) })
  })

  it('fans task-board snapshots out to live connections as taskboard frames', async () => {
    const downlinks = new MobileDownlinks(streams(idle, idle))
    const host = await serve(downlinks)
    running.push(host.close)
    const socket = new WebSocket(`${host.origin}${MOBILE_EVENTS_PATH}`)
    const frames = frameReader(socket)
    await once(socket, 'open')

    downlinks.broadcastTaskBoard([{ id: 't1' }])
    // The hello meta may precede the snapshot; skip it when present.
    const first = await frames.next()
    const snapshot = first.stream === 'meta' ? await frames.next() : first
    expect(snapshot.stream).toBe('taskboard')
    expect(snapshot.frame).toEqual({ type: 'task-board/changed', tasks: [{ id: 't1' }] })

    // After the client disconnects, broadcasts are silently dropped: a
    // terminated socket leaves the set asynchronously, so one broadcast races
    // it in a non-OPEN state (the swallow arm).
    socket.close()
    const live = [...downlinkSockets(downlinks)][0] as WebSocket
    live.terminate()
    downlinks.broadcastTaskBoard([{ id: 'late' }])
    await vi.waitFor(async () => {
      expect([...downlinkSockets(downlinks)]).toHaveLength(0)
    })
    expect(() =>{  downlinks.broadcastTaskBoard([]) }).not.toThrow()
  })

  it('aborts both sources when an accepted socket reports a transport error', async () => {
    let muxAborted = false
    let hostAborted = false
    const downlinks = new MobileDownlinks(streams(
      async function * (signal) {
        try { await untilAbort(signal) } finally { muxAborted = true }
      },
      async function * (signal) {
        try { await untilAbort(signal) } finally { hostAborted = true }
      },
    ))
    const host = await serve(downlinks)
    const socket = new WebSocket(`${host.origin}${MOBILE_EVENTS_PATH}`)
    await once(socket, 'open')
    const accepted = [...downlinkSockets(downlinks)][0] as WebSocket
    accepted.emit('error', new Error('transport failed'))
    await vi.waitFor(() => {
      expect(muxAborted).toBe(true)
      expect(hostAborted).toBe(true)
    })
    await host.close()
  })

  it('skips the failure frame when a source dies after the client already left', async () => {
    let sourceSignal: AbortSignal | undefined
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const downlinks = new MobileDownlinks(streams(async function * (signal) {
      sourceSignal = signal
      await gate
      // Resumed only after the abort: the send loop below is dead already,
      // so this throw must settle the pump without any failure-frame send.
      throw new Error('too late')
    }, idle))
    const host = await serve(downlinks)
    running.push(host.close)
    const socket = new WebSocket(`${host.origin}${MOBILE_EVENTS_PATH}`)
    await once(socket, 'open')
    const closed = once(socket, 'close')
    socket.close()
    await closed
    await vi.waitFor(() => { expect(sourceSignal?.aborted).toBe(true) })
    release()
    // The pump removed itself from the tracked set: catch and finally both ran.
    await vi.waitFor(() => { expect([...downlinkPumps(downlinks)]).toHaveLength(0) })
  })

  it('degrades a failing source to a stream/error frame and stops', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const downlinks = new MobileDownlinks(streams(async function * () {
      await gate
      throw new Error('mux exploded')
    }))
    const host = await serve(downlinks)
    running.push(host.close)
    const socket = new WebSocket(`${host.origin}${MOBILE_EVENTS_PATH}`)
    const frames = frameReader(socket)
    const closed = once(socket, 'close')
    release()
    // The hello meta may precede the failure frame; skip it when present.
    const first = await frames.next()
    const envelope = first.stream === 'meta' ? await frames.next() : first
    expect(envelope.stream).toBe('mux')
    expect(envelope.frame.type).toBe('stream/error')
    expect((envelope.frame.error as { message: string }).message).toContain('mux exploded')
    await closed
  })

  it('terminates sockets and waits for pumps on close()', async () => {
    const downlinks = new MobileDownlinks(streams(idle))
    const host = await serve(downlinks)
    const socket = new WebSocket(`${host.origin}${MOBILE_EVENTS_PATH}`)
    await once(socket, 'open')
    const closing = host.close()
    await expect(closing).resolves.toBeUndefined()
    await vi.waitFor(() => { expect(socket.readyState).toBe(WebSocket.CLOSED) })
  })

  it('rejects a second close() after teardown', async () => {
    const downlinks = new MobileDownlinks(streams(idle))
    await downlinks.close()
    await expect(downlinks.close()).rejects.toThrow('The server is not running')
  })

  it('contains socket send-callback failures and still tears the downlink down', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const downlinks = new MobileDownlinks(streams(async function * (): AsyncGenerator<RpcRequest<MuxFrame>> {
      await gate
      yield { rpcId: RpcId('send-failure'), payload: {
        type: 'session/subscribed', sessionId: 's', lastSeq: 0,
      } as MuxFrame }
    }))
    const host = await serve(downlinks)
    running.push(host.close)
    const socket = new WebSocket(`${host.origin}${MOBILE_EVENTS_PATH}`)
    await once(socket, 'open')
    const accepted = [...downlinkSockets(downlinks)][0] as WebSocket
    // Every send fails at its callback: the frame, then the failure frame.
    let sendCalls = 0
    const send = vi.spyOn(accepted, 'send').mockImplementation(((
      _data: unknown,
      optionsOrCallback?: unknown,
      callback?: (error?: Error) => void,
    ) => {
      sendCalls += 1
      const done = typeof optionsOrCallback === 'function'
        ? optionsOrCallback as (error?: Error) => void
        : callback
      done?.(new Error('socket send failed'))
    }) as WebSocket['send'])
    const closed = once(socket, 'close')
    release()
    await closed
    expect(send).toHaveBeenCalledTimes(2)
    send.mockRestore()
  })

  it('keeps pinging idle connections on the 15s heartbeat', async () => {
    vi.useFakeTimers()
    try {
      const downlinks = new MobileDownlinks(streams(idle))
      const host = await serve(downlinks)
      running.push(host.close)
      const socket = new WebSocket(`${host.origin}${MOBILE_EVENTS_PATH}`)
      await once(socket, 'open')
      const pinged = once(socket, 'ping')
      await vi.advanceTimersByTimeAsync(15_000)
      // The ping frame itself travels over real socket I/O; the suite's own
      // 10s timeout bounds a pathological hang.
      await pinged
    } finally {
      vi.useRealTimers()
    }
  })
})

/** Live sockets inside the downlink under test. */
function downlinkSockets(downlinks: MobileDownlinks): Iterable<WebSocket> {
  return (downlinks as unknown as { sockets: Set<WebSocket> }).sockets
}

/** Tracked pump promises inside the downlink under test. */
function downlinkPumps(downlinks: MobileDownlinks): Iterable<Promise<void>> {
  return (downlinks as unknown as { pumps: Set<Promise<void>> }).pumps
}
