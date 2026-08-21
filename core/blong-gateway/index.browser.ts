/**
 * index.browser.ts — blong-gateway browser suite entry point.
 *
 * Wires the blong-browser portal/UI realm with the gateway management models
 * (Application/Bundle/Subscription).  Runs standalone (Vite dev server) and as
 * a Playwright target for the management UI tests.
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
        gateway: blong.type.Object({}),
    }),
    children: [
        /** Built-in blong-browser realm: RPC, auth, portal, auth orchestrators */
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/browser.ts');
        },
        /** API Gateway realm (management models) */
        async function gateway() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {
            ui: {
                portal: {
                    portal: {
                        title: 'Blong Gateway',
                    },
                },
            },
            gateway: {},
            login: {},
        },
    },
}));
