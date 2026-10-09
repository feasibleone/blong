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
 *
 * The three intents an activation may name mean different things, which is what keeps a deployment
 * explainable: `microservice` asks for the layers that make a realm work, `integration` for what a
 * test needs on top of that, and `default` for what nothing decides (the plumbing every process has).
 * `release` appears nowhere on purpose — a released process takes its layers from the flags its plan
 * wrote, and only the configuration it reads from the `release` block of `core/blong-gogo/src/load.ts`.
 */
export const WELL_KNOWN_LAYERS: Record<string, {server?: object; browser?: object}> = {
    api: {server: {default: true}, browser: {default: true}},
    init: {server: {default: true}, browser: {default: true}},
    meta: {server: {default: true}, browser: {default: true}},
    backend: {browser: {default: true}},
    component: {browser: {default: true}},
    action: {browser: {default: true}},
    actions: {browser: {default: true}},
    'browser/api': {browser: {default: true}},
    'browser/init': {browser: {default: true}},
    'browser/orchestrator': {browser: {default: true}},
    error: {server: {microservice: true, k8s: true, upgrade: true}},
    adapter: {server: {microservice: true, k8s: true, upgrade: true}},
    orchestrator: {server: {microservice: true, k8s: true, upgrade: true}},
    gateway: {server: {microservice: true, k8s: true}},
    'server/api': {server: {microservice: true, k8s: true}},
    sim: {server: {integration: true}},
    'server/test': {server: {integration: true}},
    test: {browser: {integration: true}},
    'browser/test': {browser: {integration: true}},
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
