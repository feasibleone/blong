import {createRequire} from 'node:module';

import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    url: import.meta.url,
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
                // 'test.hsm.generate.key',
                'test.number.sum',
                'test.dispatch.loop',
                'test.tcp.loop',
            ],
        },
    },
    dev: {
        parking: {},
        login: {},
        demo: {},
    },
    test: {
        watch: {
            test: ['test.codec.mle', 'test.number.sum', 'test.dispatch.loop'],
        },
    },
    validation: blong.type.Object({}),
    children: [
        function client() {
            return import('./client/browser.js');
        },
        function login() {
            return import('./login/browser.js');
        },
        function payshield() {
            return import('./payshield/server.js');
        },
        function ctp() {
            return import('./ctp/server.js');
        },
        function parking() {
            return import('./parking/server.js');
        },
        function demo() {
            return import('./demo/server.js');
        },
    ],
}));
