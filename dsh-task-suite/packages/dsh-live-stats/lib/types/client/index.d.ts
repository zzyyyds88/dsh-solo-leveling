import type { ClientContext, SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client';
import { type SettingsCardKey } from './locales.ts';
export { TpsLine, formatTokensPerSecond } from './TpsLine.tsx';
export type { LiveStatsSettings, LiveStatsSettingsCardFace, LiveStatsSettingsCardState } from './LiveStatsSettingsCard.tsx';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** live-stats settings-card copy. */
        'live-stats': SettingsCardKey;
    }
    interface SlotMap {
        /**
         * The child slot the Web UI plugin group declares; this card registers
         * into the group instead of the top-level `settings.plugin.item` list.
         * Spelled here with the same shape so this package can register without
         * depending on the sibling UI package.
         */
        'web-ui.plugin.item': {
            kind: 'list';
            scope: 'root';
            owner: SettingsPluginItemOwnerProps;
        };
    }
}
/** Owner share of a plugin card (the section supplies nothing). */
export interface SettingsPluginItemOwnerProps {
    /** Marker field: card owner props are intentionally empty. */
    children?: never;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /**
         * Optional rc.6 compatibility binder provided by dsh-web-ui-settings;
         * absent when that group plugin is not installed, so callers fall back to
         * the official settings scope.
         */
        webUiSettings?: {
            bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S>;
        };
    }
}
/** Services required by this plugin. */
export declare const inject: string[];
/**
 * Register the live-stats surface: the generation-throughput TPS group lives
 * in the ui-conversation stats line (read directly from the `liveTokenUsage`
 * projection), and this build of the browser half mounts the plugin settings
 * card over the `live-stats` namespace.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map