/**
 * Host half of the DeepSeek Pet Web surface. The browser half is discovered
 * from package.json's dsh.client declaration and owns all visible behavior.
 *
 * Registers a lightweight settings namespace so the card appears in the rc.7
 * keyed `settings.plugin.item` slot (the slot's key must match a served
 * namespace). The pet stores its configuration in localStorage, not the
 * settings seam, so the namespace carries no schema — the registration is
 * solely a display-enabler for the settings card.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

const NS = settingsNamespace('deepseek-pet')

/**
 * Mount the plugin: register the empty `deepseek-pet` settings namespace.
 * @param ctx - plugin context carrying the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (sctx) => {
    sctx.settings.register(NS, z.object({}))
  })
}
