import { createRequire } from 'node:module';

import { browser } from '@feasibleone/blong';

export default browser(fo => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    default: {
        client: {
            backend: {
                namespace: ['subject', 'hsm', 'parking', 'payshield', 'login']
            }
        },
        remote: {
            canSkipSocket: true
        },
        watch: {
            test: [
                'test.codec.mle'
                // 'test.hsm.generate.key',
                // 'test.number.sum',
                // 'test.dispatch.loop',
                // 'test.tcp.loop'
            ]
        }
    },
    validation: fo.Type.Object({}),
    children: [
        function client() { return import('./client/browser.js'); },
        function payshield() { return import('./payshield/server.js'); },
        function ctp() { return import('./ctp/server.js'); },
        function parking() { return import('./parking/server.js'); },
        function demo() { return import('./demo/server.js'); }
    ]
}));
