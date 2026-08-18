/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-pet`.
 * @module @deepseek-ai/dsh-client-ui-pet/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-pet'

/** Cordis companion plugin name. */
export const name = 'client-ui-pet-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the pet is a pure presentation overlay over the
 * session runtime and localStorage-backed preferences; its only event/data
 * relation is the app-changed dispatch, owned by the pet's own presentation.
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
