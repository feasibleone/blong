/// <reference types="vite/client" />
import {realm} from '@feasibleone/blong';

/**
 * browser.ts — the `agent` realm's browser entry point (`@@T-796`).
 *
 * It loads the namespace registration and the page: the component that names the session route, the
 * menu group that links it, and the subject namespace that lets `agent.*` calls bind. There is no
 * model: a session is not a row to browse, and the page reads the two routes the realm already
 * publishes (`@@T-792` `@@T-793`).
 *
 * The glob is what keeps the page lazy. `meta/type` and `meta/db` are server-side and are not
 * globbed at all, so nothing of the persistence layer reaches the bundle.
 *
 * Consumed by suites that want the page in their portal:
 *
 *   // browser.ts
 *   async function agent() {
 *       return import('@feasibleone/blong-agent/browser.ts');
 *   }
 */
export default realm(() => ({
    url: import.meta.url,
    children: globalThis.window
        ? import.meta.glob(['./browser/orchestrator/**/*.ts'])
        : ['./browser/orchestrator'],
    config: {
        default: {
            orchestrator: true,
            component: true,
        },
    },
}));
