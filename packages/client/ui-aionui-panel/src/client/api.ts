/**
 * Browser client for the host /aionui-panel/* routes: typed JSON envelope
 * calls plus the SSE change subscription. Same-origin relative fetch (the
 * page and the routes share the webserver).
 * @module dsh-aionui-panel/client/api
 */

import type {
  DirListing, FileRead, GitBatchResult, GitStatusView, PanelEnvelope, PanelError, SearchView,
} from '../core/types.ts'

/** Transport failure (fetch threw or the response was not JSON). */
const TRANSPORT_ERROR: PanelError = { code: 'internal', message: 'panel route unavailable' }

/** POST one JSON payload and decode the envelope; never throws. */
async function post<T>(path: string, payload: Record<string, unknown>): Promise<PanelEnvelope<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    return { ok: false, error: TRANSPORT_ERROR }
  }
  try {
    const envelope = await response.json() as unknown
    if (typeof envelope !== 'object' || envelope === null) return { ok: false, error: TRANSPORT_ERROR }
    const record = envelope as Record<string, unknown>
    if (record.ok === true) return { ok: true, value: record.value as T }
    return { ok: false, error: (record.error as PanelError | undefined) ?? TRANSPORT_ERROR }
  } catch {
    return { ok: false, error: TRANSPORT_ERROR }
  }
}

/** Typed panel operations over the wire. */
export class PanelApi {
  /** List one directory of the project root (rel path; '' = root).
   * @param root - the project root identifier.
   * @param path - directory path relative to the root ('' = root).
   * @returns the directory listing envelope.
   */
  list(root: string, path: string): Promise<PanelEnvelope<DirListing>> {
    return post('/aionui-panel/list', { root, path })
  }

  /** Read one file (text or image data URL).
   * @param root - the project root identifier.
   * @param path - file path relative to the root.
   * @param asImage - request an image data URL instead of text.
   * @returns the file contents envelope.
   */
  read(root: string, path: string, asImage: boolean): Promise<PanelEnvelope<FileRead>> {
    return post('/aionui-panel/read', { root, path, asImage })
  }

  /** Write text content back with an optional mtime conflict base.
   * @param root - the project root identifier.
   * @param path - file path relative to the root.
   * @param content - the text to write.
   * @param baseMtime - expected current mtime; when set, the write is rejected if it no longer matches.
   * @returns the envelope carrying the new file mtime.
   */
  write(root: string, path: string, content: string, baseMtime?: number): Promise<PanelEnvelope<{ mtime: number }>> {
    return post('/aionui-panel/write', { root, path, content, baseMtime })
  }

  /** Filename search under the root.
   * @param root - the project root identifier.
   * @param query - filename fragment to match.
   * @returns the search results envelope.
   */
  search(root: string, query: string): Promise<PanelEnvelope<SearchView>> {
    return post('/aionui-panel/search', { root, query })
  }

  /** Delete a path (untracked discard).
   * @param root - the project root identifier.
   * @param path - path relative to the root to delete.
   * @returns the operation result envelope.
   */
  delete(root: string, path: string): Promise<PanelEnvelope<{ ok: true }>> {
    return post('/aionui-panel/delete', { root, path })
  }

  /** The repo status view; null when the root is not a repository.
   * @param root - the project root identifier.
   * @returns the status view envelope (null value when the root is not a repository).
   */
  gitStatus(root: string): Promise<PanelEnvelope<GitStatusView | null>> {
    return post('/aionui-panel/git-status', { root })
  }

  /** The unified diff text of one path (staged = index vs HEAD).
   * @param root - the project root identifier.
   * @param path - file path relative to the root.
   * @param staged - compare the index to HEAD (true) or the worktree to the index (false).
   * @returns the diff text envelope.
   */
  gitDiff(root: string, path: string, staged: boolean): Promise<PanelEnvelope<{ content: string }>> {
    return post('/aionui-panel/git-diff', { root, path, staged })
  }

  /** Stage paths.
   * @param root - the project root identifier.
   * @param paths - file paths relative to the root to stage.
   * @returns the batch result envelope.
   */
  gitStage(root: string, paths: string[]): Promise<PanelEnvelope<GitBatchResult>> {
    return post('/aionui-panel/git-stage', { root, paths })
  }

  /** Unstage paths.
   * @param root - the project root identifier.
   * @param paths - file paths relative to the root to unstage.
   * @returns the batch result envelope.
   */
  gitUnstage(root: string, paths: string[]): Promise<PanelEnvelope<GitBatchResult>> {
    return post('/aionui-panel/git-unstage', { root, paths })
  }

  /** Discard paths (worktree side; untracked paths are deleted).
   * @param root - the project root identifier.
   * @param paths - file paths relative to the root to discard.
   * @returns the batch result envelope.
   */
  gitDiscard(root: string, paths: string[]): Promise<PanelEnvelope<GitBatchResult>> {
    return post('/aionui-panel/git-discard', { root, paths })
  }
}

/** One SSE change event pushed by the host. */
export type PanelChangeEvent =
  | { kind: 'fs' }
  | { kind: 'git'; status: GitStatusView }
  | { kind: 'gitUnavailable' }

/**
 * Subscribe to host-pushed changes for one project root (fs watch events and
 * git status polls). Reconnects are handled by the EventSource; the caller
 * re-subscribes when the root changes.
 * @param root - project root to watch.
 * @param onChange - fired on every pushed change.
 * @returns the disposer closing the stream.
 */
export function subscribePanelEvents(root: string, onChange: (event: PanelChangeEvent) => void): () => void {
  const source = new EventSource(`/aionui-panel/events?root=${encodeURIComponent(root)}`)
  source.addEventListener('change', (raw) => {
    try {
      const event = JSON.parse((raw).data as string) as PanelChangeEvent
      onChange(event)
    } catch {
      // malformed push; ignore
    }
  })
  return () => { source.close() }
}
