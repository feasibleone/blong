/**
 * browser.ts — ui-demo suite browser entry point.
 *
 * Wires the blong-browser built-in realm (RPC adapter, auth, portal) with the
 * marine biology demonstration realm so the two can cooperate in a single
 * browser registry during development and integration tests.
 */
import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        ui: blong.type.Object({}),
        marine: blong.type.Object({}),
    }),
    children: [
        /** Built-in blong-browser realm: RPC, auth, portal, auth orchestrators */
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        /** Marine biology demonstration realm */
        async function marine() {
            return import('./marine/browser.ts');
        },
    ],
    config: {
        default: {
            remote: {
                canSkipSocket: true,
            },
            ui: {
                portal: {
                    portal: {
                        title: 'UI Demo',
                    },
                },
            },
            marine: {},
        },
        dev: {
            ui: {
                adapter: {},
            },
        },
    },
}));
