/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-skin-maid-atelier`.
 * @module @deepseek-ai/dsh-client-ui-skin-maid-atelier/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-skin-maid-atelier'

/** Cordis companion plugin name. */
export const name = 'client-ui-skin-maid-atelier-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the skin is a pure DOM presentation overlay with no model-visible relation. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
