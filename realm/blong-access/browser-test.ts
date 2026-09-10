import {browser} from '@feasibleone/blong';

/**
 * browser-test.ts — Browser platform suite for blong-access integration tests.
 *
 * Loads the needed browser-side realms (blong-test for HTTP dispatch,
 * blong-login for authentication helpers) and the blong-access realm itself.
 * Test handlers are auto-discovered from the access realm's browser/test/
 * layer, which routes business calls (loginTokenCreate, accessAuthorizationList)
 * through the backend HTTP adapter to the server-side gateway.
 */
export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object(
        {
            login: blong.type.Object({}),
            access: blong.type.Object({}),
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
        /** blong-access: the realm under test */
        async function access() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {},
        dev: {
            login: {},
            access: {},
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
            watch: {
                test: ['test.authorization.flow', 'test.session.flow'],
            },
        },
    },
}));
