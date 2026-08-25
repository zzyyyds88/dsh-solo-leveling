# @deepseek-ai/dsh-client-ui-mobile-remote

Mobile-remote plugin-config card for DSH Web: the phone-remote total switch and the request-body cap.

## Purpose

- Registers one card into the plugin-config section (the `settings.plugin.item` slot, key `mobile-remote`) bound to the `mobile-remote` settings namespace registered by the host `dsh-host-mobile-remote` plugin.
- Total switch (`enabled`): off answers 404 on every `/api/mobile/*` request and refuses the `/api/mobile/events` WebSocket upgrade — the DSH Reins app can no longer connect, while browser login and every other feature stay untouched.
- Request-body cap (`maxRequestBytes`): the per-request byte ceiling; larger bodies answer `payload-too-large`.
- Saving writes the namespace through a staged form (dirty/overridden/reset semantics); the host plugin reads both values live per request/upgrade, so changes take effect immediately without a restart.
- When the current DSH build does not expose the namespace to the settings page, the card shows an explanation instead of a form; a read-only deployment disables the controls.

## Configuration

The card reads and writes the `mobile-remote` settings namespace.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Total switch for every `/api/mobile/*` surface |
| `maxRequestBytes` | `natural >= 1` | `20971520` | Per-request body cap in bytes |

## Model Experience

None, as the plugin is a browser-only settings card that only reads and writes the `mobile-remote` settings namespace.

#### KV Cache effect

No direct invalidation: the card writes host-side serving switches that are read at request time, never from the model prompt, so a save cannot perturb any session prefix.

## Known Limitations and Deferred Work

- The card edits two fields; deeper protocol knobs (whitelist entries, protocolVersion) are intentionally not configurable — widening the whitelist is a plugin release act per the design doc.
