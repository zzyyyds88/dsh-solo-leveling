//#region src/invariant.ts
const PACKAGE_NAME = "@zzyyyds88/dsh-live-stats";
/** Cordis companion plugin name. */
const name = "live-stats-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the `liveTokenUsage` projection is a pure replayable
* fold whose every published view passes the strict boundary schema at
* projection-application time, and its served-value relation lives on the
* projection carrier's wire path (emits no cordis event this companion could
* observe); totals need not be monotone because a final usage sample replaces
* the earlier chunk estimate mid-step, and estimator constants are validated
* synchronously at config resolution.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
