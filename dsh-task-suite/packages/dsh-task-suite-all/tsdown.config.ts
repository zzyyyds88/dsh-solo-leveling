/**
 * Build config for the dsh-task-suite-all aggregate: node-half lib/ plus the
 * browser bundle lib/client.js (the compat shim), same client-bundle preset
 * the family packages keep (shared/tsdown.client.ts).
 */
import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@zzyyyds88/dsh-task-suite-all', ['src/index.ts'])
