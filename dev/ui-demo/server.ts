/**
 * ui-demo server — reference suite demonstrating blong-ui.
 *
 * Provides a simple "sample" realm with CRUD operations
 * for a sample entity, served by the Blong gateway.
 */

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
        './sample',
    ],
    config: {
        default: {},
        dev: {
            login: {},
            openapi: {},
            sample: {},
            gateway: {
                url: 'http://localhost:8080',
                api: '/rpc',
            },
        },
    },
}));
