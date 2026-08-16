/**
 * Retry semantics of the vision call: transient failures (HTTP 429 / 5xx,
 * network errors, per-attempt timeouts) are retried up to `maxRetries`;
 * client errors (4xx except 429) and caller aborts are final.
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { ServerResponse } from 'node:http'
import * as tool from '../src/index.ts'
import { chatReply, jsonReply, PNG_BYTES, startMockServer, type RecordedRequest } from './mock-server.ts'

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(close => close()))
})

function loadedImage(): tool.LoadedImage {
  return { bytes: PNG_BYTES, mimeType: 'image/png' }
}

function spec(maxRetries: number): tool.ResolvedConfig {
  return {
    baseURL: 'http://127.0.0.1:0',
    model: 'vision-1',
    apiKey: 'sk',
    apiKeyEnv: undefined,
    defaultPrompt: tool.DEFAULT_PROMPT,
    maxBytes: tool.DEFAULT_MAX_BYTES,
    maxOutputTokens: tool.DEFAULT_MAX_OUTPUT_TOKENS,
    timeoutMs: 60_000,
    maxRetries,
    apiStyle: 'chat-completions',
    renderImagePreview: tool.DEFAULT_RENDER_IMAGE_PREVIEW,
  }
}

/** A live (never-aborted) signal the call may use. */
function liveSignal(): AbortSignal {
  const controller = new AbortController()
  return controller.signal
}

/** Start a mock server, run the callback against its URL, and close it after. */
async function withServer(
  handler: (request: RecordedRequest, response: ServerResponse) => void,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server = await startMockServer(handler)
  cleanup.push(() => server.close())
  await run(server.url)
}

describe('callVision retries', () => {
  it('succeeds after a transient 500', async () => {
    let calls = 0
    await withServer((_req, res) => {
      calls += 1
      if (calls === 1) jsonReply(res, 500, { error: 'boom' })
      else jsonReply(res, 200, chatReply('ok'))
    }, async (url) => {
      const s = { ...spec(2), baseURL: url }
      const text = await tool.callVision(s, 'sk', 'prompt', loadedImage(), liveSignal())
      expect(text).toBe('ok')
      expect(calls).toBe(2)
    })
  })

  it('retries 429 as transient', async () => {
    let calls = 0
    await withServer((_req, res) => {
      calls += 1
      if (calls <= 2) jsonReply(res, 429, { error: 'slow down' })
      else jsonReply(res, 200, chatReply('finally'))
    }, async (url) => {
      const s = { ...spec(2), baseURL: url }
      const text = await tool.callVision(s, 'sk', 'prompt', loadedImage(), liveSignal())
      expect(text).toBe('finally')
      expect(calls).toBe(3)
    })
  })

  it('gives up after maxRetries+1 attempts on a persistent 5xx', async () => {
    let calls = 0
    await withServer((_req, res) => {
      calls += 1
      jsonReply(res, 503, { error: 'down' })
    }, async (url) => {
      const s = { ...spec(2), baseURL: url }
      await expect(tool.callVision(s, 'sk', 'prompt', loadedImage(), liveSignal()))
        .rejects.toThrow(/HTTP 503 after 3 attempts/)
      expect(calls).toBe(3)
    })
  })

  it('does not retry a client error (400)', async () => {
    let calls = 0
    await withServer((_req, res) => {
      calls += 1
      jsonReply(res, 400, { error: 'bad request' })
    }, async (url) => {
      const s = { ...spec(2), baseURL: url }
      await expect(tool.callVision(s, 'sk', 'prompt', loadedImage(), liveSignal()))
        .rejects.toThrow(/HTTP 400/)
      expect(calls).toBe(1)
    })
  })

  it('honors maxRetries = 0 (single attempt, no retry)', async () => {
    let calls = 0
    await withServer((_req, res) => {
      calls += 1
      jsonReply(res, 500, { error: 'boom' })
    }, async (url) => {
      const s = { ...spec(0), baseURL: url }
      await expect(tool.callVision(s, 'sk', 'prompt', loadedImage(), liveSignal()))
        .rejects.toThrow(/HTTP 500/)
      expect(calls).toBe(1)
    })
  })

  it('does not fire a request when the caller signal is already aborted', async () => {
    let calls = 0
    const controller = new AbortController()
    controller.abort()
    await withServer((_req, res) => {
      calls += 1
      jsonReply(res, 500, { error: 'boom' })
    }, async (url) => {
      const s = { ...spec(2), baseURL: url }
      await expect(tool.callVision(s, 'sk', 'prompt', loadedImage(), controller.signal))
        .rejects.toThrow(/aborted|AbortError/i)
      expect(calls).toBe(0)
    })
  })
})
