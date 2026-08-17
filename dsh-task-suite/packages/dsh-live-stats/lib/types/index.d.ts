import type { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
import type { EstimatorConfig } from './estimator.ts';
/** Services required by the host projection plugin. */
export declare const inject: string[];
/**
 * Settings namespace of the live-stats capability — the section the web
 * settings surface edits. Spelled here rather than imported so the browser
 * half can spell the same value without depending on a Host package.
 */
export declare const LIVE_STATS_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Plugin configuration for provider-independent token estimation. */
export interface Config extends EstimatorConfig {
    /** Master switch for the plugin (browser half + host projection). */
    enabled?: boolean;
}
/** Runtime schema for {@link Config}. */
export declare const Config: z<Config>;
/**
 * Register the replayable live-token projection.
 *
 * The projection definition freezes its estimator spec into the fold's
 * closure at construction, so a settings edit takes effect by re-registering
 * the definition against the authoritative source. `sessionProjections.register`
 * returns the exact disposer, letting us drop the stale fold and fold the
 * session log afresh with the new parameters — the live-estimate row simply
 * re-derives without a restart.
 * @param ctx - host plugin context carrying sessionProjections.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export declare function apply(ctx: Context, config?: Config): void;
export { createLiveTokenUsageProjectionDefinition } from './projection.ts';
export { resolveEstimatorConfig } from './estimator.ts';
export type { EstimatorConfig, EstimatorSpec } from './estimator.ts';
//# sourceMappingURL=index.d.ts.map