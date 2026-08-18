/// <reference types="vite/client" />
/**
 * browser.ts — `$subject` realm entry point (browser platform).
 *
 * Auto-discovers the model handler (`$subject$ObjectModel`) from the `meta/`
 * folder plus the browser namespace orchestrator (`browser/orchestrator`).
 *
 * Consumed by suites that want the `$subject` domain:
 *
 *   // browser.ts
 *   async function $subject() {
 *       return import('@feasibleone/blong-$subject/browser.ts');
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
