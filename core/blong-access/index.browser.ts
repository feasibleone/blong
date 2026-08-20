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
        login: blong.type.Object({}),
        access: blong.type.Object({}),
    }),
    children: [
        /** Built-in blong-browser realm: RPC, auth, portal, auth orchestrators */
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        /** blong-login browser realm — `login.*` subject namespace (login.token.* etc.) */
        async function login() {
            return import('@feasibleone/blong-login/browser.ts');
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
            login: {},
            access: {},
        },
        // TEST-ONLY: the `integration` intent (active in the browser for
        // dev/test/Playwright runs — the browser entry `index.html.ts`
        // hardcodes `microservice integration dev`) enables the test hook that
        // exposes the wrapped handler as `window.__blongHandler` (gated in
        // BlongContext by `portal.testHook`) so E2E tests can invoke server
        // methods directly.  Production uses the `prod` intent — never
        // `integration` — so real deployments do not expose the handler.
        // (The cast is a framework typing limitation: non-default intent
        // blocks only type the realm's own validation keys, while child-realm
        // config like `ui` is allowed at runtime via `activeConfigs`.)
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
