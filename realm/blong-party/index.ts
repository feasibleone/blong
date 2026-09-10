import {server} from '@feasibleone/blong';

export default server(() => ({
    url: import.meta.url,
    children: [
        /** Built-in blong-server realm: RPC, validation orchestrator, DB adapter */
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        /** Core realm — provides core.resource and core.triple tables */
        async function core() {
            return import('@feasibleone/blong-core/server.ts');
        },
        /** Access realm — provides authZ tables used with core.triple hierarchy */
        async function access() {
            return import('@feasibleone/blong-access/server.ts');
        },
        /** Party management realm */
        async function party() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {
            // Enforce RBAC on the gateway — resolves allowed actions for the
            // authenticated user (access realm), 403 when not authorized.
            gateway: {authorize: 'access.authorization.list'},
        },
        dev: {
            srv: {},
            core: {},
            access: {},
            party: {},
            login: {},
        },
        integration: {
            watch: {
                test: ['test.registration.flow'],
            },
        },
    },
}));
