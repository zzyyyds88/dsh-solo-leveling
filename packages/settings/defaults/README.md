# dsh-defaults

Host settings namespace for GUI-configured defaults (fork customization).

## Purpose

Registers the `dsh-defaults` settings namespace, persisted in `$DSH_HOME/settings.yaml`, with two fields:

| Field | Default | Meaning |
|---|---|---|
| `defaultWorkingDirectory` | `''` | Directory the picker opens by default (empty = host home). |
| `defaultRetryCount` | `10` | Retry count for third-party providers that declare no `retryPolicy` (0 = none). |

Consumers read the namespace at use time: `dsh-host-directory-picker-browse` for the working directory, `dsh-llm` / `dsh-llm-pi-ai` for the retry fallback. The settings card is owned by `dsh-client-ui-defaults`.

## Model Experience

None, as the plugin is a host settings-namespace provider consumed by host services at read time.

#### KV Cache effect

No direct invalidation: the namespace feeds host services at read time, so a settings change never touches any session prefix.

## Known Limitations and Deferred Work

- The namespace is only useful once its consumers (the directory picker and LLM adapters) are migrated into this fork; registration alone is inert.
