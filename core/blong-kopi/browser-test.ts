import {browser, realm} from '@feasibleone/blong';

/**
 * browser-test.ts — Browser platform suite for `$subject` tap tests.
 *
 * Loads the browser-side realms needed by the tap test flows (blong-test for
 * HTTP dispatch, blong-login for authentication helpers, blong-access for the
 * RBAC realm) plus a **test-only** `$subject` browser realm that discovers only
 * the `browser/test/` layer. The React `browser/orchestrator` layer is disabled
 * via config so the tap/ts-node runner does not try to load JSX.
 *
 * The browser-side `test.$object.flow` test calls the `$subject` API over HTTP
 * through the backend adapter, exercising the gateway RBAC (401/403/200).
 */
export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object(
        {
            login: blong.type.Object({}),
            access: blong.type.Object({}),
            $subject: blong.type.Object({}),
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
         * Test-only `$subject` browser realm — discovers only the browser/test
         * layer (no React orchestrator components, which the tap runner cannot
         * load).
         */
        async function $subject() {
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
            $subject: {},
        },
        integration: {
            testClient: {
                backend: {
                    // Namespaces the browser backend adapter proxies to the server
                    namespace: ['$subject', 'login', 'access'],
                },
            },
            login: {},
            access: {},
            $subject: {},
            // Disable the React browser layers for this tap run.
            'browser/orchestrator': false,
            watch: {
                test: ['test.$object.flow'],
            },
        },
    },
}));
