/**
 * The live-stats settings card: the token-estimation density parameters.
 * Registers into the `settings.plugin.item` slot the plugin-configuration
 * section renders, bound to the `live-stats` settings namespace.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import { type CardActions, type CardShell, type FieldState as CardFieldState } from './settings-form.ts';
/** The live-stats fields this card edits (the namespace's full schema). */
export interface LiveStatsSettings {
    /** Master switch for the plugin. */
    enabled?: boolean;
    /** Approximate text characters represented by one token. */
    charsPerToken?: number;
    /** Fixed framing tokens assigned to each content block. */
    blockOverhead?: number;
    /** Fixed framing tokens assigned to each message or assistant response. */
    roleOverhead?: number;
}
/** What the live-stats card renders. */
export interface LiveStatsSettingsCardState extends CardShell {
    /** Master switch. */
    enabled: CardFieldState;
    /** Characters per token. */
    charsPerToken: CardFieldState;
    /** Per-content-block framing tokens. */
    blockOverhead: CardFieldState;
    /** Per-message framing tokens. */
    roleOverhead: CardFieldState;
}
/** The registration-side face the card's slot entry injects. */
export interface LiveStatsSettingsCardFace extends CardActions {
    hooks: {
        /** Card snapshot bound by the renderer as useLiveStatsSettingsCard. */
        liveStatsSettingsCard: SnapshotStore<LiveStatsSettingsCardState>;
    };
}
/** Bridges the `live-stats` scope onto the card's staged form. */
export declare class LiveStatsSettingsCardController {
    private readonly form;
    private readonly store;
    /** @param scope - the bound settings scope for the `live-stats` namespace. */
    constructor(scope: SettingsScope<LiveStatsSettings>);
    private projection;
    /**
     * Build the face the card's slot registration injects.
     * @returns the card's snapshot and its form actions.
     */
    inject(): LiveStatsSettingsCardFace;
}
/** Props the renderer binds for the live-stats card. */
export type LiveStatsSettingsCardProps = PropsRuntime<'web-ui.plugin.item'> & PropsLocale<'live-stats'> & InjectFace<LiveStatsSettingsCardFace>;
/**
 * Render the live-stats card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export declare function LiveStatsSettingsCard(props: LiveStatsSettingsCardProps): import("react").JSX.Element;
//# sourceMappingURL=LiveStatsSettingsCard.d.ts.map