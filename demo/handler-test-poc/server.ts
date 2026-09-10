import {server} from '@feasibleone/blong';

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
            login: {},
            order: {},
        },
        integration: {
            watch: {
                test: [],
            },
        },
    },
}));
