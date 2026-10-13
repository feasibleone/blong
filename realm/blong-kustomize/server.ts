import {realm} from '@feasibleone/blong';

/**
 * server.ts — `kustomize` realm entry point (server platform): a bare-cluster installer with no
 * database (@@D-437 @@F-392).
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
        // The layers the realm's own command runs with (@@D-436). `cli` is recorded in no entry of
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
