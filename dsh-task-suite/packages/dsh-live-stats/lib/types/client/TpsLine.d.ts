import type { UseProjection } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Props supplied by the session-scoped composer dock. */
export interface TpsLineProps {
    useProjection: UseProjection;
}
/** Format throughput with one decimal below 100 tok/s. */
export declare function formatTokensPerSecond(value: number): string;
/**
 * Second composer-status line for active or latest response throughput.
 * The root carries `data-dsh-live-tps`: the merge stylesheet (merge-css.ts)
 * anchors on it to pull this row onto the same line as the official
 * StatsLine, which renders right before it in the composer dock.
 *
 * The slot stays mounted even while no rate sample exists (renders empty):
 * the merge layout keys on the slot's presence, so unmounting it on idle
 * would flip the official stats row between content width and full width on
 * every stream start or end.
 */
export declare const TpsLine: import("react").NamedExoticComponent<TpsLineProps>;
/**
 * Composer-dock entry: adapts the session-scoped `conversation.composer.dock`
 * runtime share to the TPS line. The dock is the shipped stats-line seat, and
 * its standard kit supplies `useProjection` (the fifth framework hook seat),
 * which reads the host's `liveTokenUsage` projection. Registering here makes
 * the live TPS row actually mount — previously the TpsLine was only exported
 * and never mounted on rc.6 (issue #56).
 */
export declare const TpsLineDockEntry: import("react").NamedExoticComponent<PropsRuntime<"conversation.composer.dock">>;
//# sourceMappingURL=TpsLine.d.ts.map