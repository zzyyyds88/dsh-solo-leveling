/**
 * Local fork build config for @deepseek-ai/dsh-llm-pi-ai. Host-only package:
 * lib/index.js + lib/invariant.js. Runtime deps stay external and resolve
 * from the global dsh install (global-paths fallback).
 */
import { clientBundle } from '../../build/tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-llm-pi-ai', ['src/index.ts', 'src/invariant.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-attachment',
    '@deepseek-ai/dsh-credentials',
    '@deepseek-ai/dsh-invariants',
    '@deepseek-ai/dsh-launch-environment',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/dsh-timeout',
    '@deepseek-ai/schemastery',
    '@earendil-works/pi-ai',
  ],
})
