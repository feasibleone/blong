import {browser, realm} from '@feasibleone/blong';

/**
 * browser-test.ts — Browser platform suite for `blob`'s tap run.
 *
 * The server platform announces its gateway through the manifest the run shares with a browser
 * platform, so the tap entry loads both even though this realm has no browser-side test group of its
 * own. The `blob` realm here discovers only `browser/test` (none today) with the React layers off,
 * because the tap runner cannot load JSX.
 */
export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object(
        {
            login: blong.type.Object({}),
            access: blong.type.Object({}),
            blob: blong.type.Object({}),
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
        /** A test-only `blob` browser realm: no routes, no React layers. */
        async function blob() {
            return realm(() => ({
                url: import.meta.url,
                config: {
                    default: {'browser/orchestrator': false},
                    integration: {'browser/orchestrator': false},
                },
            }));
        },
    ],
    config: {
        default: {},
        dev: {
            login: {},
            access: {},
            blob: {},
        },
        integration: {
            testClient: {
                backend: {
                    // Namespaces the browser backend adapter proxies to the server
                    namespace: ['blob', 'login', 'access'],
                },
            },
            login: {},
            access: {},
            blob: {},
            // Disable the React browser layers for this tap run.
            'browser/orchestrator': false,
            watch: {
                test: [],
            },
        },
    },
}));
