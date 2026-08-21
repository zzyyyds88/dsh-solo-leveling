# @deepseek-ai/dsh-host-access-gate

Access gate for the DSH Web GUI: password login, first-run setup, session cookies with rate limiting, and HTTPS certificate file sync.

## Purpose

- Registers a request gate on the shared webserver that intercepts every HTTP request and WebSocket upgrade before route dispatch: a valid session cookie passes through, unauthenticated pages and static assets get a 302 to /login, /api/* gets a 401 JSON, and WebSocket upgrades are refused.
- Enters first-run setup mode when no password is configured anywhere: every request redirects to /setup, where the operator sets their own password (at least 6 characters, with confirm); the plugin never generates or prints a password.
- Resolves the password from, in priority order: the plugin config `password`, the `access-gate` settings namespace (the GUI card or /setup), the environment variables DSH_ACCESS_GATE_PASSWORD / DSH_WEB_PASSWORD, or the trimmed content of `passwordFile`; the HMAC session key derives from the password, so changing it rotates the key and invalidates every existing session immediately.
- Issues session cookies named `dsh_session_<port>` (per-instance on one host), signed HMAC-SHA256 as `v1.<expires>.<nonce>.<hmac>`, HttpOnly + SameSite=Strict, with a 7-day TTL by default.
- Rate-limits the login and setup endpoints per source IP (configurable attempt cap over a window, X-Forwarded-For aware) and clears the cookie on /logout.
- Syncs the HTTPS certificate files: in `certMode=custom` it validates the uploaded PEM pair (X509 parse plus private-key match) and writes `$DSH_HOME/https/custom.{crt,key}` with restrictive permissions; in `auto` (or unset) it removes the files so the web-app's default self-signed certificate is used, taking effect on restart.
- Provides the `webAuth` service (`isAuthenticated(request)`) that the protected client-connection methods consult to allow settings writes only for signed-in users.
- Serves the login, setup and asset pages, plus a session-guarded POST /access-gate/restart that acknowledges, then exits the process after a short delay for the system supervisor to bring it back up.

## Configuration

| Key | Type | Default | Meaning |
|---|---|---|---|
| `password` | `string` | `''` | Fallback password baked into the profile patch |
| `passwordFile` | `string` | `''` | Path whose trimmed content is the fallback password |
| `mode` | `'auto'` \| `'on'` \| `'off'` | `'auto'` | Gate mode: auto enables only when the webserver listens on 0.0.0.0, on always, off disables auth entirely |
| `sessionTtlSeconds` | `number` | `604800` | Session cookie lifetime in seconds (min 60) |
| `lockoutMaxAttempts` | `number` | `10` | Failed login attempts before a source IP is blocked |
| `lockoutWindowMs` | `number` | `600000` | Time window for the failed-attempt counter |

The environment variables `DSH_ACCESS_GATE_MODE`, `DSH_ACCESS_GATE_PASSWORD` (legacy alias `DSH_WEB_PASSWORD`) override the composed config. The `access-gate` settings namespace carries `password`, `certMode`, `customCert` and `customKey`, edited through the GUI card or /setup.

## Model Experience

None, as the plugin is a request-time HTTP gate that decides admission from the session cookie and the configured password, with no prompt or tool surface.

#### KV Cache effect

No direct invalidation: admission depends only on the session cookie and the configured password, never on the model prompt, so no auth or certificate change affects any session prefix.

## Known Limitations and Deferred Work

- The gate depends on the `WebRequestGate` hook provided by the local `dsh-host-webserver` fork; it cannot enforce anything on an upstream webserver that lacks the hook.
- Changing the password rotates the session key, so the saving session itself is signed out; clearing the password without any fallback source returns the instance to first-run /setup mode.
- The default HTTPS is a pure-code self-signed certificate that the operator's browser must accept, and in `custom` mode the operator is responsible for a SAN that covers the access address.
- `mode: off` disables authentication entirely, including /login and /setup, so it must never be used on an exposed interface.
- The restart route makes the process exit without restart orchestration, so a machine without a supervisor stays down until something restarts dsh.
