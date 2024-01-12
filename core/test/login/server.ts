import {createRequire} from 'node:module';

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    default: {
        login: {
            expire: {
                code: 60, // 1 minute
                access: 15 * 60, // 15 minutes
                cookie: 8 * 60 * 60, // 8 hours
                refresh: 8 * 60 * 60, // 8 hours
                nonce: 15 * 60, // 15 minute
            },
            cookie: {
                encoding: 'none',
                isSecure: true,
                isHttpOnly: true,
                clearInvalid: false,
                strictHeader: true,
            },
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
        loginDispatch: {
            namespace: 'login',
            imports: ['login.login'],
            validations: ['login.login.validation'],
        },
    },
    dev: {},
    microservice: {
        orchestrator: true,
        gateway: true,
    },
    integration: {},
    validation: blong.type.Object({}),
    url: import.meta.url,
    children: ['./orchestrator', './gateway'],
}));
