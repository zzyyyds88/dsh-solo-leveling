# @deepseek-ai/dsh-client-ui-access-gate

Access-gate plugin-config card for DSH Web: the login password and the HTTPS certificate mode.

## Purpose

- Registers one card into the plugin-config section (the `settings.plugin.item` slot, key `access-gate`) of the Settings dialog, bound to the `access-gate` settings namespace registered by the host plugin `dsh-host-access-gate`.
- Login password: sets a new access password (at least 6 characters, with a matching confirm field) or leaves the current one untouched by keeping the fields empty; saving a new password makes the host rotate its HMAC key, so every existing session is invalidated and a fresh sign-in is required.
- HTTPS certificate mode: `auto` uses the pure-code self-signed certificate the web-app generates (no tools, no commands, HTTPS on by default listening on 0.0.0.0), while `custom` uploads your own PEM certificate and private-key files as trimmed text; in custom mode the host validates the pair and writes it to `$DSH_HOME/https/custom.{crt,key}` for the next restart.
- The stored password and PEM content are never projected back into the form; the card only reports whether a custom certificate pair is already configured, and shows an unsaved-draft pill whenever any field is edited.
- A restart button POSTs to `/access-gate/restart` (requires a valid session); the confirmation dialog explains that dsh exits immediately without restart orchestration and prints a copyable systemd block so a supervisor brings it back up.
- The card renders disabled or not at all when the namespace is not exposed or not writable, and validates the password length and the confirm match before saving.

## Configuration

The card reads and writes the `access-gate` settings namespace (schema owned by the host plugin).

| Key | Type | Default | Meaning |
|---|---|---|---|
| `password` | `string` (secret) | `''` | Access password; empty keeps the current one on save |
| `certMode` | `'auto'` \| `'custom'` | `'auto'` | HTTPS certificate mode: auto self-signed vs uploaded own cert |
| `customCert` | `string` (secret) | `''` | PEM certificate content in custom mode (never displayed back) |
| `customKey` | `string` (secret) | `''` | PEM private-key content in custom mode (never displayed back) |

## Model Experience

None, as the plugin is a browser-only settings card that only reads and writes the `access-gate` settings namespace.

#### KV Cache effect

No direct invalidation: the card writes settings values that never feed the model prompt, so a save cannot perturb any session prefix.

## Known Limitations and Deferred Work

- The card depends on the `access-gate` namespace being exposed to the settings page (via `dsh-host-apiproxy`); a build that does not expose it renders the card without an editable form.
- A custom certificate is written to disk on save but only loaded by the TLS server on restart; the card cannot reload TLS itself.
- The restart action exits dsh immediately without orchestration, so a machine without a supervisor (systemd, docker, PM2) stays down until something restarts the process.
- Saving a password rotates the session key, so the operator is signed out at once and must sign in again.
