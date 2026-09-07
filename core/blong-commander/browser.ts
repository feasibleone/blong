import {realm} from '@feasibleone/blong';

/**
 * browser.ts — blong-commander realm entry point (browser platform).
 *
 * Enables the `commander` subject namespace (so the portal can call
 * `commander.source.list` / `commander.branch.list` / `commander.node.*`)
 * and the `commander.component` group (portal page + `portalConfigGet`).
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
