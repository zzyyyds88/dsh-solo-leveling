/**
 * Local fork build config for @deepseek-ai/dsh-llm-deepseek. Host-only
 * package: lib/index.js + lib/invariant.js. Runtime deps stay external and
 * resolve from the global dsh install (global-paths fallback).
 */
import { clientBundle } from '../../build/tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-llm-deepseek', ['src/index.ts', 'src/invariant.ts'], {
  libExternal: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-anonymous-user-id',
    '@deepseek-ai/dsh-credentials',
    '@deepseek-ai/dsh-invariants',
    '@deepseek-ai/dsh-launch-environment',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/dsh-timeout',
    '@deepseek-ai/schemastery',
  ],
})
