import {browser, realm} from '@feasibleone/blong';

/**
 * browser-test.ts — Browser platform suite for blong-party integration tests.
 *
 * Loads the browser-side realms needed by the tap test flows (blong-test for
 * HTTP dispatch, blong-login for authentication helpers, blong-access for the
 * RBAC test handlers) plus a **test-only** blong-party browser realm.
 *
 * The full party browser realm (`./browser.ts`) cannot be loaded by the
 * tap/ts-node runner because its React browser layers (`browser/orchestrator`)
 * import the built blong-browser bundle.  Here the party test realm discovers
 * only the `browser/test/` layer and disables the React `browser/orchestrator`
 * layer via config, so the browser-side registration flow is exercised over
 * HTTP through the backend adapter — API-level coverage that complements the
 * Playwright UI-regression tests.
 */
export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object(
        {
            login: blong.type.Object({}),
            access: blong.type.Object({}),
            party: blong.type.Object({}),
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
        /** blong-access: RBAC realm under test (registration + profile handlers) */
        async function access() {
            return import('@feasibleone/blong-access/browser.ts');
        },
        /**
         * Test-only party browser realm — discovers only the browser/test layer
         * (no React orchestrator components, which the tap runner cannot load).
         * `browser/orchestrator` is disabled via config so the auto layer
         * discovery does not activate it.
         */
        async function party() {
            return realm(() => ({
                url: import.meta.url,
                children: ['./browser/test'],
                config: {
                    default: {
                        'browser/orchestrator': false,
                    },
                    integration: {
                        'browser/orchestrator': false,
                    },
                },
            }));
        },
    ],
    config: {
        default: {},
        dev: {
            login: {},
            access: {},
            party: {},
        },
        integration: {
            testClient: {
                backend: {
                    // Namespaces the browser backend adapter proxies to the server
                    namespace: ['access', 'login'],
                },
            },
            login: {},
            access: {},
            party: {},
            // Disable blong-party's React browser layers for this tap run.
            'browser/orchestrator': false,
            watch: {
                test: ['test.registration.flow'],
            },
        },
    },
}));
