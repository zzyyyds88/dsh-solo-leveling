/**
 * Stylesheet that merges the live TPS slot into the official StatsLine row —
 * always on ONE line, no wrapping at any width.
 *
 * The composer dock (`conversation.composer.dock`) is a list slot: every
 * registered entry renders, and the renderer emits them inside a wrapper —
 * `<div data-slot="conversation.composer.dock" style="display: contents">`.
 * While the TPS slot is mounted the merge turns that wrapper into a
 * horizontal flex row (the inline `display: contents` is overridden with
 * `!important`, which only affects layout — the wrapper still carries no
 * visual box), so the official StatsLine and the TPS sit side by side as one
 * compact, centered unit:
 *
 * - the official row shrinks to its content width (capped at 620px so the
 *   merged line stays compact even on very wide docks; its own
 *   `white-space: nowrap` + ellipsis handle the rest — the row can never
 *   wrap);
 * - the TPS slot is a fixed-width item right after it, separated by a `·`
 *   in the official separator style (hidden while the slot has no content).
 *
 * The TPS slot stays mounted even when no rate sample exists yet (it renders
 * empty instead of unmounting), so the merged layout — and the official
 * row's width — never flips between content width and full width when a
 * stream starts or ends.
 *
 * Selector notes (all verified against the real rendered DOM):
 * - the slot renderer wraps entries in `div[data-slot="conversation.composer.dock"]`,
 *   so the entries are its direct children — selectors must anchor on the
 *   wrapper;
 * - nested `:has()` (a `:has()` whose argument contains another `:has()`
 *   with a combinator) fails to parse and the whole rule is silently dropped
 *   by the engine, so the merge uses flat selectors only: `:has(> ...)` on
 *   the wrapper (scoping the merge to the moment the TPS slot is mounted)
 *   and the plain sibling combinator `* + [data-dsh-live-tps]` for the slot.
 *
 * When the plugin is inactive the slot does not exist and no merge rule
 * matches: the dock keeps its original full-width look. While the slot is
 * mounted but the official row is absent, the TPS alone stays visible and
 * centered.
 */
export declare const MERGE_CSS: string;
/** Inject the merge stylesheet once; no-op outside the browser or when already present. */
export declare function ensureMergeCss(): void;
//# sourceMappingURL=merge-css.d.ts.map