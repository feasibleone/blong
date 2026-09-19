/// <reference types="vite/client" />
/**
 * browser.ts — `blong` realm entry point (browser platform).
 *
 * Auto-discovers the model handler (`blongFlowModel`) from the `meta/`
 * folder plus the browser namespace orchestrator (`browser/orchestrator`).
 *
 * Consumed by suites that want the `blong` domain:
 *
 *   // browser.ts
 *   async function blong() {
 *       return import('@feasibleone/blong-blong/browser.ts');
 *   }
 */
import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    children: globalThis.window
        ? import.meta.glob(['./component/**/*.ts', './browser/orchestrator/**/*.ts'])
        : // Without a DOM the pages cannot render, and their files must not be loaded
          // either: a page imports PrimeReact, and a runner that strips types instead of
          // bundling (the tap suite) fails on a directory import inside it rather than
          // simply not rendering the page. The orchestrator layer is safe — it is where
          // the portal and the namespace bindings live.
          ['./browser/orchestrator'],
    config: {
        default: {
            orchestrator: true,
            component: true,
            // The notation the pages draw diagrams with, named rather than
            // imported: a deployment that registers another renderer changes
            // this value, and the pages never learn which one they got.
            blong: {diagram: {renderer: 'mermaid'}},
        },
    },
}));
