import {realm} from '@feasibleone/blong';

/**
 * kukum realm entry point (server platform).
 *
 * Serves the primitive scaffolding / introspection API under the `kukum`
 * namespace (`/rpc/kukum/{primitive}/{predicate}`). Layers are auto-discovered.
 * There is deliberately no browser entry — kukum is server-side tooling and
 * needs filesystem access, which the browser platform stubs out.
 *
 * It does NOT reuse blong-server's db adapter: kukum operates on source files
 * and the live registry, never on tables. The `srv` realm is still loaded by
 * `index.ts` because the gateway/rpc infrastructure lives there.
 */
export default realm(() => ({
    url: import.meta.url,
    config: {
        // The layers the `kukum` command runs with (D-436): the primitive API is an orchestrator, and
        // its handlers throw typed errors from the `error` layer. No adapter is named because the
        // realm has none — it reads source files and the live registry, and the CLI suite says the
        // same thing from the other side (`framework.realms: {server: false}`, so blong-server's knex
        // adapter is never loaded and the process does not die on a database it never wanted).
        cli: {error: {}, orchestrator: {}},
        default: {},
    },
}));
