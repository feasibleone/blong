import {realm} from '@feasibleone/blong';

/**
 * server.ts — `kustomize` realm entry point (server platform).
 *
 * The layer folders (`orchestrator`, `meta`, `error`, `server/test`) are
 * auto-discovered, and `orchestrator/layer.server.ts` declares `default: true`,
 * so that layer loads in **every** intent — the `k8s` generator, a serving
 * process and the realm's own CLI alike. Which of the port's APIs is live is a
 * question for the port's activation keys (`generateManifests`), never for the
 * gate; a reader who takes a gate at face value will look for the wrong bug
 * (F-392). A custom top-level folder cannot be used for this: the loader's
 * `discoverLayerFolders` scans only `WELL_KNOWN_LAYERS`, and a non-well-known
 * folder is only reachable as a child *realm* (with its own `server.ts`).
 *
 * The realm has NO database and does not reuse `blong-server`'s db adapter or
 * `srv` realm: it is a bare-cluster installer whose state is the Kubernetes
 * objects it generates and reads back.
 *
 * Its role is `none` for the same reason: the realm is the installer, deployed
 * once per cluster as the operator, never as a service of a suite's (D-433).
 */
export default realm(() => ({
    url: import.meta.url,
    config: {
        default: {k8s: {k8sRealmRole: 'none'}},
        // ... while a run of this realm *as* the realm — its own entry, its tests, the CLI — is the
        // process itself, so there it is a service of its own (the plan's own tests describe exactly
        // that shape). The role is per intent because the two answers are about different things: a
        // deployment of somebody else's suite never places this realm, and a developer run of this
        // realm is the only thing loaded.
        dev: {k8s: {k8sRealmRole: 'service'}},
        integration: {k8s: {k8sRealmRole: 'service'}},
        // The layers the realm's own command runs with (D-436). `cli` is recorded in no entry of
        // `WELL_KNOWN_LAYERS`, so a package that ships a CLI names the folders its command needs
        // rather than inheriting them from a table that no longer has an opinion about it: the two
        // commands this realm answers (`release-notify`, `volume-prune`) are orchestrator handlers,
        // they throw typed errors, and the one that speaks to a cluster reaches it through this
        // realm's own adapter. Nothing here serves HTTP, so the `gateway` layer is not named — and
        // the tree-writing command is not this process at all: it re-runs the framework in a child
        // with the `k8s` intent.
        cli: {error: {}, adapter: {}, orchestrator: {}},
    },
}));
