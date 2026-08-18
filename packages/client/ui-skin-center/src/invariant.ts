/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-skin-center`.
 * @module @deepseek-ai/dsh-client-ui-skin-center/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-skin-center'

/** Cordis companion plugin name. */
export const name = 'client-ui-skin-center-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the skin center writes only DOM and the settings ledger. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
