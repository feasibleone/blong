import { browser } from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        testClient: blong.type.Object({
            backend: blong.type.Object({
                namespace: blong.type.Array(blong.type.String()),
            }),
        }),
        login: blong.type.Object({}),
    }),
    children: [
        async function testClient() {
            return import('@feasibleone/blong-test/browser.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/browser.ts');
        },
        './order',
    ],
    config: {
        default: {
            remote: {
                canSkipSocket: true,
            },
        },
        dev: {
            login: {},
            order: {},
        },
        integration: {
            testClient: {
                backend: {
                    namespace: ['login', 'order', 'test'],
                },
            },
            watch: {
                test: [
                    'test.order.checkpoint',
                    'test.order.graduate',
                    'test.order.invariant',
                    'test.order.canary',
                    'test.order.naming',
                ],
            },
        },
    },
}));
