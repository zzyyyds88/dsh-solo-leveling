import { a as rpcReceiptSchema, c as RpcId, f as truncateUnicodeCodePoints, i as rpcIdSchema, o as serverRequestSchema, r as rpcErrorSchema, s as serverResponseSchema } from "./rpc.schema-DH_Sfgom.js";
import { z } from "zod";
//#region src/api/sessions.schema.ts
/**
* sessions domain zod schemas (names derived from map keys: sessionListRequestSchema /
* sessionListValueSchema). SessionEvent passthrough = strict envelope (type/seq/time) + wide
* data: the merge-extensible event API keeps an unknown-type branch at the union level,
* with no field-level passthrough. SessionId brand cast point: sessionIdSchema, and only there.
*/
/** SessionId: one brand cast after schema validation (the only cast point in this domain). */
const sessionIdSchema = z.string().min(1);
/** MessageId: one brand cast after non-empty string validation. */
const messageIdSchema$1 = z.string().min(1);
/**
* WorkspaceId: the workspace domain's one brand cast. Hosted here rather
* than in workspace.schema because session.create references it while
* workspace.schema references sessionIdSchema — schema modules must stay a
* DAG (both casts used at module top level; a cycle is a load-time TDZ).
*/
const workspaceIdSchema = z.string().min(1);
/** SessionEvent passthrough: strict envelope, wide data (the client fold handles unknown types via its documented default). */
const sessionEventSchema = z.object({
	type: z.string(),
	seq: z.number().int().nonnegative(),
	time: z.number(),
	data: z.unknown(),
	sourceEventSeqs: z.array(z.number()).optional(),
	surfaceOp: z.unknown().optional(),
	ignorable: z.literal(true).optional()
});
/** SessionSummary row of session.list (`projections` reuses the history block's shape and schema). */
const sessionSummarySchema = z.object({
	sessionId: sessionIdSchema,
	updatedAt: z.number(),
	running: z.boolean(),
	blank: z.boolean(),
	parentSessionId: sessionIdSchema.optional(),
	origin: z.literal("subagent").optional(),
	cwd: z.string().optional(),
	agentPreset: z.string().optional(),
	projections: z.lazy(() => sessionProjectionsBlockSchema).optional()
});
/** session.list request payload (cursor is a reserved seat, unimplemented in v1). */
const sessionListRequestSchema = z.object({ cursor: z.string().optional() });
/** session.list response value. */
const sessionListValueSchema = z.object({ items: z.array(sessionSummarySchema) });
/** session.search request payload. */
const sessionSearchRequestSchema = z.object({ query: z.string().trim().min(1).max(500).refine((query) => !query.includes("\0"), { message: "search query must not contain NUL" }) });
/** One session.search result. */
const sessionSearchItemSchema = z.object({
	sessionId: sessionIdSchema,
	snippet: z.string().refine((snippet) => truncateUnicodeCodePoints(snippet, 240) === snippet, { message: `search snippet must contain at most 240 Unicode code points` })
});
/** session.search response value. */
const sessionSearchValueSchema = z.object({
	items: z.array(sessionSearchItemSchema).max(20),
	hasMore: z.boolean()
});
/** session.create request payload (at most one of workspaceId / cwd). */
const sessionCreateRequestSchema = z.object({
	workspaceId: workspaceIdSchema.optional(),
	cwd: z.string().optional(),
	sessionId: sessionIdSchema.optional(),
	agentPreset: z.string().optional()
}).refine((payload) => payload.workspaceId === void 0 || payload.cwd === void 0, { message: "session.create accepts workspaceId or cwd, not both" });
/** session.create response value. */
const sessionCreateValueSchema = z.object({
	sessionId: sessionIdSchema,
	agentPreset: z.string().optional()
});
/** session.rename request payload (raw title; host-side normalization decides acceptance). */
const sessionRenameRequestSchema = z.object({
	sessionId: sessionIdSchema,
	title: z.string()
});
/** session.rename response value (the normalized accepted title and its event seq). */
const sessionRenameValueSchema = z.object({
	title: z.string().min(1),
	seq: z.number().int().nonnegative()
});
/** session.fork request payload (atSeq anchors the completed-turn cut). */
const sessionForkRequestSchema = z.object({
	sessionId: sessionIdSchema,
	atSeq: z.number().int().nonnegative().optional()
});
/** session.fork response value (the child session id). */
const sessionForkValueSchema = z.object({ sessionId: sessionIdSchema });
/** session.history request payload (beforeSeq/maxMessages page backwards from the window tail). */
const sessionHistoryRequestSchema = z.object({
	sessionId: sessionIdSchema,
	beforeSeq: z.number().int().nonnegative().optional(),
	maxMessages: z.number().int().positive().optional()
});
/** Complete provider/model selection. */
const modelSelectionSchema = z.object({
	provider: z.string().min(1),
	model: z.string().min(1),
	reasoningEffort: z.string().min(1).optional()
});
/** One adapter-owned reasoning effort. */
const modelReasoningEffortSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional()
});
/** Exact-model reasoning metadata. */
const modelReasoningSchema = z.object({
	efforts: z.array(modelReasoningEffortSchema).min(1),
	defaultEffort: z.string().min(1).optional()
});
/** One advisory model entry inside a provider group. */
const modelCatalogModelSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
	reasoning: modelReasoningSchema.optional()
});
/** One successfully loaded provider group. */
const modelProviderGroupSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	models: z.array(modelCatalogModelSchema)
});
/** One provider-local catalog failure. */
const modelCatalogFailureSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	message: z.string()
});
/**
* ToolEventView passthrough: lock only the `for` discriminant and the presence
* of a card-tagged `view` object. The view interior is a host-computed product
* the client reads without echoing back; deep-validating it would hand-copy
* the dsh-tools vocabulary into this schema and drift with it.
*/
const toolEventViewSchema = z.discriminatedUnion("for", [z.object({
	for: z.literal("call"),
	view: z.looseObject({ card: z.string() })
}), z.object({
	for: z.literal("result"),
	view: z.looseObject({ card: z.string() })
})]);
/** One session.history item: the session event plus its optional host-computed tool view. */
const historyEntrySchema = z.object({
	event: sessionEventSchema,
	view: toolEventViewSchema.optional()
});
/**
* Projection baseline passthrough: `values` stays a wide record — each value
* was already parsed by its provider's own schema on the host side, and
* deep-validating here would import every domain's schema into the carrier.
*/
const sessionProjectionsBlockSchema = z.object({
	asOfSeq: z.number().int().min(-1),
	values: z.record(z.string(), z.unknown())
});
/** Host-side validation for the persisted Session-list projection. */
const sessionListMetadataProjectionSchema = z.object({
	blank: z.boolean(),
	lastPromptAt: z.number().nullable()
});
/**
* imageLimits projection unit schema (host-side view validation). zod widens
* `readonly ImageMediaType[]` to `string[]`; on the JSON wire the two
* serialize identically, so the cast records exactly that widening.
*/
const imageLimitsProjectionSchema = z.object({
	maxImageBytes: z.number().int().positive(),
	maxImagesPerMessage: z.number().int().positive(),
	maxMessageImageBytes: z.number().int().positive(),
	maxImagePixels: z.number().int().positive(),
	mediaTypes: z.array(z.string())
});
/** session.history response value (projections rides the tail page only). */
const sessionHistoryValueSchema = z.object({
	events: z.array(historyEntrySchema),
	hasMore: z.boolean(),
	projections: sessionProjectionsBlockSchema.optional()
});
/** session.models request payload. */
const sessionModelsRequestSchema = z.object({ sessionId: sessionIdSchema });
/** session.models response value. */
const sessionModelsValueSchema = z.object({
	current: modelSelectionSchema,
	routable: z.boolean(),
	groups: z.array(modelProviderGroupSchema),
	failures: z.array(modelCatalogFailureSchema)
});
/** session.selectModel request payload. */
const sessionSelectModelRequestSchema = z.object({
	sessionId: sessionIdSchema,
	provider: z.string().min(1),
	model: z.string().min(1),
	reasoningEffort: z.string().min(1).optional()
});
/** session.selectModel response value. */
const sessionSelectModelValueSchema = z.object({ selected: modelSelectionSchema });
/** ContentBlock passthrough: core is merge-extensible — the type discriminant envelope is strict, the rest stays wide. */
const contentBlockSchema = z.looseObject({ type: z.string() });
/** Raster image media types accepted by the version-one browser wire. */
const imageMediaTypeSchema = z.union([
	z.literal("image/png"),
	z.literal("image/jpeg"),
	z.literal("image/webp"),
	z.literal("image/gif")
]);
/** Prompt wire content is intentionally narrower than merge-extensible durable core content. */
const promptContentPartSchema = z.discriminatedUnion("type", [z.object({
	type: z.literal("text"),
	text: z.string()
}), z.object({
	type: z.literal("image"),
	mediaType: imageMediaTypeSchema,
	data: z.string(),
	name: z.string().optional()
})]);
/** session.prompt request payload, including optional browser-local request provenance. */
const sessionPromptRequestSchema = z.object({
	sessionId: sessionIdSchema,
	mode: z.union([z.literal("queue"), z.literal("steer")]),
	content: z.array(promptContentPartSchema),
	clientTimeZone: z.string().optional()
});
/** session.prompt response value (the command slot appears only when the prompt dispatched a slash command). */
const sessionPromptValueSchema = z.object({
	accepted: z.literal(true),
	command: z.object({
		kind: z.literal("success"),
		text: z.string().optional()
	}).optional()
});
/** Opaque attachment id after string-shape validation. */
const attachmentIdSchema = z.string().min(1);
/** Durable image reference returned from the authenticated session lookup. */
const imageAttachmentRefSchema = z.object({
	attachmentId: attachmentIdSchema,
	mediaType: imageMediaTypeSchema,
	bytes: z.number().int().positive(),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	name: z.string().optional()
});
/** session.attachment request payload. */
const sessionAttachmentRequestSchema = z.object({
	sessionId: sessionIdSchema,
	attachmentId: attachmentIdSchema
});
/** session.attachment response value. */
const sessionAttachmentValueSchema = z.object({
	attachment: imageAttachmentRefSchema,
	data: z.string()
});
/** session.updateQueue request payload. */
const sessionUpdateQueueRequestSchema = z.object({
	sessionId: sessionIdSchema,
	itemId: messageIdSchema$1,
	action: z.discriminatedUnion("kind", [
		z.object({
			kind: z.literal("edit"),
			content: z.array(contentBlockSchema)
		}),
		z.object({ kind: z.literal("remove") }),
		z.object({ kind: z.literal("steer") })
	])
});
/** session.updateQueue response value. */
const sessionUpdateQueueValueSchema = z.object({ accepted: z.literal(true) });
/** session.cancel request payload. */
const sessionCancelRequestSchema = z.object({ sessionId: sessionIdSchema });
/** session.cancel response value. */
const sessionCancelValueSchema = z.object({ accepted: z.literal(true) });
//#endregion
//#region src/api/approvals.schema.ts
/**
* approvals domain zod schemas (respond is a client-response; the payload schema serves
* the /api/respond endpoint's second parse after routing via the pending table).
* ApprovalRequestId brand cast point: one.
*/
/** ApprovalRequestId: one brand cast after schema validation (the only cast point in this domain). */
const approvalRequestIdSchema = z.string().min(1);
/** Approval answer payload (the result.value slot of a client-response). */
const approvalResponsePayloadSchema = z.object({
	sessionId: sessionIdSchema,
	approvalId: approvalRequestIdSchema,
	outcome: z.union([z.literal("allowed-once"), z.literal("rejected")])
});
//#endregion
//#region src/api/host.schema.ts
/**
* host domain zod schemas (names derived from map keys).
*/
/** host.describe request payload (empty object literal). */
const hostDescribeRequestSchema = z.object({});
/** host.describe response value. */
const hostDescribeValueSchema = z.object({
	version: z.string(),
	cwd: z.string(),
	provider: z.string().optional(),
	model: z.string().optional(),
	attachedSessions: z.number().int().nonnegative(),
	canOpenPath: z.boolean()
});
/** host.pickDirectory request payload (empty object literal). */
const hostPickDirectoryRequestSchema = z.object({});
/** host.pickDirectory response value; null means the user cancelled. */
const hostPickDirectoryValueSchema = z.object({ path: z.string().nullable() });
/** Directory row shared by listing entries and breadcrumb crumbs. */
const directoryEntrySchema = z.object({
	name: z.string(),
	path: z.string(),
	hidden: z.boolean()
});
/** host.listDirectory request payload; an absent path lists the home directory. */
const hostListDirectoryRequestSchema = z.object({ path: z.string().optional() });
/** host.listDirectory response value. */
const hostListDirectoryValueSchema = z.object({
	path: z.string(),
	home: z.string(),
	crumbs: z.array(directoryEntrySchema),
	entries: z.array(directoryEntrySchema),
	truncated: z.boolean()
});
/** host.createDirectory request payload: name must be one plain path segment. */
const hostCreateDirectoryRequestSchema = z.object({
	path: z.string(),
	name: z.string()
}).refine((payload) => payload.name.trim() !== "" && payload.name !== "." && payload.name !== ".." && !/[/\\]/.test(payload.name), { message: "host.createDirectory requires a single non-blank path segment name" });
/** host.createDirectory response value: the created directory's absolute path. */
const hostCreateDirectoryValueSchema = z.object({ path: z.string() });
/** host.openPath request payload. */
const hostOpenPathRequestSchema = z.object({ path: z.string().min(1) });
/** host.openPath response value. */
const hostOpenPathValueSchema = z.object({ opened: z.literal(true) });
//#endregion
//#region src/api/workspace.schema.ts
/**
* workspace domain zod schemas (names derived from map keys). The
* WorkspaceId brand cast lives in sessions.schema (see the note there) and
* is re-exported here as the domain-local name.
*/
/** WorkspaceView row of every workspace.* response. */
const workspaceViewSchema = z.object({
	workspaceId: workspaceIdSchema,
	path: z.string(),
	title: z.string(),
	sessionIds: z.array(sessionIdSchema),
	createdAt: z.string(),
	updatedAt: z.string()
});
/** workspace.list request payload (empty object literal). */
const workspaceListRequestSchema = z.object({});
/** workspace.list response value. */
const workspaceListValueSchema = z.object({
	items: z.array(workspaceViewSchema),
	archivedSessionIds: z.array(sessionIdSchema)
});
/** workspace.create request payload: the existing directory to adopt. */
const workspaceCreateRequestSchema = z.object({ path: z.string() });
/** workspace.create response value. */
const workspaceCreateValueSchema = z.object({
	workspace: workspaceViewSchema,
	created: z.boolean()
});
/** workspace.rename request payload: the new title must be non-blank. */
const workspaceRenameRequestSchema = z.object({
	workspaceId: workspaceIdSchema,
	title: z.string()
}).refine((payload) => payload.title.trim() !== "", { message: "workspace.rename requires a non-blank title" });
/** workspace.rename response value. */
const workspaceRenameValueSchema = z.object({ workspace: workspaceViewSchema });
/** workspace.delete request payload. */
const workspaceDeleteRequestSchema = z.object({ workspaceId: workspaceIdSchema });
/** workspace.delete response value. */
const workspaceDeleteValueSchema = z.object({ deleted: z.literal(true) });
/** workspace.insertBefore request payload (anchor omitted = append to end). */
const workspaceInsertBeforeRequestSchema = z.object({
	workspaceId: workspaceIdSchema,
	beforeWorkspaceId: workspaceIdSchema.optional()
});
/** workspace.insertBefore response value: the complete durable display order. */
const workspaceInsertBeforeValueSchema = z.object({ workspaceIds: z.array(workspaceIdSchema) });
/** workspace.insertSessionBefore request payload (anchor omitted = append to end). */
const workspaceInsertSessionBeforeRequestSchema = z.object({
	workspaceId: workspaceIdSchema,
	sessionId: sessionIdSchema,
	beforeSessionId: sessionIdSchema.optional()
});
/** workspace.insertSessionBefore response value. */
const workspaceInsertSessionBeforeValueSchema = z.object({ workspace: workspaceViewSchema });
/** workspace.archiveSession request payload. */
const workspaceArchiveSessionRequestSchema = z.object({ sessionId: sessionIdSchema });
/** workspace.archiveSession response value: the full updated archive set. */
const workspaceArchiveSessionValueSchema = z.object({ archivedSessionIds: z.array(sessionIdSchema) });
//#endregion
//#region src/api/skills.schema.ts
/**
* skills domain zod schemas (names derived from map keys: skillListRequestSchema /
* skillListValueSchema).
*/
/** SkillEntry row of skill.list. */
const skillEntrySchema = z.object({
	name: z.string().min(1),
	description: z.string(),
	whenToUse: z.string().optional(),
	modelInvocable: z.boolean()
});
/** skill.list request payload. */
const skillListRequestSchema = z.object({ sessionId: sessionIdSchema });
/** skill.list response value. */
const skillListValueSchema = z.object({ skills: z.array(skillEntrySchema) });
//#endregion
//#region src/api/agent-presets.schema.ts
/**
* agent-presets domain zod schemas (names derived from map keys:
* agentPresetListRequestSchema / agentPresetListValueSchema).
*/
/** AgentPresetEntry row of agentPreset.list. */
const agentPresetEntrySchema = z.object({
	id: z.string().min(1),
	trust: z.union([z.literal("system"), z.literal("user")]),
	isDefault: z.boolean(),
	name: z.string().optional(),
	description: z.string().optional(),
	broken: z.string().min(1).optional()
});
/** agentPreset.list request payload. */
const agentPresetListRequestSchema = z.object({});
/** agentPreset.list response value. */
const agentPresetListValueSchema = z.object({
	presets: z.array(agentPresetEntrySchema),
	authorable: z.boolean(),
	hasDocument: z.boolean()
});
/** agentPreset.select request payload. */
const agentPresetSelectRequestSchema = z.object({
	sessionId: sessionIdSchema,
	agentPreset: z.string().min(1)
});
/** agentPreset.select response value. */
const agentPresetSelectValueSchema = z.object({ agentPreset: z.string() });
/** agentPreset.read request payload. */
const agentPresetReadRequestSchema = z.object({ agentPreset: z.string().min(1) });
/** agentPreset.read response value. */
const agentPresetReadValueSchema = z.object({
	agentPreset: z.string(),
	trust: z.union([z.literal("system"), z.literal("user")]),
	content: z.string(),
	name: z.string().optional(),
	description: z.string().optional()
});
/** agentPreset.copy request payload. */
const agentPresetCopyRequestSchema = z.object({
	from: z.string().min(1),
	agentPreset: z.string().min(1),
	name: z.string().optional()
});
/** agentPreset.copy response value. */
const agentPresetCopyValueSchema = z.object({ agentPreset: z.string() });
/** agentPreset.openDocument request payload. */
const agentPresetOpenDocumentRequestSchema = z.object({ agentPreset: z.string().min(1) });
/** agentPreset.openDocument response value. */
const agentPresetOpenDocumentValueSchema = z.union([z.object({ opened: z.literal(true) }), z.object({
	opened: z.literal(false),
	path: z.string()
})]);
/** agentPreset.remove request payload. */
const agentPresetRemoveRequestSchema = z.object({ agentPreset: z.string().min(1) });
/** agentPreset.remove response value. */
const agentPresetRemoveValueSchema = z.object({});
//#endregion
//#region src/api/goals.schema.ts
/**
* goals domain zod schemas. Mutation-only shapes: every value schema is a
* `{ ref }` acknowledgement (clear: `{ cleared }`) — the current goal state
* travels exclusively on the 'goal' session projection.
*/
/** GoalRef schema. */
const goalRefSchema = z.object({
	id: z.string(),
	revision: z.number().int().positive()
});
/** Shared `{ ref }` acknowledgement value of every non-clear mutation. */
const goalRefValueSchema = z.object({ ref: goalRefSchema });
/** goal.create request payload. */
const goalCreateRequestSchema = z.object({
	sessionId: z.string(),
	objective: z.string().min(1),
	maxGoalRounds: z.number().int().positive().optional()
});
/** goal.create response value. */
const goalCreateValueSchema = goalRefValueSchema;
/** goal.edit request payload. */
const goalEditRequestSchema = z.object({
	sessionId: z.string(),
	ref: goalRefSchema,
	objective: z.string().min(1).optional(),
	maxGoalRounds: z.number().int().positive().optional()
}).refine((value) => value.objective !== void 0 || value.maxGoalRounds !== void 0, { message: "goal.edit requires objective or maxGoalRounds" });
/** goal.edit response value. */
const goalEditValueSchema = goalRefValueSchema;
/** goal.pause request payload. */
const goalPauseRequestSchema = z.object({
	sessionId: z.string(),
	ref: goalRefSchema
});
/** goal.pause response value. */
const goalPauseValueSchema = goalRefValueSchema;
/** goal.resume request payload. */
const goalResumeRequestSchema = z.object({
	sessionId: z.string(),
	ref: goalRefSchema
});
/** goal.resume response value. */
const goalResumeValueSchema = goalRefValueSchema;
/** goal.complete request payload. */
const goalCompleteRequestSchema = z.object({
	sessionId: z.string(),
	ref: goalRefSchema
});
/** goal.complete response value. */
const goalCompleteValueSchema = goalRefValueSchema;
/** goal.clear request payload. */
const goalClearRequestSchema = z.object({
	sessionId: z.string(),
	ref: goalRefSchema
});
/** goal.clear response value. */
const goalClearValueSchema = z.object({ cleared: z.literal(true) });
//#endregion
//#region src/api/settings.schema.ts
/**
* settings domain zod schemas (names derived from map keys: settingsDescribeRequestSchema /
* settingsDescribeValueSchema / settingsUpdate* / settingsReplace*).
*/
/** One redacted secret slot. */
const settingsSecretViewSchema = z.object({
	path: z.array(z.string()),
	set: z.boolean()
});
/** SettingsNamespaceView row of settings.describe and the write responses. */
const settingsNamespaceViewSchema = z.object({
	ns: z.string().min(1),
	schema: z.unknown(),
	value: z.unknown(),
	base: z.unknown().optional(),
	user: z.unknown().optional(),
	applies: z.union([z.literal("live"), z.literal("restart")]),
	secrets: z.array(settingsSecretViewSchema),
	revision: z.number()
});
/** settings.describe request payload. */
const settingsDescribeRequestSchema = z.object({});
/** settings.describe response value. */
const settingsDescribeValueSchema = z.object({
	writable: z.boolean(),
	hasDocument: z.boolean(),
	namespaces: z.array(settingsNamespaceViewSchema)
});
/** settings.openDocument request payload. */
const settingsOpenDocumentRequestSchema = z.object({});
/** settings.openDocument response value. */
const settingsOpenDocumentValueSchema = z.object({ opened: z.literal(true) });
/** settings.update request payload. */
const settingsUpdateRequestSchema = z.object({
	ns: z.string().min(1),
	patch: z.record(z.string(), z.unknown()),
	expectedRevision: z.number().optional()
});
/** settings.update response value: the namespace's new redacted view. */
const settingsUpdateValueSchema = settingsNamespaceViewSchema;
/** settings.replace request payload. */
const settingsReplaceRequestSchema = z.object({
	ns: z.string().min(1),
	section: z.record(z.string(), z.unknown()),
	expectedRevision: z.number().optional()
});
/** One path-addressed edit of settings.mutate. */
const settingsPathOpSchema = z.discriminatedUnion("op", [z.object({
	op: z.literal("set"),
	path: z.array(z.string()),
	value: z.unknown()
}), z.object({
	op: z.literal("unset"),
	path: z.array(z.string())
})]);
/** settings.mutate request payload. */
const settingsMutateRequestSchema = z.object({
	ns: z.string().min(1),
	ops: z.array(settingsPathOpSchema),
	expectedRevision: z.number().optional()
});
/** settings.mutate response value: the namespace's new redacted view. */
const settingsMutateValueSchema = settingsNamespaceViewSchema;
/** settings.replace response value. */
const settingsReplaceValueSchema = settingsNamespaceViewSchema;
//#endregion
//#region src/api/credentials.schema.ts
/**
* credentials domain zod schemas (names derived from map keys:
* credentialsDescribeRequestSchema / credentialsDescribeValueSchema / …).
* The reference-name pattern mirrors the seam's `credentialRef` guard so an
* invalid name fails as `bad-request` before reaching the service.
*/
/** POSIX-portable environment-variable name (the seam's `credentialRef` pattern). */
const credentialRefNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
/** CredentialView entry of credentials.describe. */
const credentialViewSchema = z.object({
	configured: z.boolean(),
	source: z.string().optional(),
	writable: z.boolean()
});
/** credentials.describe request payload. */
const credentialsDescribeRequestSchema = z.object({ refs: z.array(credentialRefNameSchema).max(64) });
/** credentials.describe response value. */
const credentialsDescribeValueSchema = z.object({ credentials: z.record(z.string(), credentialViewSchema) });
/** credentials.set request payload: the one direction a value crosses this wire. */
const credentialsSetRequestSchema = z.object({
	ref: credentialRefNameSchema,
	value: z.string().min(1)
});
/** credentials.set response value. */
const credentialsSetValueSchema = z.object({});
/** credentials.unset request payload. */
const credentialsUnsetRequestSchema = z.object({ ref: credentialRefNameSchema });
/** credentials.unset response value. */
const credentialsUnsetValueSchema = z.object({});
//#endregion
//#region src/api/llm.schema.ts
/**
* llm domain zod schemas (names derived from map keys: llmProvidersRequestSchema /
* llmProvidersValueSchema / llmModelsRequestSchema / llmModelsValueSchema).
*/
/** ConfigurableProviderView row of llm.providers. */
const configurableProviderViewSchema = z.object({
	provider: z.string().min(1),
	displayName: z.string().min(1),
	settingsNs: z.string(),
	settingsPath: z.array(z.string()),
	active: z.boolean(),
	declared: z.boolean().optional()
});
/** llm.providers request payload. */
const llmProvidersRequestSchema = z.object({});
/** llm.providers response value. */
const llmProvidersValueSchema = z.object({ providers: z.array(configurableProviderViewSchema) });
/** llm.models request payload. */
const llmModelsRequestSchema = z.object({});
/** llm.models response value. */
const llmModelsValueSchema = z.object({
	groups: z.array(modelProviderGroupSchema),
	failures: z.array(modelCatalogFailureSchema)
});
/** DiscoveredModelView row of llm.discoverModels. */
const discoveredModelViewSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).optional(),
	contextWindow: z.number().int().positive().optional(),
	maxTokens: z.number().int().positive().optional()
});
/** llm.discoverModels request payload. */
const llmDiscoverModelsRequestSchema = z.object({
	settingsNs: z.string().min(1),
	provider: z.string().min(1).optional(),
	baseURL: z.string().min(1).optional(),
	api: z.string().min(1).optional(),
	apiKey: z.string().min(1).optional()
});
/** llm.discoverModels response value. */
const llmDiscoverModelsValueSchema = z.object({ models: z.array(discoveredModelViewSchema) });
//#endregion
//#region src/api/subagents.schema.ts
/** Zod schemas for the browser-safe subagent domain. */
/** Healthy and diagnostic durable catalog rows. */
const subagentListEntrySchema = z.union([
	z.object({
		kind: z.literal("child"),
		id: sessionIdSchema,
		mode: z.literal("one-shot"),
		activity: z.union([z.literal("running"), z.literal("inactive")]),
		hasChildren: z.boolean(),
		label: z.string().optional()
	}),
	z.object({
		kind: z.literal("child"),
		id: sessionIdSchema,
		mode: z.literal("continuable"),
		activity: z.union([z.literal("running"), z.literal("inactive")]),
		hasChildren: z.boolean(),
		label: z.string()
	}),
	z.object({
		kind: z.literal("diagnostic"),
		id: sessionIdSchema,
		reason: z.union([
			z.literal("corrupt"),
			z.literal("unsupported"),
			z.literal("unavailable")
		])
	})
]);
/** subagent.list request payload. */
const subagentListRequestSchema = z.object({ parentSessionId: sessionIdSchema });
/** subagent.list response value. */
const subagentListValueSchema = z.object({
	entries: z.array(subagentListEntrySchema),
	parentAvailable: z.boolean()
});
/** subagent.history request payload. */
const subagentHistoryRequestSchema = z.object({
	parentSessionId: sessionIdSchema,
	childSessionId: sessionIdSchema,
	mode: z.union([z.literal("one-shot"), z.literal("continuable")]),
	beforeSeq: z.number().int().nonnegative().optional(),
	maxMessages: z.number().int().positive().optional()
});
/** subagent.history response value. */
const subagentHistoryValueSchema = z.object({
	events: z.array(historyEntrySchema),
	hasMore: z.boolean(),
	projections: sessionProjectionsBlockSchema.optional()
});
/** subagent.prompt request payload. */
const subagentPromptRequestSchema = z.object({
	parentSessionId: sessionIdSchema,
	childSessionId: sessionIdSchema,
	mode: z.literal("continuable"),
	content: z.array(contentBlockSchema),
	clientTimeZone: z.string().optional()
});
/** subagent.interrupt request payload. */
const subagentInterruptRequestSchema = z.object({
	parentSessionId: sessionIdSchema,
	childSessionId: sessionIdSchema,
	mode: z.literal("continuable")
});
/** subagent.interrupt response value. */
const subagentInterruptValueSchema = z.object({ accepted: z.literal(true) });
const messageIdSchema = z.string();
/** subagent.prompt response value. */
const subagentPromptValueSchema = z.object({ messageId: messageIdSchema });
//#endregion
//#region src/api/jobs.schema.ts
/**
* tasks domain zod schemas: the branded job id and the wire view carried by
* `session/jobs` frames.
*/
/** JobId: one brand cast after non-empty string validation. */
const taskIdSchema = z.string().min(1);
/**
* One wire task view. `kind` stays an open string because producer plugins
* extend the registry's kind map by declaration merging, so the closed set is
* not knowable at this boundary.
*/
const taskViewSchema = z.object({
	id: taskIdSchema,
	kind: z.string().min(1),
	label: z.string().min(1),
	status: z.union([
		z.literal("running"),
		z.literal("stopping"),
		z.literal("completed"),
		z.literal("killed"),
		z.literal("failed")
	]),
	detail: z.string().optional(),
	startedAt: z.number().int().nonnegative(),
	finishedAt: z.number().int().nonnegative().optional()
});
//#endregion
//#region src/api/events.schema.ts
/**
* events domain zod schemas: MuxFrame / HostFrame unions (discriminatedUnion('type')).
* A frame is the payload slot of the ServerRequest full form; the SessionEvent inside
* a session/event frame reuses sessions.schema's strict-envelope + wide-data passthrough branch.
*/
/** Question fields validated strictly against core dsh-user-questions. */
const askUserQuestionItemSchema = z.object({
	id: z.string(),
	question: z.string(),
	header: z.string().optional(),
	detail: z.string().optional(),
	options: z.array(z.object({
		label: z.string(),
		description: z.string().optional()
	})).optional(),
	multiSelect: z.boolean().optional(),
	intent: z.discriminatedUnion("kind", [z.object({
		kind: z.literal("plan-review"),
		approve: z.string()
	})]).optional()
});
/** Unified message envelope carried by transient queue frames. */
const messageSchema = z.object({
	id: z.string().min(1),
	role: z.union([
		z.literal("system"),
		z.literal("user"),
		z.literal("assistant")
	]),
	content: z.array(contentBlockSchema),
	source: z.looseObject({ kind: z.string() })
});
/** MuxFrame union (payload slot of a mux-stream ServerRequest). */
const muxFrameSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("session/event"),
		sessionId: sessionIdSchema,
		event: sessionEventSchema,
		view: toolEventViewSchema.optional()
	}),
	z.object({
		type: z.literal("session/subscribed"),
		sessionId: sessionIdSchema,
		lastSeq: z.number().int()
	}),
	z.object({
		type: z.literal("approval/requested"),
		sessionId: sessionIdSchema,
		approvalId: approvalRequestIdSchema,
		toolName: z.string(),
		callId: z.string().optional(),
		reason: z.string().optional()
	}),
	z.object({
		type: z.literal("approval/resolved"),
		sessionId: sessionIdSchema,
		approvalId: approvalRequestIdSchema,
		outcome: z.union([
			z.literal("allowed-once"),
			z.literal("rejected"),
			z.literal("cancelled"),
			z.literal("unavailable")
		])
	}),
	z.object({
		type: z.literal("question/requested"),
		sessionId: sessionIdSchema,
		questions: z.array(askUserQuestionItemSchema).min(1)
	}),
	z.object({
		type: z.literal("question/resolved"),
		sessionId: sessionIdSchema,
		questionRpcId: rpcIdSchema,
		outcome: z.union([z.literal("answered"), z.literal("cancelled")])
	}),
	z.object({
		type: z.literal("session/queue"),
		sessionId: sessionIdSchema,
		items: z.array(z.object({
			id: messageIdSchema$1,
			placement: z.union([
				z.literal("queued"),
				z.literal("steering"),
				z.literal("context")
			]),
			message: messageSchema
		}))
	}),
	z.object({
		type: z.literal("session/jobs"),
		sessionId: sessionIdSchema,
		jobs: z.array(taskViewSchema)
	}),
	z.object({
		type: z.literal("session/projection"),
		sessionId: sessionIdSchema,
		key: z.string().min(1),
		value: z.unknown(),
		seq: z.number().int().nonnegative()
	}),
	z.object({
		type: z.literal("stream/error"),
		error: rpcErrorSchema
	})
]);
/** HostFrame union (payload slot of a host-stream ServerRequest). */
const hostFrameSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("host/session-added"),
		sessionId: sessionIdSchema,
		blank: z.boolean(),
		parentSessionId: sessionIdSchema.optional(),
		origin: z.literal("subagent").optional(),
		cwd: z.string().optional(),
		agentPreset: z.string().optional()
	}),
	z.object({
		type: z.literal("host/session-removed"),
		sessionId: sessionIdSchema
	}),
	z.object({
		type: z.literal("host/session-status"),
		sessionId: sessionIdSchema,
		running: z.boolean()
	}),
	z.object({
		type: z.literal("host/agent-error"),
		sessionId: sessionIdSchema,
		message: z.string()
	}),
	z.object({
		type: z.literal("host/workspace-changed"),
		workspace: workspaceViewSchema
	}),
	z.object({
		type: z.literal("host/workspace-removed"),
		workspaceId: workspaceIdSchema
	}),
	z.object({
		type: z.literal("host/workspace-order-changed"),
		workspaceIds: z.array(workspaceIdSchema)
	}),
	z.object({
		type: z.literal("host/archived-sessions-changed"),
		archivedSessionIds: z.array(sessionIdSchema)
	}),
	z.object({
		type: z.literal("host/remote-event"),
		event: z.string().min(1),
		args: z.array(z.unknown())
	}),
	z.object({
		type: z.literal("stream/error"),
		error: rpcErrorSchema
	})
]);
//#endregion
//#region src/fetch/client.ts
/**
* S→C second-level parse table: value schema by method (the response-path
* mirror of the handler's request table; key coverage compiler-enforced against RpcMethodMap).
*/
const UNARY_VALUE_SCHEMAS = {
	"session.list": sessionListValueSchema,
	"session.search": sessionSearchValueSchema,
	"session.create": sessionCreateValueSchema,
	"session.history": sessionHistoryValueSchema,
	"session.models": sessionModelsValueSchema,
	"session.selectModel": sessionSelectModelValueSchema,
	"session.rename": sessionRenameValueSchema,
	"session.fork": sessionForkValueSchema,
	"session.prompt": sessionPromptValueSchema,
	"session.attachment": sessionAttachmentValueSchema,
	"session.updateQueue": sessionUpdateQueueValueSchema,
	"session.cancel": sessionCancelValueSchema,
	"subagent.list": subagentListValueSchema,
	"subagent.history": subagentHistoryValueSchema,
	"subagent.prompt": subagentPromptValueSchema,
	"subagent.interrupt": subagentInterruptValueSchema,
	"host.describe": hostDescribeValueSchema,
	"host.pickDirectory": hostPickDirectoryValueSchema,
	"host.listDirectory": hostListDirectoryValueSchema,
	"host.createDirectory": hostCreateDirectoryValueSchema,
	"host.openPath": hostOpenPathValueSchema,
	"workspace.list": workspaceListValueSchema,
	"workspace.create": workspaceCreateValueSchema,
	"workspace.rename": workspaceRenameValueSchema,
	"workspace.delete": workspaceDeleteValueSchema,
	"workspace.insertBefore": workspaceInsertBeforeValueSchema,
	"workspace.insertSessionBefore": workspaceInsertSessionBeforeValueSchema,
	"workspace.archiveSession": workspaceArchiveSessionValueSchema,
	"skill.list": skillListValueSchema,
	"agentPreset.list": agentPresetListValueSchema,
	"agentPreset.select": agentPresetSelectValueSchema,
	"agentPreset.read": agentPresetReadValueSchema,
	"agentPreset.copy": agentPresetCopyValueSchema,
	"agentPreset.openDocument": agentPresetOpenDocumentValueSchema,
	"agentPreset.remove": agentPresetRemoveValueSchema,
	"goal.create": goalCreateValueSchema,
	"goal.edit": goalEditValueSchema,
	"goal.pause": goalPauseValueSchema,
	"goal.resume": goalResumeValueSchema,
	"goal.complete": goalCompleteValueSchema,
	"goal.clear": goalClearValueSchema,
	"settings.describe": settingsDescribeValueSchema,
	"settings.openDocument": settingsOpenDocumentValueSchema,
	"settings.update": settingsUpdateValueSchema,
	"settings.replace": settingsReplaceValueSchema,
	"settings.mutate": settingsMutateValueSchema,
	"credentials.describe": credentialsDescribeValueSchema,
	"credentials.set": credentialsSetValueSchema,
	"credentials.unset": credentialsUnsetValueSchema,
	"llm.providers": llmProvidersValueSchema,
	"llm.models": llmModelsValueSchema,
	"llm.discoverModels": llmDiscoverModelsValueSchema
};
/** Default timeout for bounded unary calls (rpc-compare 2026-07-19: a hung host must not leave callers pending forever). */
const DEFAULT_TIMEOUT_MS = 3e4;
/** URL base for in-process handler injection (fake authority, opencode precedent). */
const INTERNAL_BASE = "http://dsh.internal";
/**
* Abstract fetch-carrier client. Subclasses supply the transport (doFetch) and may refine the
* per-message tap (onEnvelope) — platform aspects stay in subclasses, protocol invariants stay
* here. Envelope observation is a first-class aspect of this data middle layer: the instance
* owns a microtask-batched buffer (frame storms must not cost one consumer update per frame),
* and observers subscribe via subscribeEnvelopes. The isomorphic point survives: an in-process
* subclass whose doFetch is toFetchHandler(api).fetch never touches the network.
*/
var AbstractApiClient = class {
	timeoutMs;
	/** Instance-owned observation buffer (module-level state would leak across instances/tests). */
	envelopeBatch = [];
	flushScheduled = false;
	envelopeListeners = /* @__PURE__ */ new Set();
	/** @param timeoutMs - timeout for bounded unary calls; user-paced calls and streams do not use it. */
	constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
		this.timeoutMs = timeoutMs;
	}
	/**
	* Subscribe to batched envelope observation (diagnostics/logging consumers).
	* Batches follow microtask boundaries; a listener throw is isolated (observation
	* must never break the carrier).
	* @param listener - receives each flushed batch in arrival order.
	* @returns unsubscribe function.
	*/
	subscribeEnvelopes(listener) {
		this.envelopeListeners.add(listener);
		return () => {
			this.envelopeListeners.delete(listener);
		};
	}
	/** Per-message tap: feeds the instance buffer. Subclasses may override to observe unbatched (call super to keep batching). */
	onEnvelope(message) {
		if (this.envelopeListeners.size === 0) return;
		this.envelopeBatch.push(message);
		if (this.flushScheduled) return;
		this.flushScheduled = true;
		queueMicrotask(() => {
			this.flushScheduled = false;
			const batch = this.envelopeBatch;
			this.envelopeBatch = [];
			for (const notify of this.envelopeListeners) try {
				notify(batch);
			} catch (error) {
				console.error("[apiproxy] envelope listener threw:", error);
			}
		});
	}
	/** Browser = same-origin (a fake authority would fail DNS on real requests); no-location env (Node) = fake authority. */
	resolveBase() {
		const loc = globalThis.location;
		return loc?.origin !== void 0 && loc.origin !== "null" ? loc.origin : INTERNAL_BASE;
	}
	mintRpcId() {
		return RpcId(crypto.randomUUID());
	}
	/**
	* Shared POST leg of both C→S carriers (callUnary/respond): JSON body,
	* optional default timeout merged with the caller's external signal, non-2xx → transport throw.
	*/
	async postJson(path, body, signal, timeoutPolicy = "default") {
		const requestSignal = timeoutPolicy === "default" ? signal === void 0 ? AbortSignal.timeout(this.timeoutMs) : AbortSignal.any([AbortSignal.timeout(this.timeoutMs), signal]) : signal;
		const response = await this.doFetch(new URL(path, this.resolveBase()), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			...requestSignal === void 0 ? {} : { signal: requestSignal }
		});
		if (!response.ok) throw new Error(`transport failure for ${path}: HTTP ${response.status}`);
		return response;
	}
	/**
	* Unary protocol path: mint → tap → POST full form → envelope parse → verify
	* echo → value parse → tap → narrow. Virtual so a fake carrier (fixture) can
	* override transport at this layer.
	*/
	async callUnary(method, payload, signal, timeoutPolicy = "default") {
		const message = {
			type: "client-request",
			rpcId: this.mintRpcId(),
			method,
			payload
		};
		this.onEnvelope(message);
		const response = await this.postJson(`/api/${method}`, message, signal, timeoutPolicy);
		const full = serverResponseSchema.parse(await response.json());
		this.onEnvelope(full);
		if (full.rpcId !== message.rpcId) throw new Error(`rpcId mismatch for ${method}: sent ${message.rpcId}, got ${full.rpcId}`);
		if (!full.result.ok) return {
			rpcId: full.rpcId,
			result: full.result
		};
		const value = UNARY_VALUE_SCHEMAS[method].parse(full.result.value);
		return {
			rpcId: full.rpcId,
			result: {
				ok: true,
				value
			}
		};
	}
	/** Mux stream opener; virtual for the same override reason as callUnary. */
	openMux(_payload, signal, onOpen) {
		return this.readSse("/api/events.mux", signal, muxFrameSchema, onOpen);
	}
	/** Host stream opener; virtual. */
	openHost(_payload, signal, onOpen) {
		return this.readSse("/api/events.host", signal, hostFrameSchema, onOpen);
	}
	/**
	* SSE protocol path: streaming fetch (not EventSource), '\n\n' framing, ServerRequest envelope +
	* frame-schema parse, tap, narrow yield. onOpen fires once the response headers are in and the
	* body is readable — the stream-established signal, before any frame arrives. A frame that fails
	* either parse level is reported and skipped (one corrupt frame must not kill the stream; the
	* client's gap detection covers whatever the frame carried).
	*/
	async *readSse(path, signal, frameSchema, onOpen) {
		const response = await this.doFetch(new URL(path, this.resolveBase()), { signal });
		if (!response.ok || response.body === null) throw new Error(`transport failure for ${path}: HTTP ${response.status}`);
		onOpen?.();
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) return;
				buffer += decoder.decode(value, { stream: true });
				let boundary;
				while ((boundary = buffer.indexOf("\n\n")) !== -1) {
					const chunk = buffer.slice(0, boundary);
					buffer = buffer.slice(boundary + 2);
					const data = chunk.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("");
					if (data === "") continue;
					let full;
					let frame;
					try {
						full = serverRequestSchema.parse(JSON.parse(data));
						frame = frameSchema.parse(full.payload);
					} catch (error) {
						console.error(`[apiproxy] dropping malformed SSE frame on ${path}:`, error);
						continue;
					}
					this.onEnvelope(full);
					yield {
						rpcId: full.rpcId,
						payload: frame
					};
				}
			}
		} finally {
			await reader.cancel().catch(() => void 0);
		}
	}
	sessions = {
		list: (payload, signal) => this.callUnary("session.list", payload, signal),
		search: (payload, signal) => this.callUnary("session.search", payload, signal),
		create: (payload, signal) => this.callUnary("session.create", payload, signal),
		history: (payload, signal) => this.callUnary("session.history", payload, signal),
		models: (payload, signal) => this.callUnary("session.models", payload, signal),
		selectModel: (payload, signal) => this.callUnary("session.selectModel", payload, signal),
		rename: (payload, signal) => this.callUnary("session.rename", payload, signal),
		fork: (payload, signal) => this.callUnary("session.fork", payload, signal),
		prompt: (payload, signal) => this.callUnary("session.prompt", payload, signal),
		attachment: (payload, signal) => this.callUnary("session.attachment", payload, signal),
		updateQueue: (payload, signal) => this.callUnary("session.updateQueue", payload, signal),
		cancel: (payload, signal) => this.callUnary("session.cancel", payload, signal)
	};
	subagents = {
		list: (payload, signal) => this.callUnary("subagent.list", payload, signal),
		history: (payload, signal) => this.callUnary("subagent.history", payload, signal),
		prompt: (payload, signal) => this.callUnary("subagent.prompt", payload, signal),
		interrupt: (payload, signal) => this.callUnary("subagent.interrupt", payload, signal)
	};
	host = {
		describe: (payload, signal) => this.callUnary("host.describe", payload, signal),
		pickDirectory: (payload, signal) => this.callUnary("host.pickDirectory", payload, signal, "caller-signal-only"),
		listDirectory: (payload, signal) => this.callUnary("host.listDirectory", payload, signal),
		createDirectory: (payload, signal) => this.callUnary("host.createDirectory", payload, signal),
		openPath: (payload, signal) => this.callUnary("host.openPath", payload, signal)
	};
	workspace = {
		list: (payload, signal) => this.callUnary("workspace.list", payload, signal),
		create: (payload, signal) => this.callUnary("workspace.create", payload, signal),
		rename: (payload, signal) => this.callUnary("workspace.rename", payload, signal),
		delete: (payload, signal) => this.callUnary("workspace.delete", payload, signal),
		insertBefore: (payload, signal) => this.callUnary("workspace.insertBefore", payload, signal),
		insertSessionBefore: (payload, signal) => this.callUnary("workspace.insertSessionBefore", payload, signal),
		archiveSession: (payload, signal) => this.callUnary("workspace.archiveSession", payload, signal)
	};
	skills = { list: (payload, signal) => this.callUnary("skill.list", payload, signal) };
	agentPresets = {
		list: (payload, signal) => this.callUnary("agentPreset.list", payload, signal),
		select: (payload, signal) => this.callUnary("agentPreset.select", payload, signal),
		read: (payload, signal) => this.callUnary("agentPreset.read", payload, signal),
		copy: (payload, signal) => this.callUnary("agentPreset.copy", payload, signal),
		openDocument: (payload, signal) => this.callUnary("agentPreset.openDocument", payload, signal),
		remove: (payload, signal) => this.callUnary("agentPreset.remove", payload, signal)
	};
	goals = {
		create: (payload, signal) => this.callUnary("goal.create", payload, signal),
		edit: (payload, signal) => this.callUnary("goal.edit", payload, signal),
		pause: (payload, signal) => this.callUnary("goal.pause", payload, signal),
		resume: (payload, signal) => this.callUnary("goal.resume", payload, signal),
		complete: (payload, signal) => this.callUnary("goal.complete", payload, signal),
		clear: (payload, signal) => this.callUnary("goal.clear", payload, signal)
	};
	settings = {
		describe: (payload, signal) => this.callUnary("settings.describe", payload, signal),
		openDocument: (payload, signal) => this.callUnary("settings.openDocument", payload, signal),
		update: (payload, signal) => this.callUnary("settings.update", payload, signal),
		replace: (payload, signal) => this.callUnary("settings.replace", payload, signal),
		mutate: (payload, signal) => this.callUnary("settings.mutate", payload, signal)
	};
	credentials = {
		describe: (payload, signal) => this.callUnary("credentials.describe", payload, signal),
		set: (payload, signal) => this.callUnary("credentials.set", payload, signal),
		unset: (payload, signal) => this.callUnary("credentials.unset", payload, signal)
	};
	llm = {
		providers: (payload, signal) => this.callUnary("llm.providers", payload, signal),
		models: (payload, signal) => this.callUnary("llm.models", payload, signal),
		discoverModels: (payload, signal) => this.callUnary("llm.discoverModels", payload, signal)
	};
	events = {
		mux: (payload, signal, onOpen) => this.openMux(payload, signal, onOpen),
		host: (payload, signal, onOpen) => this.openHost(payload, signal, onOpen)
	};
	async respond(message, signal) {
		this.onEnvelope(message);
		const response = await this.postJson("/api/respond", message, signal);
		return rpcReceiptSchema.parse(await response.json());
	}
};
/**
* In-process client over an injected fetch-shaped handler (the isomorphic point:
* `new InProcessApiClient(toFetchHandler(api))` never touches the network). Lives here because
* in-process injection is this package's own capability (handler and client are both local).
*/
var InProcessApiClient = class extends AbstractApiClient {
	handler;
	constructor(handler, timeoutMs) {
		super(timeoutMs);
		this.handler = handler;
	}
	/**
	* Faithful to real fetch: reject on signal abort even when the in-process
	* handler ignores the signal (a hung impl must not defeat timeout/cancel).
	*/
	doFetch(input, init) {
		const signal = init?.signal ?? void 0;
		if (signal === void 0) return this.handler.fetch(input, init);
		if (signal.aborted) return Promise.reject(abortError(signal));
		return new Promise((resolve, reject) => {
			const onAbort = () => {
				reject(abortError(signal));
			};
			signal.addEventListener("abort", onAbort, { once: true });
			this.handler.fetch(input, init).then(resolve, reject).finally(() => {
				signal.removeEventListener("abort", onAbort);
			});
		});
	}
};
/** Mirror fetch's abort rejection: the signal's reason when present, else a DOMException-style AbortError. */
function abortError(signal) {
	const reason = signal.reason;
	if (reason instanceof Error) return reason;
	if (typeof reason === "string") return new Error(reason);
	return /* @__PURE__ */ new Error("This operation was aborted");
}
//#endregion
export { sessionModelsRequestSchema as $, skillListRequestSchema as A, hostListDirectoryRequestSchema as B, goalResumeRequestSchema as C, agentPresetReadRequestSchema as D, agentPresetOpenDocumentRequestSchema as E, workspaceInsertSessionBeforeRequestSchema as F, sessionAttachmentRequestSchema as G, hostPickDirectoryRequestSchema as H, workspaceListRequestSchema as I, sessionForkRequestSchema as J, sessionCancelRequestSchema as K, workspaceRenameRequestSchema as L, workspaceCreateRequestSchema as M, workspaceDeleteRequestSchema as N, agentPresetRemoveRequestSchema as O, workspaceInsertBeforeRequestSchema as P, sessionListRequestSchema as Q, hostCreateDirectoryRequestSchema as R, goalPauseRequestSchema as S, agentPresetListRequestSchema as T, approvalResponsePayloadSchema as U, hostOpenPathRequestSchema as V, imageLimitsProjectionSchema as W, sessionIdSchema as X, sessionHistoryRequestSchema as Y, sessionListMetadataProjectionSchema as Z, settingsUpdateRequestSchema as _, subagentListRequestSchema as a, goalCreateRequestSchema as b, llmModelsRequestSchema as c, credentialsSetRequestSchema as d, sessionPromptRequestSchema as et, credentialsUnsetRequestSchema as f, settingsReplaceRequestSchema as g, settingsOpenDocumentRequestSchema as h, subagentInterruptRequestSchema as i, sessionUpdateQueueRequestSchema as it, workspaceArchiveSessionRequestSchema as j, agentPresetSelectRequestSchema as k, llmProvidersRequestSchema as l, settingsMutateRequestSchema as m, InProcessApiClient as n, sessionSearchRequestSchema as nt, subagentPromptRequestSchema as o, settingsDescribeRequestSchema as p, sessionCreateRequestSchema as q, subagentHistoryRequestSchema as r, sessionSelectModelRequestSchema as rt, llmDiscoverModelsRequestSchema as s, AbstractApiClient as t, sessionRenameRequestSchema as tt, credentialsDescribeRequestSchema as u, goalClearRequestSchema as v, agentPresetCopyRequestSchema as w, goalEditRequestSchema as x, goalCompleteRequestSchema as y, hostDescribeRequestSchema as z };
