import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from 'schemastery';
import { resolveEstimatorConfig } from "./estimator.js";
import { createLiveTokenUsageProjectionDefinition } from "./projection.js";
/** Services required by the host projection plugin. */
export const inject = ['sessionProjections'];
/**
 * Settings namespace of the live-stats capability — the section the web
 * settings surface edits. Spelled here rather than imported so the browser
 * half can spell the same value without depending on a Host package.
 */
export const LIVE_STATS_SETTINGS_NAMESPACE = settingsNamespace('live-stats');
/** Runtime schema for {@link Config}. */
export const Config = z.object({
    charsPerToken: z.number().min(0.01).default(4),
    blockOverhead: z.number().step(1).min(0).default(4),
    roleOverhead: z.number().step(1).min(0).default(4),
    enabled: z.boolean().default(true),
});
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
export function apply(ctx, config = {}) {
    // The authoritative estimation source: the settings scope once the web
    // settings surface serves the namespace, the composition entry otherwise
    // (installSettingsSection swaps it on attach and detach).
    let current = () => config ?? {};
    let disposeProjection;
    const rebuild = () => {
        if (disposeProjection !== undefined) {
            disposeProjection();
            disposeProjection = undefined;
        }
        if ((current().enabled ?? true) === false)
            return;
        const source = current();
        const spec = resolveEstimatorConfig({
            ...(source.charsPerToken === undefined ? {} : { charsPerToken: source.charsPerToken }),
            ...(source.blockOverhead === undefined ? {} : { blockOverhead: source.blockOverhead }),
            ...(source.roleOverhead === undefined ? {} : { roleOverhead: source.roleOverhead }),
        });
        disposeProjection = ctx.sessionProjections.register(createLiveTokenUsageProjectionDefinition(spec));
    };
    installSettingsSection(ctx, LIVE_STATS_SETTINGS_NAMESPACE, Config, config ?? {}, {
        setSource: (source) => { current = source; },
        onChange: rebuild,
    });
    rebuild();
}
export { createLiveTokenUsageProjectionDefinition } from "./projection.js";
export { resolveEstimatorConfig } from "./estimator.js";
