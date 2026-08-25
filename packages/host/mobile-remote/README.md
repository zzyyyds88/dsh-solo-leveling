# @deepseek-ai/dsh-host-mobile-remote

Host half of the DSH mobile remote (手机遥控): the BFF layer between the DSH Reins app and the dsh host. Design authority: `docs/工作区/手机遥控插件.md`.

## Surface

| Endpoint | Shape |
|---|---|
| `GET /api/mobile/info` | `{protocolVersion, pluginVersion, hostVersion, serverTime}` |
| `POST /api/mobile/rpc` | `{method, payload}` forwarded over the v1 whitelist (in-process apiProxy/taskBoard calls) |
| `POST /api/mobile/respond` | `{rpcId, kind:'approval'\|'question', result}` wrapped into a ClientResponse for `apiProxy.respond` |
| `POST /api/mobile/fs/read` | workspace-gated artifact preview: text ≤80k chars, image dataURL ≤8 MiB |
| `GET /api/mobile/fs/raw?ws=&path=` | raw byte stream with single-range support |
| WS `/api/mobile/events` | downstream-only event stream (mux/host/taskboard/meta), 15s ping, client messages close(1008) |

Envelope: `{ok:true,value}` / `{ok:false,error:{code,message}}`; closed error-code set
`method-not-allowed|bad-request|unauthorized|not-found|payload-too-large|internal`.

Authentication rides the access gate's global pre-dispatch gate; this plugin builds none of its own.

## Settings

Namespace `mobile-remote`: `enabled` (default `true`) turns every mobile endpoint into 404 (WS upgrade refused) when false; `maxRequestBytes` (default 20 MiB) caps POST bodies. Both are read live per request — the「手机遥控」card (`dsh-client-ui-mobile-remote`) takes effect on save without a restart.

## Notes

- `taskBoard` is an optional dependency: the five `task-board.*` whitelist rows appear only while the service composes.
- The task-board ledger changes fan out through the cordis `task-board/changed` event as full-snapshot frames.
