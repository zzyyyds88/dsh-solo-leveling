/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-task-board`.
 * @module @deepseek-ai/dsh-client-ui-task-board/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-task-board'

/** Cordis companion plugin name. */
export const name = 'client-ui-task-board-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the task board renders the session list the host
 * projection serves; the board owns no durable package-local event stream,
 * and the projection's served-value relation lives on its carrier's wire path.
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
