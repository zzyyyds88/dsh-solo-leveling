/**
 * Local fork build config for @deepseek-ai/dsh-client-connection.
 * Node half: lib/index.js + lib/invariant.js. Browser half: lib/client.js
 * (window.__ModuleLoader__ bundle) from src/client/index.ts.
 */
import { clientBundle } from '../../build/tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-client-connection', ['src/index.ts', 'src/invariant.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-host-apiproxy',
    '@deepseek-ai/dsh-invariants',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-attachment',
    '@deepseek-ai/schemastery',
  ],
})
