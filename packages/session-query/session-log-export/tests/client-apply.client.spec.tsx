import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'

const SID = 'session-export-apply' as SessionId

afterEach(() => { vi.unstubAllGlobals() })

async function bench() {
  const ctx = new Context()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('session-log-download browser plugin', () => {
  it('provides one controller and cleans up on disposal (no Header button contribution)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    const b = await bench()
    expect(inject).toEqual(['locale'])
    expect(b.ctx.sessionLogDownload).toBeDefined()
    await b.fiber.dispose()
    expect(b.ctx.fiber.state).not.toBe('active')
  })

  it('downloads only for an export execution acknowledged by this browser client', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 500 }))
    vi.stubGlobal('fetch', fetcher)
    const first = await bench()
    const second = await bench()

    first.ctx.emit('command/executed', SID, 'plan', { kind: 'success' })
    expect(fetcher).not.toHaveBeenCalled()
    first.ctx.emit('command/executed', SID, 'export', { kind: 'error', text: 'bad path' })
    expect(fetcher).not.toHaveBeenCalled()
    first.ctx.emit('command/executed', SID, 'export', { kind: 'success' })
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledOnce()
      expect(first.ctx.sessionLogDownload.store.getSnapshot().bySession[SID]?.status).toBe('error')
    })
    expect(second.ctx.sessionLogDownload.store.getSnapshot().bySession[SID]).toBeUndefined()

    await first.fiber.dispose()
    await second.fiber.dispose()
  })
})
