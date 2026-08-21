# @deepseek-ai/dsh-host-git-graph

Host half of the DSH Web git graph: a workspace-gated git service and its /git/* JSON and SSE routes.

## Purpose

- Registers the /git/* routes on the shared webserver: status (repo snapshot with branch, head, dirty/untracked/conflict counts and in-progress operation), branches (local branch list with the current branch marked), graph (topo-ordered commits across branches, tags and remotes with parents and decorations, default cap 200), switch, and create-branch.
- Enforces a workspace gate that canonicalizes the requested path with realpath and requires an exact match against a registered workspace path, so the browser can only run git on workspace roots.
- Runs the pre-switch guards: unresolved conflicts, in-progress operations (merge/rebase/cherry-pick/revert/bisect markers, probed in a single spawn), and a target branch checked out in another worktree all reject with stable error codes.
- Validates branch names with `git check-ref-format --branch` as the authoritative gate plus a pure client-side mirror, switches with `git switch --no-guess`, creates with `git switch --no-guess -c`, and classifies overwrite/not-found/worktree failures onto stable codes with the blocked-file lists.
- Maintains one SSE stream per workspace that pushes repo-status changes on a 30s poll while subscribers are connected (15s per-run timeout, anti-overlap and failure backoff via the shared poll guard), with heartbeat comments to keep proxies alive.
- Runs every git command through the managed subprocess seam with bounded collected output, choosing the platform binary (`git` on POSIX, `git.exe` on win32 to bypass cmd shims).
- Fences every route to loopback requests and requires an explicit JSON content-type to block form-based CSRF; the host owns no model-visible surface, as git switch/create are UI-triggered host operations, never tool calls.

## Model Experience

None, as the plugin is a host-only git service whose routes are triggered by UI actions and never by tool calls.

#### KV Cache effect

No direct invalidation: the /git routes read and mutate the workspace repository only and never touch the model prompt or session prefix.

## Known Limitations and Deferred Work

- The routes are loopback-only by design, so the graph cannot be driven from a remote or LAN browser session.
- The graph is capped (200 by default, clamped to 1000 max) and the SSE poll runs every 30s, so very large histories need paging and external ref changes can lag up to that interval.
- Switch and create-branch mutate the real repository shared by every session in the workspace; there is no per-session branch override.
- The runner does not catch spawn or run failures the way the sibling aionui-panel runner does, so a machine without a working git binary can surface internal errors instead of a clean non-repository state.
