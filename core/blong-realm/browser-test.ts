import {browser, realm} from '@feasibleone/blong';

/**
 * browser-test.ts — Browser platform suite for `blong` tap tests.
 *
 * Loads the browser-side realms needed by the tap test flows (blong-test for
 * HTTP dispatch, blong-login for authentication helpers, blong-access for the
 * RBAC realm) plus a **test-only** `blong` browser realm that discovers only
 * the `browser/test/` layer. The React `browser/orchestrator` layer is disabled
 * via config so the tap/ts-node runner does not try to load JSX.
 *
 * The browser-side `test.flow.flow` test calls the `blong` API over HTTP
 * through the backend adapter, exercising the gateway RBAC (401/403/200).
 */
export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object(
        {
            login: blong.type.Object({}),
            access: blong.type.Object({}),
            blong: blong.type.Object({}),
            testClient: blong.type.Object({
                backend: blong.type.Object({
                    namespace: blong.type.Array(blong.type.String()),
                }),
            }),
        },
        {additionalProperties: false},
    ),
    children: [
        /** blong-test: provides test dispatch + backend HTTP adapter */
        async function testClient() {
            return import('@feasibleone/blong-test/browser.ts');
        },
        /** blong-login: browser-side authentication helpers */
        async function login() {
            return import('@feasibleone/blong-login/browser.ts');
        },
        /** blong-access: RBAC realm (login/authorization) */
        async function access() {
            return import('@feasibleone/blong-access/browser.ts');
        },
        /**
         * Test-only `blong` browser realm — discovers only the browser/test
         * layer (no React orchestrator components, which the tap runner cannot
         * load).
         */
        async function blong() {
            return realm(() => ({
                url: import.meta.url,
                // No browser test layer: the realm's grant is asserted on the
                // server side against the authorization the gateway reads, and
                // the end-to-end refusal is asserted where the pages live.
                children: [],
                config: {
                    default: {
                        // The React layers are off for this tap run: the runner has no
                        // DOM, and a page component that imports PrimeReact fails to
                        // load rather than simply not rendering.
                        'browser/orchestrator': false,
                        component: false,
                    },
                    integration: {
                        'browser/orchestrator': false,
                        component: false,
                    },
                },
            }));
        },
    ],
    config: {
        default: {},
        dev: {
            // The tap runner has no DOM and no platform the login orchestrator can
            // build against: `orchestrator/login/token.ts` dereferences the API it
            // expects at creation time, so loading it here fails before any test runs.
            // Authentication for these flows is done server-side anyway.
            login: {orchestrator: false},
            access: {},
            blong: {},
        },
        integration: {
            testClient: {
                backend: {
                    // Namespaces the browser backend adapter proxies to the server
                    namespace: ['blong', 'login', 'access'],
                },
            },
            login: {orchestrator: false},
            access: {},
            blong: {},
            // Disable the React browser layers for this tap run.
            'browser/orchestrator': false,
            watch: {
                test: [],
            },
        },
    },
}));
