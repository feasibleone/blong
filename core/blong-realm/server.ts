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
        },
    },
}));
