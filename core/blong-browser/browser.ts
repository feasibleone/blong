/**
 * browser.ts — blong-browser browser realm entry point.
 *
 * Import this module in a suite's browser.ts to include the blong-browser
 * built-in layers (RPC adapter, auth adapter, portal orchestrator, auth
 * orchestrator) in the browser registry.
 *
 * @example Suite browser.ts
 * ```ts
 * import {browser} from '@feasibleone/blong';
 * export default browser(blong => ({
 *   url: import.meta.url,
 *   children: [
 *     async function blongUi() {
 *       return import('@feasibleone/blong-browser/browser.js');
 *     },
 *     './marine',
 *   ],
 * }));
 * ```
 */
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        adapter: blong.type.Boolean(),
        orchestrator: blong.type.Boolean(),
    }),
    children: ['./adapter', './orchestrator'],
    config: {
        default: {
            adapter: true,
            orchestrator: true,
        },
    },
}));
