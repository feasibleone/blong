/// <reference types="vite/client" />
/**
 * blong-party/browser.ts — Party management realm entry point.
 *
 * Auto-discovers model handlers (partyPersonModel, etc.) and the fixture handler
 * (partyFixture) from the `meta/` folder, plus the forwarding orchestrator.
 *
 * Consumed by suites that want the party management domain:
 *
 *   // browser.ts
 *   async function party() {
 *       return import('@feasibleone/blong-party/browser.ts');
 *   }
 */
import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    children: globalThis.window
        ? import.meta.glob(['./meta/**/*.ts', './browser/orchestrator/**/*.ts'])
        : ['./meta', './browser/orchestrator'],
    config: {
        default: {
            meta: true,
            orchestrator: true,
            component: true,
        },
    },
}));
