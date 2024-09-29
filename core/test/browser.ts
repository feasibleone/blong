import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object(
        {
            parking: blong.type.Object({}),
            login: blong.type.Object({}),
            demo: blong.type.Object({}),
            payshield: blong.type.Object({}),
            ctp: blong.type.Object({}),
            testClient: blong.type.Object({
                backend: blong.type.Object({
                    namespace: blong.type.Array(blong.type.String()),
                }),
            }),
        },
        {additionalProperties: false}
    ),
    children: [
        async function testClient() {
            return import('@feasibleone/blong-test/browser.js');
        },
        async function login() {
            return import('@feasibleone/blong-login/browser.js');
        },
        './payshield',
        './ctp',
        './parking',
        './demo',
    ],
    config: {
        default: {
            remote: {
                canSkipSocket: true,
            },
        },
        dev: {
            parking: {},
            login: {},
            demo: {},
            payshield: {},
            ctp: {},
        },
        integration: {
            testClient: {
                backend: {
                    namespace: ['subject', 'hsm', 'parking', 'payshield', 'login'],
                },
            },
            watch: {
                test: [
                    'test.codec.mle',
                    'test.number.sum',
                    'test.dispatch.loop',
                    'test.hsm.generateKey',
                    'test.tcp.loop',
                ],
            },
        },
    },
}));
