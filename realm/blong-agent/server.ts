import {realm} from '@feasibleone/blong';

/**
 * server.ts — `agent` realm entry point (server platform).
 *
 * The realm declares its own dispatch namespace `agent` (`orchestrator/agentDispatch.ts`) instead of
 * reusing blong-server's subject orchestrator, because its vocabulary is a process lifecycle rather
 * than entity CRUD (`@@D-704`). It still reuses the shared `db` adapter for persistence, so nothing
 * else is named here: `adapter`, `orchestrator`, `error`, `gateway`, `meta` and `server/test` are
 * well-known folders and are discovered beside this file.
 */
export default realm(() => ({url: import.meta.url}));
