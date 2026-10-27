import unchanged from '@feasibleone/blong';
import {realm} from '@feasibleone/blong';

/**
 * server.ts — `sport` realm entry point (server platform).
 *
 * The realm is intentionally minimal: layer folders (`adapter`, `orchestrator`,
 * `meta`, `gateway`, `error`, `server/test`) are auto-discovered. DB access and
 * the subject namespace come from the shared `@feasibleone/blong-server` realm
 * (`srv`), which the loader adds from this package's manifest — the standalone
 * `index.ts` names only this realm. Do NOT create a realm-local `adapter/db.ts`
 * or a dispatch orchestrator — reuse blong-server's.
 */
export default realm(() => ({
    url: import.meta.url,
    // What this realm is in every deployment: a process of its own. A suite that deploys it as a
    // monolith still names it in its `k8s` block, but the answer belongs to the realm (@@D-437).
    config: {default: {k8s: {k8sRealmRole: 'service'}}},
}));
