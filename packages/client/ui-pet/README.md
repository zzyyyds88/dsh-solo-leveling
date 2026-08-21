# @deepseek-ai/dsh-client-ui-pet

DeepSeek Pet: an interactive, state-aware desktop pet embedded in the DSH Web GUI.

## Purpose

- Renders a frame-wide pet overlay (the `shell.overlay` slot) whose expression derives from the focused session's conversation snapshot: idle, waiting, thinking, working, speaking, success, error, tool-error, approval, busy, full, hungry, sleepy, sleeping and more, including tool-specific working reactions and reaction sprites from embedded webp assets plus animated frames.
- Provides interaction: drag positioning and wheel scaling (position persists, scale is session-local), tap/poke with per-state lines, a triple-click diagnostic panel, a long-press headpat, and a whip reaction driven by an external window event.
- Plays WebAudio-synthesized sound effects (celebration arpeggio, sad tone, poke, prompt chime, tool clicks, headpat) with a total volume, per-action volumes (voice/sfx/celebrate) and per-alert toggles, all persisted in localStorage; the audio context is pre-created on mount and unlocked on the first user gesture to satisfy browser autoplay policy.
- Speaks offline voice lines pre-synthesized with edge-tts and embedded as base64 (decoded through the WebAudio API): event-driven lines on success/error and state-driven lines on approval, question, busy and thinking states with cooldown.
- Celebrates task completion with an arpeggio, a speech line, a jump animation and 18 falling confetti pieces, deduplicated within 3 seconds and aligned with the goal projection's phase transitions.
- Shows a ledger panel that aggregates real per-request usage from the trajectory session view (input/output/cache-read/cache-write/reasoning tokens), computes the cache hit rate, estimates cost with deepseek-chat rates, tracks a per-session budget cap, and alerts on cost peaks, valleys and over-budget states.
- Registers two plugin-config cards (DeepSeek Pet on/off; ledger on/off, budget and four rates) that read and write localStorage; the node half registers two empty settings namespaces (`deepseek-pet`, `deepseek-pet-ledger`) solely so the cards appear in the plugin-config section.

## Configuration

All settings are localStorage-backed and surfaced through the two plugin-config cards and the pet's diagnostic panel, not through schema-driven settings namespaces.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `deepseek-pet:app.enabled` | `boolean` | `true` | Whether the pet renders and sounds at all |
| `deepseek-pet:ledger.enabled` | `boolean` | `true` | Whether the ledger panel is shown |
| `deepseek-pet:ledger.budget` | `number` | `30` | Per-session cost cap in CNY that triggers the over-budget alert |
| `deepseek-pet:ledger.rates.miss` | `number` | `2` | Estimated input-miss rate (CNY per million tokens) |
| `deepseek-pet:ledger.rates.hit` | `number` | `0.5` | Estimated cache-hit rate (CNY per million tokens) |
| `deepseek-pet:ledger.rates.write` | `number` | `2` | Estimated cache-write rate (CNY per million tokens) |
| `deepseek-pet:ledger.rates.output` | `number` | `8` | Estimated output rate (CNY per million tokens) |
| `deepseek-pet:sound.muted` | `boolean` | `false` | Global mute switch |
| `deepseek-pet:sound.total` / `voice` / `sfx` / `celebrate` | `number` | `1` | Total and per-action volume (0-1) |
| `deepseek-pet:sound.alerts.*` | `boolean` | `true` | Per-alert toggles: celebrate, error, prompt, state, tool, poke, headpat |

## Model Experience

None, as the plugin is a browser-only presentation overlay that derives its state from the session runtime and localStorage-backed preferences.

#### KV Cache effect

No direct invalidation: the pet contributes nothing to the model prompt and only reads the session snapshot, so no pet setting change ever touches a session prefix.

## Known Limitations and Deferred Work

- All configuration lives in the browser's localStorage rather than the settings seam, so it is per-browser and per-origin, not per-deployment; the host namespaces are empty display-enablers.
- Voice lines are pre-synthesized with edge-tts and embedded in the bundle, so adding or changing lines requires regenerating the generated voice assets; there is no on-the-fly synthesis.
- The ledger cost is an estimate built from fixed deepseek-chat rates and heuristic billed-input math; real provider pricing or token accounting can differ from what the panel shows.
- The pet reacts only to the focused session's snapshot and the sessions list, so it cannot observe anything beyond what the runtime projections (goal, context pressure, trajectory) expose.
