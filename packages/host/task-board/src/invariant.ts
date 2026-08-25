/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-host-task-board`.
 * Not mounted by the bundle patch (the web profile composes no invariants
 * service); kept as the repo-convention companion for compositions that do.
 * @module @deepseek-ai/dsh-host-task-board/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-task-board'

/** Cordis companion plugin name. */
export const name = 'task-board-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the ledger is a plain JSON file owned end-to-end by
 * TaskBoardService (atomic tmp+rename replacement, ordered writes), and the
 * `task-board/changed` stream is asserted by the service's own tests.
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
