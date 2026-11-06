import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.browser.ts — standalone browser bootstrap for `blong`.
 */
export default browser(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        blong: blong.type.Object({}),
    }),
    children: [
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/browser.ts');
        },
        async function blong() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong $Subject',
                    },
                },
            },
            login: {},
            blong: {},
        },
        // TEST-ONLY: the `integration` intent (active in a browser run) exposes the
        // wrapped handler as `window.__blongHandler` and the store as
        // `window.__blongStore`, which a Playwright spec reads to see what the pages
        // do not print — the denial of a method the session does not hold, here. A
        // deployment runs `release`, never `integration`.
        integration: {
            ui: {
                portal: {
                    portal: {
                        testHook: true,
                    },
                },
            },
        } as never,
    },
}));
