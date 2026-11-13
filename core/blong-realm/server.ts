import {realm} from '@feasibleone/blong';

/**
 * server.ts — the `blong` realm entry point (server platform).
 *
 * The realm is intentionally minimal: layer folders (`adapter`, `orchestrator`,
 * `meta`, `server/test`) are auto-discovered. It owns no tables and no CRUD: its
 * six methods are reads of the semantic-log cluster service, reached through the
 * `semlog` HTTP port, and the `blong` namespace is declared by
 * `orchestrator/blong.ts`.
 *
 * The config slice below exists for that orchestrator: a port is handed the
 * config its own name resolves to, so a namespace-owning orchestrator needs an
 * entry even when it has nothing to configure.
 */
export default realm(() => ({
    url: import.meta.url,
    config: {
        default: {
            blong: {},
            // The semantic-log realm is an aid rather than a workload: it is not a process of its
            // own and is not carried by every process (`@@D-433`). `blong` is its name in the
            // registry.
            //
            // `attached` is the third way and the one this realm takes: it rides in the process that
            // carries the realm it names — `core`, the library realms' own — so a deployment keeps
            // one fewer pod, while the namespace its pages call still reaches a Service (@@D-833).
            // A suite that wants it otherwise has the role for it: `service` gives it a process of
            // its own, `none` leaves it out, and `framework.realms.blong: false` does not load it at
            // all — the plan then has no realm to place.
            k8s: {k8sRealmRole: 'attached', k8sRealmAttachedTo: 'core'},
        },
    },
}));
