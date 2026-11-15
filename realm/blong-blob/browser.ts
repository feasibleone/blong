/// <reference types="vite/client" />
import {realm} from '@feasibleone/blong';

/**
 * browser.ts — `blob` realm entry point (browser platform).
 *
 * The browser side of this realm is the session that sets the scope cookie; the store, the routes and
 * the metadata are server-side. `browser/orchestrator` is globbed so a suite that imports this file
 * gets the cookie-session orchestrator without naming it.
 *
 * Consumed by suites that want the `blob` domain:
 *
 *   // browser.ts
 *   async function blob() {
 *       return import('@feasibleone/blong-blob/browser.ts');
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
