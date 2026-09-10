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
export default realm(() => ({url: import.meta.url}));
