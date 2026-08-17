import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
import { z as z$1 } from "zod";
import { isSurfaceEvent } from "@deepseek-ai/dsh-session";
//#region src/estimator.ts
/** Validate and default deployment-supplied estimator settings.
* @param config - user-supplied estimator settings (all fields optional).
* @returns the fully resolved positive-density estimator settings.
*/
function resolveEstimatorConfig(config) {
	const known = /* @__PURE__ */ new Set([
		"charsPerToken",
		"blockOverhead",
		"roleOverhead"
	]);
	for (const key of Object.keys(config)) if (!known.has(key)) throw new Error(`live-stats: unknown config key "${key}"`);
	const spec = {
		charsPerToken: config.charsPerToken ?? 4,
		blockOverhead: config.blockOverhead ?? 4,
		roleOverhead: config.roleOverhead ?? 4
	};
	if (!Number.isFinite(spec.charsPerToken) || spec.charsPerToken <= 0) throw new Error("live-stats: charsPerToken must be a positive finite number");
	for (const key of ["blockOverhead", "roleOverhead"]) if (!Number.isInteger(spec[key]) || spec[key] < 0) throw new Error(`live-stats: ${key} must be a non-negative integer`);
	return spec;
}
/** Estimate one text-like block from its accumulated character count.
* @param characters - accumulated character count of the block.
* @param spec - resolved estimator settings.
* @returns the estimated token count.
*/
function estimateTextBlockTokens(characters, spec) {
	return Math.ceil(characters / spec.charsPerToken) + spec.blockOverhead;
}
/** Estimate one tool call from its accumulated name and argument sizes.
* @param nameCharacters - accumulated tool-name character count.
* @param argumentCharacters - accumulated JSON-argument character count.
* @param spec - resolved estimator settings.
* @returns the estimated token count.
*/
function estimateToolCallBlockTokens(nameCharacters, argumentCharacters, spec) {
	return Math.ceil(nameCharacters / spec.charsPerToken) + Math.ceil(argumentCharacters / spec.charsPerToken) + spec.blockOverhead;
}
/** How deeply tool-result content may nest before deep pricing stops. */
const MAX_CONTENT_DEPTH = 128;
/** Cap on the serialized length of an untyped content block used for pricing.
* A gigantic (or pathological) opaque block is priced from a bounded snapshot
* of its JSON so the estimate stays finite and the per-chunk serialize cost
* stays linear in the cap rather than the full structure.
*/
const MAX_UNKNOWN_BLOCK_CHARS = 4096;
/** Price an untyped block from its bounded JSON representation.
* @param block - the untyped content block to price.
* @param spec - resolved estimator settings.
* @returns the estimated token count (capped by the serialized-length bound).
*/
function estimateUnknownBlockTokens(block, spec) {
	const serialized = JSON.stringify(block);
	const length = serialized.length > MAX_UNKNOWN_BLOCK_CHARS ? MAX_UNKNOWN_BLOCK_CHARS : serialized.length;
	return spec.blockOverhead + Math.ceil(length / spec.charsPerToken);
}
/** Estimate model content with the configured provider-independent density.
* @param blocks - the content blocks to price.
* @param spec - resolved estimator settings.
* @returns the estimated token count.
*/
function estimateContentTokens(blocks, spec) {
	return estimateContentBlocks(blocks, spec, 0);
}
/**
* Price content blocks, recursing into tool-result content up to a depth cap.
* The cap turns a pathological (or cyclic) content graph into bounded framing
* charges instead of a stack overflow.
*/
function estimateContentBlocks(blocks, spec, depth) {
	let tokens = 0;
	for (const block of blocks) switch (block.type) {
		case "text":
		case "reasoning":
			tokens += estimateTextBlockTokens(block.text.length, spec);
			break;
		case "tool-call":
			tokens += estimateToolCallBlockTokens(block.name.length, block.arguments.length, spec);
			break;
		case "tool-result":
			tokens += depth >= MAX_CONTENT_DEPTH ? spec.blockOverhead : estimateContentBlocks(block.content, spec, depth + 1) + spec.blockOverhead;
			break;
		default: tokens += estimateUnknownBlockTokens(block, spec);
	}
	return tokens;
}
/** Estimate one model-visible message including role framing.
* @param message - the message whose content and role are priced.
* @param spec - resolved estimator settings.
* @returns the estimated token count.
*/
function estimateMessageTokens(message, spec) {
	return estimateContentTokens(message.content, spec) + spec.roleOverhead;
}
/** Estimate the system prompt and tool schemas carried outside the surface.
* @param header - the epoch header, or null when none was recorded.
* @param spec - resolved estimator settings.
* @returns the estimated token count (zero for an absent header).
*/
function estimateHeaderTokens(header, spec) {
	if (header === void 0 || header === null) return 0;
	let tokens = 0;
	if (header.system !== void 0) tokens += Math.ceil(header.system.length / spec.charsPerToken) + spec.roleOverhead;
	if (header.tools !== void 0 && header.tools.length > 0) tokens += Math.ceil(JSON.stringify(header.tools).length / spec.charsPerToken) + spec.blockOverhead;
	return tokens;
}
//#endregion
//#region src/projection.ts
const zeroBuckets = () => ({
	uncachedInputTokens: 0,
	outputTokens: 0,
	cacheReadTokens: 0,
	cacheWriteTokens: 0
});
const bucketsFrom = (usage) => ({
	uncachedInputTokens: usage.inputTokens,
	outputTokens: usage.outputTokens,
	cacheReadTokens: usage.cacheReadTokens ?? 0,
	cacheWriteTokens: usage.cacheWriteTokens ?? 0
});
const addReplacing = (totals, previous, next) => ({
	uncachedInputTokens: totals.uncachedInputTokens - (previous?.uncachedInputTokens ?? 0) + next.uncachedInputTokens,
	outputTokens: totals.outputTokens - (previous?.outputTokens ?? 0) + next.outputTokens,
	cacheReadTokens: totals.cacheReadTokens - (previous?.cacheReadTokens ?? 0) + next.cacheReadTokens,
	cacheWriteTokens: totals.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0) + next.cacheWriteTokens
});
const projectionSchema = z$1.object({
	uncachedInputTokens: z$1.number().int().nonnegative(),
	outputTokens: z$1.number().int().nonnegative(),
	cacheReadTokens: z$1.number().int().nonnegative(),
	cacheWriteTokens: z$1.number().int().nonnegative(),
	estimated: z$1.boolean(),
	tokensPerSecond: z$1.number().nonnegative().optional()
}).strict();
function surfaceMessage(event) {
	switch (event.type) {
		case "user/message": return event.data;
		case "assistant/message":
		case "tool/result": return event.data.message;
	}
}
function applySurface(state, event, spec) {
	const tokens = estimateMessageTokens(surfaceMessage(event), spec);
	if (event.surfaceOp === "append") {
		state.surface[event.seq] = tokens;
		return {
			surface: state.surface,
			surfaceTokens: state.surfaceTokens + tokens
		};
	}
	const operation = event.surfaceOp;
	if (!Object.prototype.hasOwnProperty.call(state.surface, operation.start) || !Object.prototype.hasOwnProperty.call(state.surface, operation.end) || operation.start > operation.end) throw new Error("live-stats: replace at seq " + event.seq + " has invalid current range " + operation.start + "-" + operation.end);
	let removed = 0;
	for (const seqKey of Object.keys(state.surface)) {
		const seq = Number(seqKey);
		if (seq < operation.start) continue;
		if (seq > operation.end) break;
		removed += state.surface[seq];
		delete state.surface[seq];
	}
	state.surface[event.seq] = tokens;
	return {
		surface: state.surface,
		surfaceTokens: state.surfaceTokens - removed + tokens
	};
}
/** Per-block token contribution used by the incremental output pricing. */
function blockEstimate(block, spec) {
	switch (block.kind) {
		case "text":
		case "reasoning": return estimateTextBlockTokens(block.characters, spec);
		case "tool-call": return estimateToolCallBlockTokens(block.nameCharacters, block.argumentCharacters, spec);
		case "fixed": return block.tokens;
	}
}
/** Rewrite one block slot and fold the estimate delta into the active sums. */
function writeBlock(active, index, previous, next, spec) {
	active.pricedTokens += blockEstimate(next, spec) - (previous === void 0 ? 0 : blockEstimate(previous, spec));
	if (previous === void 0) active.pricedBlocks += 1;
	active.blocks[index] = next;
}
/** Mutate the active step in place for one stream chunk.
* @param active - the active step whose blocks slot and priced sums are updated.
* @param chunk - the stream delta to apply.
* @param spec - resolved estimator settings.
* @returns true when the chunk changed a block (no-ops return false untouched).
*/
function applyOutputChunk(active, chunk, spec) {
	switch (chunk.type) {
		case "text-delta": {
			if (chunk.text === "") return false;
			const previous = active.blocks[chunk.index];
			writeBlock(active, chunk.index, previous, {
				kind: "text",
				characters: (previous?.kind === "text" ? previous.characters : 0) + chunk.text.length
			}, spec);
			return true;
		}
		case "reasoning-delta": {
			if (chunk.text === "") return false;
			const previous = active.blocks[chunk.index];
			writeBlock(active, chunk.index, previous, {
				kind: "reasoning",
				characters: (previous?.kind === "reasoning" ? previous.characters : 0) + chunk.text.length
			}, spec);
			return true;
		}
		case "tool-call-delta": {
			if (chunk.name === void 0 && chunk.argumentsDelta === "") return false;
			const previous = active.blocks[chunk.index];
			writeBlock(active, chunk.index, previous, {
				kind: "tool-call",
				nameCharacters: chunk.name?.length ?? (previous?.kind === "tool-call" ? previous.nameCharacters : 0),
				argumentCharacters: (previous?.kind === "tool-call" ? previous.argumentCharacters : 0) + chunk.argumentsDelta.length
			}, spec);
			return true;
		}
		case "block-end": {
			const previous = active.blocks[chunk.index];
			writeBlock(active, chunk.index, previous, {
				kind: "fixed",
				tokens: estimateContentTokens([chunk.block], spec)
			}, spec);
			return true;
		}
		default: return false;
	}
}
function rateOf(step) {
	if (step.firstOutputTime === void 0 || step.latestOutputTime === void 0) return;
	const elapsedMs = step.latestOutputTime - step.firstOutputTime;
	if (elapsedMs <= 0 || step.buckets.outputTokens <= 0) return;
	return step.buckets.outputTokens * 1e3 / elapsedMs;
}
function exactStep(step, usage, time) {
	return {
		...step,
		buckets: bucketsFrom(usage),
		exact: true,
		blocks: {},
		pricedTokens: 0,
		pricedBlocks: 0,
		...usage.outputTokens > 0 ? {
			firstOutputTime: step.firstOutputTime ?? time,
			latestOutputTime: time
		} : {}
	};
}
function view(state) {
	const active = state.active;
	const previous = active !== null && state.last?.turn === active.turn && state.last.step === active.step ? state.last : void 0;
	const buckets = active === null ? state.settled : addReplacing(state.settled, previous?.buckets, active.buckets);
	const estimates = state.settledEstimates - (previous?.estimated === true ? 1 : 0) + (active !== null && !active.exact ? 1 : 0);
	const rate = active === null ? state.last?.tokensPerSecond ?? void 0 : rateOf(active) ?? state.last?.tokensPerSecond ?? void 0;
	return {
		...buckets,
		estimated: estimates > 0,
		...rate === void 0 ? {} : { tokensPerSecond: rate }
	};
}
/** Create the replayable live usage projection consumed by DSH Web and the TPS row.
* @param spec - resolved estimator settings for the fold.
* @returns the replayable `liveTokenUsage` projection definition.
*/
function createLiveTokenUsageProjectionDefinition(spec) {
	return {
		key: "liveTokenUsage",
		schema: projectionSchema,
		init: () => ({
			settled: zeroBuckets(),
			settledEstimates: 0,
			last: null,
			surface: {},
			surfaceTokens: 0,
			header: null,
			active: null
		}),
		apply: (state, event) => {
			let next = state;
			if (event.type === "step/start") next = {
				...next,
				active: {
					...event.data,
					buckets: {
						...zeroBuckets(),
						uncachedInputTokens: estimateHeaderTokens(state.header, spec) + state.surfaceTokens
					},
					exact: false,
					blocks: {},
					pricedTokens: 0,
					pricedBlocks: 0
				}
			};
			else if (event.type === "request/header") next = {
				...next,
				header: event.data.header,
				...next.active === null ? {} : { active: {
					...next.active,
					buckets: {
						...next.active.buckets,
						uncachedInputTokens: estimateHeaderTokens(event.data.header, spec) + state.surfaceTokens
					}
				} }
			};
			else if (event.type === "assistant/chunk" && next.active !== null) {
				const { chunk } = event.data;
				if (chunk.type === "usage") next = {
					...next,
					active: exactStep(next.active, chunk.usage, event.time)
				};
				else if (!next.active.exact) {
					const active = next.active;
					if (applyOutputChunk(active, chunk, spec)) {
						const tokens = active.pricedBlocks === 0 ? 0 : active.pricedTokens + spec.roleOverhead;
						active.buckets = {
							...active.buckets,
							outputTokens: tokens
						};
						if (tokens > 0) {
							if (active.firstOutputTime === void 0) active.firstOutputTime = event.time;
							active.latestOutputTime = event.time;
						}
					}
				}
			} else if (event.type === "assistant/message" && next.active !== null) next = {
				...next,
				active: event.data.usage === void 0 ? {
					...next.active,
					...next.active.buckets.outputTokens > 0 ? { latestOutputTime: event.time } : {}
				} : exactStep(next.active, event.data.usage, event.time)
			};
			else if (event.type === "step/end" && next.active !== null) {
				const active = next.active;
				const rate = rateOf(active);
				const previous = next.last?.turn === active.turn && next.last.step === active.step ? next.last : void 0;
				next = {
					...next,
					settled: addReplacing(next.settled, previous?.buckets, active.buckets),
					settledEstimates: next.settledEstimates - (previous?.estimated === true ? 1 : 0) + (!active.exact ? 1 : 0),
					last: {
						turn: active.turn,
						step: active.step,
						buckets: active.buckets,
						estimated: !active.exact,
						tokensPerSecond: rate ?? state.last?.tokensPerSecond ?? null
					},
					active: null
				};
			} else if (event.type === "turn/end" && event.data.reason.kind !== "completed" && next.last?.turn === event.data.turn && next.last.estimated) next = {
				...next,
				settled: addReplacing(next.settled, next.last.buckets, zeroBuckets()),
				settledEstimates: next.settledEstimates - 1,
				last: null
			};
			if (isSurfaceEvent(event)) next = {
				...next,
				...applySurface(next, event, spec)
			};
			return next;
		},
		view,
		stateVersion: 3
	};
}
//#endregion
//#region src/index.ts
/** Services required by the host projection plugin. */
const inject = ["sessionProjections"];
/**
* Settings namespace of the live-stats capability — the section the web
* settings surface edits. Spelled here rather than imported so the browser
* half can spell the same value without depending on a Host package.
*/
const LIVE_STATS_SETTINGS_NAMESPACE = settingsNamespace("live-stats");
/** Runtime schema for {@link Config}. */
const Config = z.object({
	charsPerToken: z.number().min(.01).default(4),
	blockOverhead: z.number().step(1).min(0).default(4),
	roleOverhead: z.number().step(1).min(0).default(4),
	enabled: z.boolean().default(true)
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
function apply(ctx, config = {}) {
	let current = () => config ?? {};
	let disposeProjection;
	const rebuild = () => {
		if (disposeProjection !== void 0) {
			disposeProjection();
			disposeProjection = void 0;
		}
		if ((current().enabled ?? true) === false) return;
		const source = current();
		const spec = resolveEstimatorConfig({
			...source.charsPerToken === void 0 ? {} : { charsPerToken: source.charsPerToken },
			...source.blockOverhead === void 0 ? {} : { blockOverhead: source.blockOverhead },
			...source.roleOverhead === void 0 ? {} : { roleOverhead: source.roleOverhead }
		});
		disposeProjection = ctx.sessionProjections.register(createLiveTokenUsageProjectionDefinition(spec));
	};
	installSettingsSection(ctx, LIVE_STATS_SETTINGS_NAMESPACE, Config, config ?? {}, {
		setSource: (source) => {
			current = source;
		},
		onChange: rebuild
	});
	rebuild();
}
//#endregion
export { Config, LIVE_STATS_SETTINGS_NAMESPACE, apply, createLiveTokenUsageProjectionDefinition, inject, resolveEstimatorConfig };
