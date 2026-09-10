/// <reference types="vite/client" />
/**
 * blong-access/browser.ts — RBAC access control realm entry point.
 *
 * Auto-discovers schema definitions and DB config from the `meta/` folder.
 *
 * Consumed by suites that need user profiles, credentials, RBAC roles,
 * capabilities, actions, policies, access flows, and audit logging.
 */
import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    // Only the model specs (+ the browser layer) belong in the browser bundle.
    // The server-side `meta/db`, `meta/dbTest` and `meta/type` groups are
    // loaded by the server realm, not here — pulling them into the browser
    // would break the Vite bundle (e.g. `node:path` in `meta/db/db.ts`).
    // The profile page JSX lives in `src/pages/` (not a well-known layer
    // folder) so the Node tap runner never tries to load `.tsx`; Vite bundles
    // it via the lazy dynamic import in the component handler.
    children: globalThis.window
        ? import.meta.glob(['./meta/model/**/*.ts', './browser/**/*.ts'])
        : ['./meta/model', './browser'],
    config: {
        default: {
            meta: true,
            orchestrator: true,
            component: true,
        },
    },
}));
