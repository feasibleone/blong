import {createRequire} from 'node:module';

import {server} from '@feasibleone/blong';

export default server(blong => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    url: import.meta.url,
    default: {},
    microservice: {},
    dev: {
        resolution: true,
        parking: {},
        gateway: {
            logLevel: 'warn',
            debug: true,
            sign: {
                kty: 'EC',
                d: 'BYfl8to6zRfjjm7jFYtY5i_BwR2jXspsv1HDN0OLIaz-tUiACKZBeRruaLzBrHXJ',
                use: 'sig',
                crv: 'P-384',
                x: 'pM8gcPvgdKrKaxQmIC7Q67AvV7KteWqU5I4X83ErVinZnAgeT1KwfhCYssD3YNvK',
                y: 'SVsvfEm3CVu2WjOho2frL7LnaXeOQHC1JT856bOH-Vp3E-4_1j2Kp9KHJJf7Qn1v',
                alg: 'ES384',
            },
            encrypt: {
                d: '3UScww8iqdRaBeTraC61WCFoO3fisO9A0p49P_GI6BuZO26-WUyElUWoKyhkcbeI',
                kty: 'EC',
                use: 'enc',
                crv: 'P-384',
                x: 's8uFX_D-Ow5Q6UoRs6tFDBDkpdpcsueSl7-oyPpBFdgY6Co9L2AZknuqA4vDSKe4',
                y: 'IffoB24bdS2nk699nXMB4cVe7LgLdinCKNGgrgcPHlPXnqfdJ7T5DLucLLJP0DQA',
                alg: 'ECDH-ES+A256KW',
            },
        },
        demo: {
            login: {
                keys: {
                    refresh: 'b1226b7ed6c6e5aded611ffb55a26a18154fb2263c8c2ea0974dd63e8e11919b',
                    access: {
                        crv: 'Ed25519',
                        x: 'hhcGW1iHk_YWlNYDxn7P4PGV1N6mPjghBge4O7zterQ',
                        d: 'KGpSfEzpbelEdQStQBlYmHPkHrG4cEcRx_yJZkRc_qY',
                        kty: 'OKP',
                        kid: 'kMfX1WoDc9dWVRugwGh9sSL956JS7yB8jE1ylo71Z-M',
                        use: 'sig',
                        alg: 'EdDSA',
                    },
                },
            },
        },
    },
    validation: blong.type.Object({}),
    children: [
        function ctp() {
            return import('./ctp/server.js');
        },
        function parking() {
            return import('./parking/server.js');
        },
        function payshield() {
            return import('./payshield/server.js');
        },
        function demo() {
            return import('./demo/server.js');
        },
        function db() {
            return import('./db/server.js');
        },
    ],
}));
