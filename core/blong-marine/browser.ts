/// <reference types="vite/client" />
/**
 * blong-marine/browser.ts — Marine biology shared realm entry point.
 *
 * Auto-discovers model handlers (marineCoralModel, etc.) and the fixture handler
 * (marineFixture) from the `meta/` folder, plus the forwarding orchestrator.
 *
 * Consumed by suites that want the marine biology domain:
 *
 *   // browser.ts
 *   async function marine() {
 *       return import('@feasibleone/blong-marine/browser.ts');
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
        },
    },
}));
