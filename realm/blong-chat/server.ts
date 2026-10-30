import {realm} from '@feasibleone/blong';

/**
 * server.ts — the `chat` realm entry point (server platform).
 *
 * The realm is a bridge rather than a data domain: it owns no tables, no seeds and no pages, so its
 * `server.ts` stays what a realm entry point should be — an address and the folders the loader
 * discovers beside it. `adapter`, `orchestrator`, `error` and `server/test` are well-known layer
 * folders, which is why none of them is listed here.
 *
 * The realm reuses no subject orchestrator: persistence is deliberately absent in this pass, and the
 * seams a later stateful implementation fills are library functions (see `@@D-677`).
 */
export default realm(() => ({url: import.meta.url}));
