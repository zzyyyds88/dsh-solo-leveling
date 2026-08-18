/**
 * Host half of the DeepSeek Pet Web surface. The browser half is discovered
 * from package.json's dsh.client declaration and owns all visible behavior.
 *
 * Registers two lightweight settings namespaces so the two cards appear in
 * the rc.7 keyed `settings.plugin.item` slot (each slot key must match a
 * served namespace). The pet stores its configuration in localStorage, not
 * the settings seam, so the namespaces carry no schema — registration is
 * solely a display-enabler for the settings cards.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

const NS = settingsNamespace('deepseek-pet')
const LEDGER_NS = settingsNamespace('deepseek-pet-ledger')

/**
 * Mount the plugin: register the empty `deepseek-pet` + `deepseek-pet-ledger`
 * settings namespaces.
 * @param ctx - plugin context carrying the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (sctx) => {
    sctx.settings.register(NS, z.object({}))
    sctx.settings.register(LEDGER_NS, z.object({}))
  })
}
