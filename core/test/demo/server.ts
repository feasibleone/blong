import { createRequire } from 'node:module';

import { realm } from '@feasibleone/blong';

export default realm(fo => ({
    pkg: createRequire(import.meta.url)('./package.json'),
    default: {
        login: {
            expire: {
                code: 60, // 1 minute
                access: 15 * 60, // 15 minutes
                cookie: 8 * 60 * 60, // 8 hours
                refresh: 8 * 60 * 60, // 8 hours
                nonce: 15 * 60 // 15 minute
            },
            cookie: {
                encoding: 'none',
                isSecure: true,
                isHttpOnly: true,
                clearInvalid: false,
                strictHeader: true
            }
        },
        http: {
            imports: ['codec.openapi']
        },
        loginDispatch: {
            namespace: 'login',
            imports: ['demo.login'],
            validations: ['demo.login.validation']
        }
    },
    dev: {},
    microservice: {
        error: true,
        adapter: true,
        orchestrator: true,
        gateway: true
    },
    integration: {
        test: true
    },
    validation: fo.Type.Object({}),
    url: import.meta.url,
    children: [
        './error',
        './adapter',
        './orchestrator',
        './gateway',
        './test'
    ]
}));
