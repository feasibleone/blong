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
        // './db',
    ],
    config: {
        default: {},
        microservice: {},
        integration: {
            openapi: {},
        },
        dev: {
            parking: {},
            login: {},
            demo: {},
            ctp: {},
        },
    },
}));
