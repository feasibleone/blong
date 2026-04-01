import { server } from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        './order',
    ],
    config: {
        default: {
            registry: {
                checkpointMode: 'test',
            },
            rpcServer: {
                port: 0,
            },
        },
        microservice: {},
        dev: {
            resolution: true,
            login: {},
            order: {},
            gateway: {
                logLevel: 'warn',
                debug: true,
                sign: {
                    kty: 'EC',
                    ...(process.env.GATEWAY_SIGN_KEY_D && {d: process.env.GATEWAY_SIGN_KEY_D}),
                    use: 'sig',
                    crv: 'P-384',
                    x: 'pM8gcPvgdKrKaxQmIC7Q67AvV7KteWqU5I4X83ErVinZnAgeT1KwfhCYssD3YNvK',
                    y: 'SVsvfEm3CVu2WjOho2frL7LnaXeOQHC1JT856bOH-Vp3E-4_1j2Kp9KHJJf7Qn1v',
                    alg: 'ES384',
                },
                encrypt: {
                    kty: 'EC',
                    ...(process.env.GATEWAY_ENCRYPT_KEY_D && {d: process.env.GATEWAY_ENCRYPT_KEY_D}),
                    use: 'enc',
                    crv: 'P-384',
                    x: 's8uFX_D-Ow5Q6UoRs6tFDBDkpdpcsueSl7-oyPpBFdgY6Co9L2AZknuqA4vDSKe4',
                    y: 'IffoB24bdS2nk699nXMB4cVe7LgLdinCKNGgrgcPHlPXnqfdJ7T5DLucLLJP0DQA',
                    alg: 'ECDH-ES+A256KW',
                },
            },
        },
        integration: {
            watch: {
                test: [],
            },
        },
    },
}));
