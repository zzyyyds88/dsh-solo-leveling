import type { EpochHeader } from '@deepseek-ai/dsh-session';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client';
import type { EstimatorSpec } from './estimator.ts';
export type { LiveTokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client';
type OutputBlock = {
    kind: 'text';
    characters: number;
} | {
    kind: 'reasoning';
    characters: number;
} | {
    kind: 'tool-call';
    nameCharacters: number;
    argumentCharacters: number;
} | {
    kind: 'fixed';
    tokens: number;
};
interface ActiveStep {
    turn: number;
    step: number;
    buckets: TokenUsageProjection;
    exact: boolean;
    /** Priced blocks by stream index. A plain record — never a sparse array —
     *  so the persisted projection checkpoint stays lossless JSON even when
     *  the model emits deltas at far-apart indices. */
    blocks: Record<number, OutputBlock>;
    /** Running sum of the per-block estimates of every non-undefined block. */
    pricedTokens: number;
    /** Count of non-undefined blocks (guards the role overhead and zero case). */
    pricedBlocks: number;
    firstOutputTime?: number;
    latestOutputTime?: number;
}
interface SettledSample {
    turn: number;
    step: number;
    buckets: TokenUsageProjection;
    estimated: boolean;
    /** Last measured throughput; carried across rate-less steps (`null` when
     *  none was ever measured, so the checkpoint stays lossless JSON). */
    tokensPerSecond: number | null;
}
interface State {
    settled: TokenUsageProjection;
    settledEstimates: number;
    last: SettledSample | null;
    /** Surface message seq -> estimated tokens, kept in increasing seq order. */
    surface: Record<number, number>;
    surfaceTokens: number;
    header: EpochHeader | null;
    active: ActiveStep | null;
}
/** Create the replayable live usage projection consumed by DSH Web and the TPS row.
 * @param spec - resolved estimator settings for the fold.
 * @returns the replayable `liveTokenUsage` projection definition.
 */
export declare function createLiveTokenUsageProjectionDefinition(spec: EstimatorSpec): ProjectionDefinition<'liveTokenUsage', State>;
//# sourceMappingURL=projection.d.ts.map