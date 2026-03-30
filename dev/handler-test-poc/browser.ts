import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        order: blong.type.Object({}),
        testClient: blong.type.Object({
            backend: blong.type.Object({
                namespace: blong.type.Array(blong.type.String()),
            }),
        }),
    }),
    children: [
        async function testClient() {
            return import('@feasibleone/blong-test/browser.ts');
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
            order: {},
        },
        integration: {
            testClient: {
                backend: {
                    namespace: ['order', 'mock'],
                },
            },
            watch: {
                test: [
                    'test.order.checkpoint',
                    'test.order.graduate',
                    'test.order.invariant',
                    'test.order.canary',
                ],
            },
        },
    },
}));
