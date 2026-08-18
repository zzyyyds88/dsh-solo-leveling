/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-mobile-adapt`.
 * @module @deepseek-ai/dsh-client-ui-mobile-adapt/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-mobile-adapt'

/** Cordis companion plugin name. */
export const name = 'client-ui-mobile-adapt-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin performs viewport-conditional DOM
 * adaptation (host CSS injection through `webServer.tapIndex` plus a
 * browser-side layout observer). It emits no cordis events and owns no
 * cross-plugin mutable state; narrow/wide transitions and drawer behavior are
 * asserted directly by this package's client specs.
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
