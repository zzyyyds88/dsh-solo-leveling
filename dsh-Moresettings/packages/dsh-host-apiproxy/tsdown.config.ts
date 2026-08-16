/**
 * Local fork build config for @deepseek-ai/dsh-host-apiproxy.
 * Emits the node-half bundle lib/index.js + lib/invariant.js plus the
 * browser-safe contract layer at lib/types/api/index.js (the "./api" export
 * consumed by dsh-client-connection). All runtime deps stay external and
 * resolve from the global dsh install at runtime (global-paths fallback).
 */
import { clientBundle } from '../../build/tsdown.client.ts'

const EXTERNALS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/schemastery',
  'zod',
  'fflate',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-default-model',
  '@deepseek-ai/dsh-agent-presets',
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-brand',
  '@deepseek-ai/dsh-commands',
  '@deepseek-ai/dsh-cordis-host-runner',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-goal',
  '@deepseek-ai/dsh-host-directory-picker',
  '@deepseek-ai/dsh-invariants',
  '@deepseek-ai/dsh-jobs',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-native-command',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-persistence',
  '@deepseek-ai/dsh-session-projection',
  '@deepseek-ai/dsh-session-projection-cache',
  '@deepseek-ai/dsh-session-query',
  '@deepseek-ai/dsh-session-title',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-subagent',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-user-approval',
  '@deepseek-ai/dsh-user-questions',
  '@deepseek-ai/dsh-workspace',
]

export default clientBundle('@deepseek-ai/dsh-host-apiproxy', ['src/index.ts'], {
  lib: {
    entry: {
      index: 'src/index.ts',
      invariant: 'src/invariant.ts',
      'types/api/index': 'src/api/index.ts',
      'types/fetch/client': 'src/fetch/client.ts',
    },
  },
  libExternal: EXTERNALS,
})
