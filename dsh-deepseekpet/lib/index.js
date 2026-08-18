/**
 * Host half of the DeepSeek Pet Web surface. The browser half is discovered from
 * package.json's dsh.client declaration and owns all visible behavior.
 *
 * Registers a lightweight settings namespace so the card appears in the
 * rc.7 keyed `settings.plugin.item` slot (the slot's key must match a served
 * namespace). The pet stores its configuration in localStorage, not the
 * settings seam, so the namespace carries no schema — the registration is
 * solely a display-enabler for the settings card.
 */
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

const NS = settingsNamespace('deepseek-pet')

export function apply(ctx) {
  ctx.inject(['settings'], (sctx) => {
    const dispose = sctx.settings.register(NS, {})
    ctx.effect(() => dispose, 'deepseek-pet: settings namespace')
  })
}