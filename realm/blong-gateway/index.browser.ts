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
        ui: blong.type.Object({}),
    }),
    children: [
        async function blong() {
            return import('@feasibleone/blong-realm/browser.ts');
        },
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
            blong: {},
        },
        // TEST-ONLY: the `integration` intent (active in the browser for dev/test/Playwright
        // runs) enables the hook that exposes the wrapped handler as `window.__blongHandler`
        // (gated in BlongContext by `portal.testHook`). `observedMergeFlow.play.ts` needs it:
        // the merge is a management write with no page of its own, so the only way to produce
        // the flow is to invoke the method from the page. Production runs the `prod` intent and
        // never `integration`, so a real deployment does not expose the handler proxy.
        integration: {
            ui: {
                portal: {
                    portal: {
                        testHook: true,
                    },
                },
            },
        },
    },
}));
