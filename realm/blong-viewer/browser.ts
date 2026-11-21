/// <reference types="vite/client" />
import {realm} from '@feasibleone/blong';

/**
 * browser.ts — the `viewer` realm's browser entry point.
 *
 * It loads the namespace registration and the page: the record component, the
 * menu group that links it, and the subject namespace that lets `viewer.*` calls
 * bind. There is no model and no fixture — the realm has no rows to browse, so
 * the scaffold's `meta/model` and `meta/fixture` were removed with them.
 *
 * `meta/type` and `meta/db` are not globbed at all: they are server-side (seed
 * files) and would not bundle.
 *
 * Consumed by suites that want the page in their portal:
 *
 *   // browser.ts
 *   async function viewer() {
 *       return import('@feasibleone/blong-viewer/browser.ts');
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
