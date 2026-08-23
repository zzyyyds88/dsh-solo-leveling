/**
 * Module bridging for `use-sync-external-store` under TS6 strict exports
 * resolution. The runtime package (1.2.0) has no `exports` field, so the
 * ESM-necessary `.js`-suffixed specifier cannot resolve the DefinitelyTyped
 * declaration (whose `exports` only publishes the bare `./shim/with-selector`
 * subpath). The member is declared by type-querying the bare specifier the
 * @types package does export.
 *
 * Deliberately a `.ts` file, not `.d.ts`: the repo's .gitignore excludes
 * declaration files generated into src directories (only css-modules and
 * token-meter are allowlisted), so a `.d.ts` shim would silently never reach
 * fresh clones — exactly the Windows-builds / Linux-fails split this shim
 * exists to close.
 */
declare module 'use-sync-external-store/shim/with-selector.js' {
  export const useSyncExternalStoreWithSelector: typeof import('use-sync-external-store/shim/with-selector').useSyncExternalStoreWithSelector
}
