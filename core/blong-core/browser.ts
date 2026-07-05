/// <reference types="vite/client" />
/**
 * blong-core/browser.ts — Core utility realm entry point.
 *
 * Auto-discovers schema definitions and DB config from the `meta/` folder.
 *
 * Consumed by suites that need the reusable resource/type/property/triple
 * /translation/path schema objects:
 *
 *   // browser.ts
 *   async function core() {
 *       return import('@feasibleone/blong-core/browser.ts');
 *   }
 */
import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    children: globalThis.window ? import.meta.glob(['./meta/**/*.ts']) : ['./meta'],
    config: {
        default: {
            meta: true,
        },
    },
}));
