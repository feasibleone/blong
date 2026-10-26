/// <reference types="vite/client" />
/**
 * blong-core/browser.ts — Core utility realm entry point.
 *
 * Discovers the schema's browser half: the translation editor pages
 * (`meta/model`) and the subject namespace (`browser/orchestrator/subject`) that
 * lets the portal dispatch `core.*` to the gateway.
 *
 * `meta/db` and `meta/type` are NOT globbed — they are server-side table
 * definitions and would not bundle.
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
