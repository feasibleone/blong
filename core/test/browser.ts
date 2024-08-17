import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        function client() {
            return import('./client/browser.js');
        },
        function login() {
            return import('./login/browser.js');
        },
        function payshield() {
            return import('./payshield/browser.js');
        },
        function ctp() {
            return import('./ctp/browser.js');
        },
        function parking() {
            return import('./parking/browser.js');
        },
        function demo() {
            return import('./demo/browser.js');
        },
    ],
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
}));
