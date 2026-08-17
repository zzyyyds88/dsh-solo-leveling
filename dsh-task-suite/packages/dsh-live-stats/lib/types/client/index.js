import { LiveStatsSettingsCard, LiveStatsSettingsCardController } from "./LiveStatsSettingsCard.js";
import { ensureMergeCss } from "./merge-css.js";
import { TpsLineDockEntry } from "./TpsLine.js";
import { en, zh } from "./locales.js";
export { TpsLine, formatTokensPerSecond } from "./TpsLine.js";
/** Dictionary namespace owned by this plugin. */
const NS = 'live-stats';
/** Settings namespace the live-stats card edits (the Host plugin registers it). */
const LIVE_STATS_NS = 'live-stats';
/** Services required by this plugin. */
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote'];
/**
 * Register the live-stats surface: the generation-throughput TPS group lives
 * in the ui-conversation stats line (read directly from the `liveTokenUsage`
 * projection), and this build of the browser half mounts the plugin settings
 * card over the `live-stats` namespace.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'live-stats: dictionaries');
    // Merge stylesheet: pulls the TPS row onto the official StatsLine's row
    // (see merge-css.ts). Injected once; rules are :has()-anchored on the TPS
    // row, so nothing changes while it is unmounted.
    ensureMergeCss();
    // Plugin configuration card: one staged form over the `live-stats` settings
    // namespace, contributed to the plugin-configuration section.
    const binder = ctx.get('webUiSettings') ?? ctx.settingsScope;
    const liveStatsSettings = new LiveStatsSettingsCardController(binder.bind({ namespace: LIVE_STATS_NS }));
    ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
        name: 'web-ui.plugin.item',
        id: 'live-stats',
        order: 110,
        locale: NS,
        inject: () => liveStatsSettings.inject(),
    }, LiveStatsSettingsCard));
    // The live TPS row mounts on the composer dock (the shipped stats-line
    // seat). Its session standard kit supplies `useProjection`, which reads the
    // host's `liveTokenUsage` projection. Previously TpsLine was only exported
    // for shell integration and never actually mounted on rc.6 (issue #56).
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'live-stats',
        order: 100,
        inject: () => ({}),
    }, TpsLineDockEntry));
}
