import {realm} from '@feasibleone/blong';

/**
 * server.ts — `$subject` realm entry point (server platform).
 *
 * The realm is intentionally minimal: layer folders (`adapter`, `orchestrator`,
 * `meta`, `gateway`, `error`, `server/test`) are auto-discovered. DB access and
 * the subject namespace come from the shared `@feasibleone/blong-server` realm
 * (`srv`), wired by the standalone `index.ts` (or by a suite). Do NOT create a
 * realm-local `adapter/db.ts` or a dispatch orchestrator — reuse blong-server's.
 */
export default realm(() => ({url: import.meta.url}));
