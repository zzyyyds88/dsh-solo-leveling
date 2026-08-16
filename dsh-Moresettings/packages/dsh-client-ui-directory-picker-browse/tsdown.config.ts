/**
 * Local fork build config for @deepseek-ai/dsh-client-ui-directory-picker-browse.
 * Node half (lib/index.js + lib/invariant.js) plus the browser bundle
 * lib/client.js. The picker start directory is injected at build time from
 * DSH_PICKER_DEFAULT_PATH (empty when unset → official home-directory
 * behavior).
 */
import { clientBundle } from '../../build/tsdown.client.ts'

const startPath = process.env.DSH_PICKER_DEFAULT_PATH ?? ''

export default clientBundle('@deepseek-ai/dsh-client-ui-directory-picker-browse', ['src/index.ts', 'src/invariant.ts'], {
  clientDefine: {
    'DSH_PICKER_DEFAULT_PATH': JSON.stringify(startPath),
  },
})
