/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-host-mobile-remote`.
 * Not mounted by the bundle patch (the web profile composes no invariants
 * service); kept as the repo-convention companion for compositions that do.
 * @module @deepseek-ai/dsh-host-mobile-remote/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-mobile-remote'

/** Cordis companion plugin name. */
export const name = 'mobile-remote-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the BFF holds no state of its own (whitelist table,
 * live settings state, and per-connection pumps are asserted by the plugin's
 * own suites), and every business truth stays in apiProxy / taskBoard.
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
