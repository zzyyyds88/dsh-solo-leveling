/**
 * Workspace-gated filesystem reads for the phone remote: a text preview with
 * an 80k-char ceiling and image data URLs with an 8 MiB budget
 * (`/api/mobile/fs/read`), plus raw-path resolution for the Range-streaming
 * `/api/mobile/fs/raw` route. Every path resolves inside the workspace root
 * named by its registry id; traversal and symlink escapes are refused (the
 * same posture as the aionui-panel FsService).
 * @module dsh-mobile-remote/core/fs-service
 */

import { open, readFile, realpath, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { MobileError } from './protocol.ts'
import { IMAGE_CAP_BYTES, TEXT_CAP_CHARS } from './protocol.ts'

/** One completed preview read (text or image). */
export interface FsRead {
  /** utf-8 text (possibly truncated) or a `data:` URL for images. */
  content: string
  /** Whether the text was cut at the preview ceiling. */
  truncated: boolean
  /** File size in bytes. */
  size: number
  /** File mtime in ms. */
  mtime: number
}

/** One resolved raw file ready for byte streaming. */
export interface RawFile {
  /** Absolute path to stream from. */
  abs: string
  /** Derived mime type. */
  mime: string
  /** File size in bytes (Range clamping). */
  size: number
}

/**
 * Normalize a path for prefix comparison: collapse Windows separators to `/`,
 * drop trailing slashes, lower-case on win32 (the case-insensitive platform FS).
 * Exported for containment unit tests; not part of the package barrel.
 * @param value - the path to normalize.
 * @returns the normalized path.
 */
export function normalizeForPrefix(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '')
  /* v8 ignore next -- only the other platform's arm can be uncovered per OS; both spellings are pinned by the prefix contract below. */
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/**
 * Containment check: child equals root or lives directly inside it.
 * Exported for direct unit tests; not part of the package barrel.
 * @param root - the containing path.
 * @param child - the path to test.
 * @returns true when contained.
 */
export function isPathInside(root: string, child: string): boolean {
  if (root === '' || child === '') return false
  const normRoot = normalizeForPrefix(root)
  const normChild = normalizeForPrefix(child)
  return normChild === normRoot || normChild.startsWith(`${normRoot}/`)
}

/**
 * Resolve a relative path against the canonical workspace root,
 * realpath-checking existing ancestors so a symlink cannot smuggle the read
 * outside the root. A missing tail falls back to its nearest existing
 * ancestor (a nonexistent tail cannot itself be a symlink); the registered
 * root itself always exists, bounding the walk.
 * @param root - canonical workspace root.
 * @param rel - the requested relative path.
 * @returns the absolute path when contained (existence checked by callers).
 * @throws MobileError bad-request on escape attempts.
 */
async function resolveInsideRoot(root: string, rel: string): Promise<string> {
  if (rel.includes('\0')) throw new MobileError('bad-request', 'invalid path')
  const abs = join(root, rel)
  if (!isPathInside(root, abs)) {
    throw new MobileError('bad-request', `path escapes the workspace root: ${rel}`)
  }
  let probe = abs
  for (;;) {
    let real: string | undefined
    try {
      real = await realpath(probe)
    } catch {
      real = undefined
    }
    if (real !== undefined) {
      if (!isPathInside(root, real)) {
        throw new MobileError('bad-request', `path resolves outside the workspace root: ${rel}`)
      }
      return abs
    }
    /* v8 ignore start -- the registered root always exists and bounds this walk; the volume-root fallback cannot fire. */
    const parent = dirname(probe)
    if (parent === probe) return abs
    probe = parent
  }
  /* v8 ignore stop */
}

/** Mime type by extension (the common preview set; unknown rides octet-stream). */
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  avif: 'image/avif',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
}

/**
 * Derive the mime type from the extension, then from magic bytes.
 * Exported for direct unit tests; not part of the package barrel.
 * @param rel - the relative path whose extension to inspect.
 * @param data - the first bytes of the file (magic sniffing).
 * @returns the derived mime type.
 */
export function deriveMime(rel: string, data: Buffer): string {
  const parts = rel.split('.')
  const ext = parts.length > 1 ? (parts.at(-1) as string).toLowerCase() : ''
  if (MIME_BY_EXT[ext] !== undefined) return MIME_BY_EXT[ext]
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) return 'application/pdf'
  return 'application/octet-stream'
}

/** Read the first 4 magic bytes of a file (empty buffer when unreadable). Exported for tests; not in the barrel. */
export async function readMagicBytes(abs: string): Promise<Buffer> {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(abs, 'r')
    const buf = Buffer.alloc(4)
    const { bytesRead } = await handle.read(buf, 0, 4, 0)
    return buf.subarray(0, bytesRead)
  } catch {
    /* v8 ignore next 2 -- a vanished-after-stat or unreadable file defers to the caller's own read error. */
    return Buffer.alloc(0)
  } finally {
    /* v8 ignore next 2 -- close() rejection is meaningless here: the read already settled either way. */
    if (handle !== undefined) await handle.close().catch(() => {})
  }
}

/**
 * The workspace-root resolver face: registry id → canonical root directory
 * (undefined = unknown id).
 */
export type WorkspaceRootOf = (workspaceId: string) => string | undefined

/**
 * Gated read service over registered workspaces (see module doc).
 */
export class MobileFsService {
  constructor(private readonly rootOf: WorkspaceRootOf) {}

  /**
   * Resolve one workspace-relative path for reading.
   * @param workspaceId - the registry workspace id naming the root.
   * @param rel - the path relative to that root.
   * @returns the absolute path with derived mime and size.
   * @throws MobileError not-found on an unknown workspace or unreadable path;
   *   bad-request when the path is a directory or escapes the root.
   */
  async raw(workspaceId: string, rel: string): Promise<RawFile> {
    const abs = await this.resolveGated(workspaceId, rel)
    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(abs)
    } catch {
      throw new MobileError('not-found', `cannot read ${rel}`)
    }
    if (info.isDirectory()) throw new MobileError('bad-request', `${rel} is a directory`)
    return { abs, mime: deriveMime(rel, await readMagicBytes(abs)), size: info.size }
  }

  /**
   * Read one file for preview: utf-8 text capped at the char ceiling, or an
   * image data URL capped at the byte budget.
   * @param workspaceId - the registry workspace id naming the root.
   * @param rel - the path relative to that root.
   * @param asImage - return an image data URL instead of text.
   * @returns the preview read.
   * @throws MobileError not-found / bad-request like {@link raw};
   *   payload-too-large when an image exceeds the budget.
   */
  async read(workspaceId: string, rel: string, asImage: boolean): Promise<FsRead> {
    const abs = await this.resolveGated(workspaceId, rel)
    // Stat decides the verdict (missing vs directory) before any read; a file
    // vanishing between stat and readFile folds to the route's internal error.
    const info = await stat(abs).catch(() => undefined)
    if (info === undefined) throw new MobileError('not-found', `cannot read ${rel}`)
    if (info.isDirectory()) throw new MobileError('bad-request', `${rel} is a directory`)
    const data = await readFile(abs)
    if (asImage) {
      if (data.length > IMAGE_CAP_BYTES) {
        throw new MobileError('payload-too-large', 'image exceeds the preview cap')
      }
      const mime = deriveMime(rel, data)
      return {
        content: `data:${mime};base64,${data.toString('base64')}`,
        truncated: false,
        size: data.length,
        mtime: info.mtimeMs,
      }
    }
    const text = data.toString('utf8')
    const truncated = text.length > TEXT_CAP_CHARS
    return {
      content: truncated ? text.slice(0, TEXT_CAP_CHARS) : text,
      truncated,
      size: data.length,
      mtime: info.mtimeMs,
    }
  }

  /** Gate one request and resolve its path inside the workspace root (existence checked by callers). */
  private async resolveGated(workspaceId: string, rel: string): Promise<string> {
    if (typeof workspaceId !== 'string' || workspaceId === '') {
      throw new MobileError('bad-request', 'workspaceId is required')
    }
    if (typeof rel !== 'string') {
      throw new MobileError('bad-request', 'path is required')
    }
    const root = this.rootOf(workspaceId)
    if (root === undefined) {
      throw new MobileError('not-found', `workspace "${workspaceId}" is not registered`)
    }
    return resolveInsideRoot(root, rel)
  }
}
