/**
 * Local fork build config. Uses the vendored dsh client-bundle preset
 * (build/tsdown.client.ts, vendored from dsh-task-suite/shared/, 同源上游 client 预设): emits the
 * node-half lib/ bundle. Host-only package — no src/client, so no browser
 * bundle face is produced.
 */
import { clientBundle } from '../../build/tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-host-webserver', ['src/index.ts', 'src/invariant.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-invariants',
    '@deepseek-ai/schemastery',
  ],
})
