/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-access-gate`.
 * @module @deepseek-ai/dsh-client-ui-access-gate/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-access-gate'

/** Cordis companion plugin name. */
export const name = 'client-ui-access-gate-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the card is a pure projection over the `dsh-defaults`
 * settings scope; its only relation is the scope snapshot itself, asserted by
 * the `dsh-defaults` host plugin's own schema.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
