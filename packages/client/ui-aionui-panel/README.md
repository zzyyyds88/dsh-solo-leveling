# @deepseek-ai/dsh-client-ui-aionui-panel

Right-panel system for DSH Web (browser half): explorer file tree, multi-tab preview, and a real git SCM panel.

## Purpose

- Mounts the explorer and preview columns into the web shell's frame grid by appending two trailing grid tracks on every shell grid write, with absolute drag handles, a floating expand button, and a collapse-as-width-0 (kept-mounted) behavior; the ordered width clamps keep the chat area at least 360px.
- Explorer panel: a lazy directory tree rooted at the active session's working directory, expand/collapse with subtree cache eviction, per-project persistence, a ranked filename search, and a files/changes tab switch.
- Preview panel: multi-tab preview of markdown, html, code, diff, csv, pdf, office, image, text and url content with tab switching, reload, split source/preview, and save backed by an mtime write-conflict check; tab metadata persists per project root with LRU eviction.
- SCM panel: real git working-tree state parsed from porcelain (staged/unstaged/untracked), stage/unstage/discard batches where discard touches only the worktree side, list/tree view modes, and per-path diff tabs opened in the preview.
- Subscribes to the host SSE change stream per project root: fs events refetch the tree and refresh open diff tabs, git events land the host status directly, and git-unavailable events surface a friendly state.
- Registers a plugin-config card with a single master switch `enabled` (the `aionui-panel` namespace); toggling it unmounts or remounts the whole panel system.
- Adds a composer drop target in the `conversation.input.dock` band so a dragged explorer file path is inserted into the current draft.
- Follows the shell's document language and dark marker through DOM and CSS only, and logs wiring failures instead of throwing so the web shell boot never breaks.

## Configuration

The card reads the `aionui-panel` settings namespace (registered by the host plugin).

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Master switch for the whole right-panel system; the panels mount only while it is on |

## Model Experience

None, as the plugin is a browser-only presentation layer that renders host-served file and git data and never contributes prompt content.

#### KV Cache effect

No direct invalidation: the panels render host data routes and localStorage-backed state, so no settings change or panel action ever touches a session prefix.

## Known Limitations and Deferred Work

- The layout controller couples to the web shell's DOM structure (the `data-dsh-frame` grid or the sidebar-column parent) and its own `data-aionui-*` columns; a shell layout change can prevent the panels from attaching.
- The panels only work when the loopback host routes of `dsh-host-aionui-panel` are reachable; a standalone install without the host half renders nothing.
- Preview text is capped at 80k characters and images at 8 MiB on the host side, so very large files are truncated or rejected.
- The master-switch toggle unmounts and remounts the panels, but the layout controller is not designed for repeated cycles; a page reload is the supported way to re-establish a clean lifecycle after several toggles.
