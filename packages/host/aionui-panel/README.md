# @deepseek-ai/dsh-host-aionui-panel

Host half of the DSH right-panel system: workspace-gated filesystem and git services plus the /aionui-panel/* JSON and SSE routes.

## Purpose

- Registers the /aionui-panel/* routes on the shared webserver: list, read, write (with an mtime conflict check), search, delete, git-status, git-diff, git-stage, git-unstage, git-discard, a raw file-stream route (with single-range byte seeking), and an SSE change stream per project root.
- Enforces a workspace gate on every operation: the requested root is canonicalized with realpath and must resolve inside a registered workspace; a symlink cannot smuggle an operation out of the root, .git paths are refused, and untracked deletes refuse look-alike paths outside the session root.
- Provides the filesystem service: sorted directory listings, text reads capped at 80k characters, image reads as data URLs (8 MiB cap) with a header dimension probe, ranked filename search with caps and noise-dir pruning, and a recursive fs watcher that ignores node_modules/.git and falls back to a 3s signature poll where recursive watch is unavailable.
- Provides the git service: porcelain v1 -z status parsing into staged/unstaged/untracked, unified diffs (index vs HEAD for staged, worktree vs index for unstaged, /dev/null for untracked), stage (`git add`), unstage (`git restore --staged`), and discard that restores tracked paths from the index and deletes untracked paths through the fs seam.
- Maintains one SSE stream per root: fs watch events plus a 30s git-status poll (15s per-run timeout) pushed to subscribers, with a one-shot git-binary probe that stops polling on machines without git and a heartbeat comment to keep proxies alive.
- Registers the `aionui-panel` settings namespace with a single `enabled` switch that the browser half consumes; the data routes stay ready regardless.
- Announces the plugin to every agent through a system-prompt section so agents know the right-panel system exists and how to cooperate with it.
- Fences every route to loopback requests (socket address plus Host header plus same-origin markers) so a LAN-exposed deployment cannot reach the file/git operations, and requires an explicit JSON content-type to block form-based CSRF.

## Configuration

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Master switch for the panel system; consumed by the browser half, the data routes are always served |

## Model Experience

None, as the plugin contributes no dynamic model-visible surface; its only prompt contribution is a fixed system-prompt announcement section.

#### KV Cache effect

No direct invalidation: the announcement section text is constant at apply time and never changes per request, so it cannot perturb or invalidate the session prefix.

## Known Limitations and Deferred Work

- The routes are loopback-only by design, so the panel data cannot be reached from a remote or LAN browser session.
- Text previews cap at 80k characters and images at 8 MiB; very large files are truncated or rejected.
- The git-status poll interval is deliberately long (30s) because a cold git.exe on Windows costs about 0.7s per spawn, so external .git changes (commits or checkouts from other tools) can lag by up to that interval.
- A standalone host install serves only the data routes and the prompt announcement; the browser half is required for any visible panel UI.
