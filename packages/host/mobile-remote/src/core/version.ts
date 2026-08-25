/**
 * Version reporting for GET /api/mobile/info. The plugin locates its own
 * package manifest by walking up from this module (source runs sit two levels
 * deep under src/, bundled output one level under lib/), refusing to trust a
 * foreign package's manifest. hostVersion probes the harness CLI manifest the
 * way an installed flat node_modules lays it out, degrading to 'unknown'.
 * @module dsh-mobile-remote/core/version
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One CommonJS-style manifest reader (seam for tests). */
export type ManifestReader = (id: string) => unknown

/** This package's name — a found manifest must carry it to be trusted. */
const PACKAGE_NAME = '@deepseek-ai/dsh-host-mobile-remote'

/** One file reader seam (throws on missing files). */
export type TextReader = (path: string) => string

/**
 * Read the harness CLI's version through one manifest reader.
 * @param read - the reader to probe with.
 * @returns the CLI version, or undefined when unresolvable/malformed.
 */
export function readHostVersion(read: ManifestReader): string | undefined {
  try {
    const manifest = read('@deepseek-ai/dsh/package.json') as { version?: unknown }
    return typeof manifest.version === 'string' && manifest.version !== '' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/**
 * Walk up from one directory until this package's own manifest appears.
 * @param startDir - directory to walk up from.
 * @param readFile - file reader seam.
 * @returns the manifest version, or 'unknown' when nothing trustworthy resolves.
 */
export function readPluginVersion(startDir: string, readFile: TextReader): string {
  let dir = startDir
  for (let hop = 0; hop < 8; hop += 1) {
    try {
      const manifest = JSON.parse(readFile(join(dir, 'package.json'))) as { name?: unknown; version?: unknown }
      if (manifest.name === PACKAGE_NAME && typeof manifest.version === 'string' && manifest.version !== '') {
        return manifest.version
      }
    } catch {
      // Missing, unreadable, or foreign manifest: keep walking toward the root.
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return 'unknown'
}

/**
 * Fold a host-version probe onto the reported string.
 * @param read - the manifest reader to probe with.
 * @returns the CLI version, or 'unknown'.
 */
export function resolveHostVersion(read: ManifestReader): string {
  return readHostVersion(read) ?? 'unknown'
}

/** This plugin's own manifest version, resolved once at module load. */
export const PLUGIN_VERSION: string =
  readPluginVersion(fileURLToPath(new URL('.', import.meta.url)), path => readFileSync(path, 'utf8'))

/** The harness host version ('unknown' when the CLI manifest is not resolvable). */
export const HOST_VERSION: string = resolveHostVersion(id => createRequire(import.meta.url)(id))
