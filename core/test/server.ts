import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        async function openapi() {
            return import('@feasibleone/blong-openapi/server.ts');
        },
        './ctp',
        './parking',
        './demo',
        './db',
    ],
    config: {
        default: {},
        microservice: {},
        integration: {
            openapi: {},
        },
        dev: {
            resolution: true,
            parking: {},
            login: {},
            gateway: {
                logLevel: 'warn',
                debug: true,
                sign: process.env.GATEWAY_SIGN_KEY
                    ? {env: 'GATEWAY_SIGN_KEY'}
                    : {generate: {alg: 'ES384', crv: 'P-384', use: 'sig'}},
                encrypt: process.env.GATEWAY_ENCRYPT_KEY
                    ? {env: 'GATEWAY_ENCRYPT_KEY'}
                    : {generate: {alg: 'ECDH-ES+A256KW', crv: 'P-384', use: 'enc'}},
            },
            demo: {},
            ctp: {},
        },
    },
}));
