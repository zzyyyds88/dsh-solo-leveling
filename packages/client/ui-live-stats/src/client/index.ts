import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface SlotMap merge and the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: declares the keyed `settings.plugin.item` slot (plugin-config section).
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import { LiveStatsSettingsCard, LiveStatsSettingsCardController, type LiveStatsSettings } from './LiveStatsSettingsCard.tsx'
import { ensureMergeCss } from './merge-css.ts'
import { TpsLineDockEntry } from './TpsLine.tsx'
import { en, zh, type SettingsCardKey } from './locales.ts'

export { TpsLine, formatTokensPerSecond } from './TpsLine.tsx'
export type { LiveStatsSettings, LiveStatsSettingsCardFace, LiveStatsSettingsCardState } from './LiveStatsSettingsCard.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** live-stats settings-card copy. */
    'live-stats': SettingsCardKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'live-stats'

/** Settings namespace the live-stats card edits (the Host plugin registers it). */
const LIVE_STATS_NS = 'live-stats'

/** Services required by this plugin. */
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote']

/**
 * Register the live-stats surface: the generation-throughput TPS row lives in
 * the conversation composer dock (read from the `liveTokenUsage` projection),
 * and the plugin settings card mounts over the `live-stats` namespace.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'live-stats: dictionaries')

  // Merge stylesheet: pulls the TPS row onto the official StatsLine's row
  // (see merge-css.ts). Injected once; rules are :has()-anchored on the TPS
  // row, so nothing changes while it is unmounted.
  ensureMergeCss()

  // Plugin configuration card: one staged form over the `live-stats` settings
  // namespace, contributed to the plugin-configuration section.
  const scope = ctx.settingsScope.bind<LiveStatsSettings>({ namespace: LIVE_STATS_NS })
  const liveStatsSettings = new LiveStatsSettingsCardController(scope)
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: LIVE_STATS_NS,
    locale: NS,
    inject: () => liveStatsSettings.inject(),
  }, LiveStatsSettingsCard))

  // The live TPS row mounts on the composer dock (the shipped stats-line
  // seat). Its session standard kit supplies `useProjection`, which reads the
  // host's `liveTokenUsage` projection.
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'live-stats',
    order: 100,
    inject: () => ({}),
  }, TpsLineDockEntry))
}
