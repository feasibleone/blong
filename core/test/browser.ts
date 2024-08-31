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
            client: blong.type.Object({}),
        },
        {additionalProperties: false}
    ),
    children: [
        './client',
        async function login() {
            return import('@feasibleone/blong-login/browser');
        },
        './payshield',
        './ctp',
        './parking',
        './demo',
    ],
    config: {
        default: {
            client: {
                backend: {
                    namespace: ['subject', 'hsm', 'parking', 'payshield', 'login'],
                },
            },
            remote: {
                canSkipSocket: true,
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
        dev: {
            parking: {},
            login: {},
            demo: {},
            payshield: {},
            ctp: {},
        },
        test: {
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
