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
        integration: {
            gateway: {
                // Static keys so Playwright sessions survive server hot-reloads.
                /* cSpell:disable */
                sign: {
                    kty: 'EC',
                    crv: 'P-384',
                    alg: 'ES384',
                    use: 'sig',
                    x: 'VlRkjgqRHJSk9WN8CaAqHn34BUMy9pgKQUAAW9MrOqh0yvCmJW7JTr6LUCbm9zfW',
                    y: '8eYxbAZrv-HZEc4LSgdEHeSp21zO3D8KrynMcVcNAmZKTf3RMkbkh1B26lePHQNz',
                    d: 'aj6BkYmpwkKRbmcO1LO6d__HX5bvkqcRjqadlX7plXlGfj1d42XiSUWa4c9xrxwt',
                },
                encrypt: {
                    kty: 'EC',
                    crv: 'P-384',
                    alg: 'ECDH-ES+A256KW',
                    use: 'enc',
                    x: '86IBoWsatO3Vky9CRMxmuYcfYoTY1Yr0D1sJGDgLlREMjbL9cIOHcBQnEaW52QJV',
                    y: 'fsKOmTuXaIRFXXteh7uU0Z8mncX4VsPhqaz9pMKMm8EktQlF7HBS_fYFdkLwqMMN',
                    d: 'rBY50TZzjONw_oYzWPqaR3DdoFwO-F9sWcmkOltrJHYnfbnTojNImX2xN1DhhC5-',
                },
                /* cSpell:enable */
           },
        },
    },
}));
