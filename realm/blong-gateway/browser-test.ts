import {browser} from '@feasibleone/blong';

/**
 * browser-test.ts — Browser platform suite for blong-gateway integration tests.
 *
 * Loads the needed browser-side realms (blong-test for HTTP dispatch,
 * blong-login for authentication helpers) and the blong-gateway realm itself.
 * Test handlers are auto-discovered from the gateway realm's browser/test/
 * layer, which routes business calls (loginTokenCreate, gateway.application.*,
 * meterprobe.*, vision.compute) through the backend HTTP adapter to the
 * server-side gateway — exercising the real Fastify ApiGateway metering plugin
 * over HTTP against real MySQL + Redis (no mocks).
 */
export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object(
        {
            login: blong.type.Object({}),
            gateway: blong.type.Object({}),
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
        /** blong-gateway: the realm under test */
        async function gateway() {
            return import('./browser.ts');
        },
    ],
    config: {
        default: {},
        dev: {
            login: {},
            gateway: {},
        },
        integration: {
            testClient: {
                backend: {
                    // Namespaces the browser backend adapter proxies to the server
                    namespace: ['meterprobe', 'vision', 'customer', 'login', 'gateway'],
                },
            },
            login: {},
            gateway: {},
            watch: {
                test: ['test.meter.http.flow'],
            },
        },
    },
}));
