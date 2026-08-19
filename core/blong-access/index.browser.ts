import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for blong-access.
 *
 * Wires the built-in blong-browser realm (portal, RPC, auth) around the access
 * realm so the access model pages (Browse/New/Open) can run against the live
 * server, e.g. for the Playwright suite of this package.
 */
export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        access: blong.type.Object({}),
    }),
    children: [
        /** Built-in blong-browser realm: RPC, auth, portal, auth orchestrators */
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        /** blong-access realm (brings the access models + browser namespace) */
        async function access() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Access',
                    },
                },
            },
            access: {},
        },
    },
}));
