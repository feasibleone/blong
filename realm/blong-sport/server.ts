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
export default realm(() => ({url: import.meta.url}));
