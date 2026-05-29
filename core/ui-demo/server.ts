import {server} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default server(blong => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    validation: blong.type.Object({
        srv: blong.type.Object({}),
        marine: blong.type.Object({}),
    }),
    children: [
        /** Built-in blong-browser realm: RPC, auth, portal, auth orchestrators */
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        /** Marine biology demonstration realm */
        async function marine() {
            return import('@feasibleone/blong-marine/server.ts');
        },
    ],
    config: {
        default: {
            remote: {
                canSkipSocket: true,
            },
            srv: {
                'subject.validation': {
                    mock: {
                        marineCoralModel: true,
                        marineFamilyModel: true,
                        marineHabitatModel: true,
                        marineSpeciesModel: true,
                    },
                },
            },
            marine: {},
        },
        dev: {
            resolution: true,
            srv: {
                adapter: {},
            },
            login: {},
            gateway: {
                logLevel: 'warn',
                debug: true,
                expectedErrors: true,
                sign: process.env.GATEWAY_SIGN_KEY
                    ? {env: 'GATEWAY_SIGN_KEY'}
                    : {generate: {alg: 'ES384', crv: 'P-384', use: 'sig'}},
                encrypt: process.env.GATEWAY_ENCRYPT_KEY
                    ? {env: 'GATEWAY_ENCRYPT_KEY'}
                    : {generate: {alg: 'ECDH-ES+A256KW', crv: 'P-384', use: 'enc'}},
            },
        },
    },
}));
