/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-host-aionui-panel`.
 * @module @deepseek-ai/dsh-host-aionui-panel/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-aionui-panel'

/** Cordis companion plugin name. */
export const name = 'host-aionui-panel-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the host half serves data routes with no model-visible relation. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
