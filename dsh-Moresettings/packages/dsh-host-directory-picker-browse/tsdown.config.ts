/**
 * Local fork build config for @deepseek-ai/dsh-host-directory-picker-browse.
 * Host-only package: lib/index.js + lib/invariant.js. Runtime deps stay
 * external and resolve from the global dsh install (global-paths fallback).
 */
import { clientBundle } from '../../build/tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-host-directory-picker-browse', ['src/index.ts', 'src/invariant.ts'], {
  libExternal: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-host-directory-picker',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/schemastery',
  ],
})
