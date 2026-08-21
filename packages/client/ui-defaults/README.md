# @deepseek-ai/dsh-client-ui-defaults

Defaults plugin-config card for DSH Web: the directory picker's default working directory and the default retry count.

## Purpose

- Registers one card into the plugin-config section (the `settings.plugin.item` slot, key `dsh-defaults`) bound to the `dsh-defaults` settings namespace registered by the host `dsh-defaults` plugin and exposed dynamically.
- Default working directory: a free-text field; the workspace directory picker opens at this path when adding a workspace, and an empty value keeps the official behavior (the host home directory).
- Default retry count: an integer field (min 0); the number of retries after a failed model call for providers that do not declare their own retry policy, including the built-in DeepSeek provider, and 0 disables retries.
- Saving writes the namespace through a staged form (dirty/overridden/reset semantics); the consumers (directory picker fork, pi-ai fork, dsh-llm fork) read the namespace at use time, so changes take effect immediately without a restart.
- When the current DSH build does not expose the namespace to the settings page, the card shows an explanation instead of a form; a read-only deployment disables the controls.

## Configuration

The card reads and writes the `dsh-defaults` settings namespace.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `defaultWorkingDirectory` | `string` | unset (empty) | Directory the picker opens at when adding a workspace; empty = home directory |
| `defaultRetryCount` | `integer >= 0` | unset | Default model-failure retry count for providers without their own policy; 0 = no retry |

## Model Experience

None, as the plugin is a browser-only settings card that only reads and writes the `dsh-defaults` settings namespace.

#### KV Cache effect

No direct invalidation: the card writes consumer defaults that are read at use time, never from the model prompt, so a save cannot perturb any session prefix.

## Known Limitations and Deferred Work

- The card depends on the `dsh-defaults` namespace being exposed to the settings page; a build that does not expose it shows only an explanatory notice.
- The defaults only affect the forked consumers that read the namespace (the directory picker and the provider forks); other consumers that ignore the namespace keep their own behavior.
- The default retry count applies only to providers without their own retry policy, so tuning it has no effect on providers that declare one.
