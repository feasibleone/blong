/**
 * Well-known layer folders and their default activation per platform.
 *
 * This is the SINGLE source of truth for "which folders are layers, and which
 * intent activates them". It is shared by:
 *  - `blong-gogo` (`src/load.ts`) — implicit layer auto-discovery
 *  - `blong-kukum` — machine-readable activation introspection
 *    (`kukum.activation.find`), so tooling never has to trust prose tables
 *
 * Each entry maps a folder name (relative to a realm root, `/`-separated for
 * nested folders such as `server/test`) to the activation config applied when
 * that folder exists but has no explicit `layer.<platform>.ts` file. A folder
 * with a `layer.<platform>.ts` file supplies its own activation instead.
 *
 * A layer missing for a platform is simply not auto-discovered there.
 */
export const WELL_KNOWN_LAYERS: Record<string, {server?: object; browser?: object}> = {
    api: {server: {default: true}, browser: {default: true}},
    init: {server: {default: true}, browser: {default: true}},
    meta: {server: {default: true}, browser: {default: true}},
    // `cli` activates the layers that make a realm's HANDLERS exist. It skips the
    // listeners, the watcher and the test machinery, not the realm itself — a
    // `cli` process that loaded no orchestrator would have nothing to dispatch to.
    error: {server: {integration: true, cli: true}},
    sim: {server: {integration: true}},
    adapter: {server: {integration: true, cli: true}},
    orchestrator: {server: {integration: true, cli: true}},
    gateway: {server: {integration: true}},
    backend: {browser: {integration: true}},
    component: {browser: {integration: true}},
    action: {browser: {integration: true}},
    actions: {browser: {integration: true}},
    test: {browser: {integration: true}},
    'server/api': {server: {integration: true, cli: true}},
    'server/init': {server: {default: true}},
    'server/test': {server: {integration: true}},
    'browser/api': {browser: {integration: true}},
    'browser/init': {browser: {default: true}},
    'browser/test': {browser: {integration: true}},
    'browser/orchestrator': {browser: {integration: true}},
};

/** All well-known layer folder names, in declaration order. */
export const WELL_KNOWN_LAYER_NAMES: readonly string[] = Object.keys(WELL_KNOWN_LAYERS);

/**
 * True when `name` is a well-known layer folder (and therefore never treated as
 * a realm child to be scaffolded on demand by the `kopi.realm` auto-trigger).
 */
export function isWellKnownLayer(name: string): boolean {
    return name in WELL_KNOWN_LAYERS;
}
