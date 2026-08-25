// MobileFsService: workspace gating, traversal/symlink escape refusal, text
// truncation, image data URLs and the byte cap, and mime derivation for raw
// reads. Uses a real temp tree; the junction case exercises realpath on win32
// (junctions need no elevated privilege there).

import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { IMAGE_CAP_BYTES, TEXT_CAP_CHARS } from '../src/core/protocol.ts'
import {
  deriveMime, isPathInside, MobileFsService, normalizeForPrefix,
  type WorkspaceRootOf,
} from '../src/core/fs-service.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** One temp workspace tree with a registered id. */
async function workspace(): Promise<{ root: string; rootOf: WorkspaceRootOf }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mobile-fs-'))
  roots.push(root)
  const rootOf: WorkspaceRootOf = id => id === 'ws-1' ? root : undefined
  return { root, rootOf }
}

/** Bytes carrying the PNG magic (enough for sniffing; never decoded). */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0])

describe('gating', () => {
  it('answers not-found for an unknown workspace and bad-request for empty ids', async () => {
    const { rootOf } = await workspace()
    const fs = new MobileFsService(rootOf)
    await expect(fs.read('ghost', 'a.txt', false)).rejects.toMatchObject({ code: 'not-found' })
    await expect(fs.read('', 'a.txt', false)).rejects.toMatchObject({ code: 'bad-request' })
    await expect(fs.raw('ws-1', undefined as never)).rejects.toMatchObject({ code: 'bad-request' })
  })

  it('refuses ../ escapes before touching the disk', async () => {
    const { rootOf } = await workspace()
    const fs = new MobileFsService(rootOf)
    await expect(fs.raw('ws-1', '../outside.txt')).rejects.toMatchObject({ code: 'bad-request' })
    await expect(fs.read('ws-1', 'sub/../../x', false)).rejects.toMatchObject({ code: 'bad-request' })
    await expect(fs.raw('ws-1', 'a\0b')).rejects.toMatchObject({ code: 'bad-request' })
  })

  it('refuses a junction whose target lives outside the root', async () => {
    const { root, rootOf } = await workspace()
    const outsideRoot = await mkdtemp(join(tmpdir(), 'dsh-mobile-out-'))
    roots.push(outsideRoot)
    await writeFile(join(outsideRoot, 'secret.txt'), 'secret')
    await mkdir(join(root, 'sub'))
    await symlink(outsideRoot, join(root, 'sub', 'link'), 'junction')
    const fs = new MobileFsService(rootOf)
    await expect(fs.raw('ws-1', 'sub/link/secret.txt')).rejects.toMatchObject({ code: 'bad-request' })
    // A junction pointing inside the root stays readable.
    const insideRoot = join(root, 'sub')
    await symlink(insideRoot, join(root, 'link-in'), 'junction')
    await expect(fs.raw('ws-1', 'link-in')).rejects.toMatchObject({ code: 'bad-request' }) // directory
  })
})

describe('read (preview)', () => {
  it('reads utf-8 text with size/mtime and no truncation under the cap', async () => {
    const { root, rootOf } = await workspace()
    await writeFile(join(root, 'a.txt'), 'hello 手机', 'utf8')
    const fs = new MobileFsService(rootOf)
    const read = await fs.read('ws-1', 'a.txt', false)
    expect(read.content).toBe('hello 手机')
    expect(read.truncated).toBe(false)
    expect(read.size).toBe(Buffer.byteLength('hello 手机', 'utf8'))
    expect(read.mtime).toBeGreaterThan(0)
  })

  it('truncates text past the char ceiling and flags it', async () => {
    const { root, rootOf } = await workspace()
    await writeFile(join(root, 'big.txt'), 'x'.repeat(TEXT_CAP_CHARS + 10), 'utf8')
    const fs = new MobileFsService(rootOf)
    const read = await fs.read('ws-1', 'big.txt', false)
    expect(read.truncated).toBe(true)
    expect(read.content).toHaveLength(TEXT_CAP_CHARS)
  })

  it('returns image data URLs with the derived mime', async () => {
    const { root, rootOf } = await workspace()
    await writeFile(join(root, 'pixel.png'), PNG_MAGIC)
    const fs = new MobileFsService(rootOf)
    const read = await fs.read('ws-1', 'pixel.png', true)
    expect(read.content.startsWith('data:image/png;base64,')).toBe(true)
    expect(read.truncated).toBe(false)
    expect(read.size).toBe(PNG_MAGIC.length)
  })

  it('answers payload-too-large when an image exceeds the byte budget', async () => {
    const { root, rootOf } = await workspace()
    await writeFile(join(root, 'huge.png'), Buffer.alloc(IMAGE_CAP_BYTES + 1, 7))
    const fs = new MobileFsService(rootOf)
    await expect(fs.read('ws-1', 'huge.png', true)).rejects.toMatchObject({ code: 'payload-too-large' })
  })

  it('answers not-found for missing files and bad-request for directories', async () => {
    const { root, rootOf } = await workspace()
    await mkdir(join(root, 'dir'))
    const fs = new MobileFsService(rootOf)
    await expect(fs.read('ws-1', 'missing.txt', false)).rejects.toMatchObject({ code: 'not-found' })
    await expect(fs.read('ws-1', 'dir', false)).rejects.toMatchObject({ code: 'bad-request' })
    await expect(fs.raw('ws-1', 'dir')).rejects.toMatchObject({ code: 'bad-request' })
    await expect(fs.raw('ws-1', 'gone.txt')).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('containment helpers', () => {
  it('isPathInside refuses empty inputs and accepts equality plus nesting', () => {
    expect(isPathInside('', '/tmp/x')).toBe(false)
    expect(isPathInside('/tmp/x', '')).toBe(false)
    const root = normalizeForPrefix('/tmp/x')
    expect(isPathInside(root, root)).toBe(true)
    expect(isPathInside(root, `${root}/child`)).toBe(true)
    expect(isPathInside(root, `${root}y`)).toBe(false)
    expect(normalizeForPrefix('/a/b/')).toBe(normalizeForPrefix('\\a\\b'))
  })
})

describe('deriveMime (direct)', () => {
  it('walks every magic arm and the octet-stream fallback', () => {
    expect(deriveMime('x', Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png')
    expect(deriveMime('x', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(deriveMime('x', Buffer.from([0x25, 0x50, 0x44, 0x46]))).toBe('application/pdf')
    expect(deriveMime('x', Buffer.from([0, 0, 0, 0]))).toBe('application/octet-stream')
    // Shorter than any magic probe: straight to the fallback.
    expect(deriveMime('x', Buffer.from([1, 2]))).toBe('application/octet-stream')
    // Multi-dot names take the final segment.
    expect(deriveMime('archive.tar.gz', Buffer.alloc(0))).toBe('application/octet-stream')
    expect(deriveMime('notes.MD', Buffer.alloc(0))).toBe('text/markdown')
  })
})

describe('raw resolution', () => {
  it('derives the mime from extension first, then magic bytes, then octet-stream', async () => {
    const { root, rootOf } = await workspace()
    await writeFile(join(root, 'pic.jpg'), PNG_MAGIC) // extension wins over magic
    await writeFile(join(root, 'photo'), JPEG_MAGIC) // no extension → sniff
    await writeFile(join(root, 'noext'), PNG_MAGIC)
    await writeFile(join(root, 'data.bin'), Buffer.from([1, 2, 3]))
    const fs = new MobileFsService(rootOf)
    expect((await fs.raw('ws-1', 'pic.jpg')).mime).toBe('image/jpeg')
    expect((await fs.raw('ws-1', 'photo')).mime).toBe('image/jpeg')
    expect((await fs.raw('ws-1', 'noext')).mime).toBe('image/png')
    expect((await fs.raw('ws-1', 'data.bin')).mime).toBe('application/octet-stream')
  })
})
