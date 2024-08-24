import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.String(),
    children: ['./client', './login', './payshield', './ctp', './parking', './demo'],
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
