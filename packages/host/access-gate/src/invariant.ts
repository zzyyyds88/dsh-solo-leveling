/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-host-access-gate`.
 * @module @deepseek-ai/dsh-host-access-gate/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-access-gate'

/** Cordis companion plugin name. */
export const name = 'host-access-gate-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the gate's admission decision is a pure function of
 * the session cookie and configured password, asserted directly by this
 * package's gate/session/route specs rather than an event/data relation.
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
