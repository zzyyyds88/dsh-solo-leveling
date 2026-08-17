import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm';
import type { EpochHeader } from '@deepseek-ai/dsh-session';
/** User-configurable heuristic inputs. */
export interface EstimatorConfig {
    /** Approximate text characters represented by one token. */
    readonly charsPerToken?: number;
    /** Fixed framing tokens assigned to each content block. */
    readonly blockOverhead?: number;
    /** Fixed framing tokens assigned to each message or assistant response. */
    readonly roleOverhead?: number;
}
/** Fully resolved positive-density estimator settings. */
export interface EstimatorSpec {
    readonly charsPerToken: number;
    readonly blockOverhead: number;
    readonly roleOverhead: number;
}
/** Validate and default deployment-supplied estimator settings.
 * @param config - user-supplied estimator settings (all fields optional).
 * @returns the fully resolved positive-density estimator settings.
 */
export declare function resolveEstimatorConfig(config: EstimatorConfig): EstimatorSpec;
/** Estimate one text-like block from its accumulated character count.
 * @param characters - accumulated character count of the block.
 * @param spec - resolved estimator settings.
 * @returns the estimated token count.
 */
export declare function estimateTextBlockTokens(characters: number, spec: EstimatorSpec): number;
/** Estimate one tool call from its accumulated name and argument sizes.
 * @param nameCharacters - accumulated tool-name character count.
 * @param argumentCharacters - accumulated JSON-argument character count.
 * @param spec - resolved estimator settings.
 * @returns the estimated token count.
 */
export declare function estimateToolCallBlockTokens(nameCharacters: number, argumentCharacters: number, spec: EstimatorSpec): number;
/** Estimate one assistant response from already priced non-empty blocks.
 * @param blockTokens - per-block token counts; empty means no priced blocks.
 * @param spec - resolved estimator settings.
 * @returns the estimated token count (zero for an empty block list).
 */
export declare function estimateAssistantBlockTokens(blockTokens: readonly number[], spec: EstimatorSpec): number;
/** Estimate model content with the configured provider-independent density.
 * @param blocks - the content blocks to price.
 * @param spec - resolved estimator settings.
 * @returns the estimated token count.
 */
export declare function estimateContentTokens(blocks: readonly ContentBlock[], spec: EstimatorSpec): number;
/** Estimate one model-visible message including role framing.
 * @param message - the message whose content and role are priced.
 * @param spec - resolved estimator settings.
 * @returns the estimated token count.
 */
export declare function estimateMessageTokens(message: Message, spec: EstimatorSpec): number;
/** Estimate the system prompt and tool schemas carried outside the surface.
 * @param header - the epoch header, or null when none was recorded.
 * @param spec - resolved estimator settings.
 * @returns the estimated token count (zero for an absent header).
 */
export declare function estimateHeaderTokens(header: EpochHeader | null, spec: EstimatorSpec): number;
//# sourceMappingURL=estimator.d.ts.map