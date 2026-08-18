import {server} from '@feasibleone/blong';

/**
 * index.ts — standalone server bootstrap for `$subject` integration tests.
 *
 * Wires the runtime infrastructure (blong-server, login, core, access) around
 * the `$subject` realm and enables RBAC on the gateway so access-control is
 * enforced. The realm reuses blong-server's subject orchestrator + db adapter.
 */
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
        /** Core realm — provides core.resource / core.triple for RBAC seeds */
        async function core() {
            return import('@feasibleone/blong-core/server.ts');
        },
        /** Access realm — provides authZ tables used with core.triple hierarchy */
        async function access() {
            return import('@feasibleone/blong-access/server.ts');
        },
        /** `$subject` management realm */
        async function $subject() {
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
            $subject: {},
            login: {},
        },
        integration: {
            watch: {
                test: ['test.$object'],
            },
        },
    },
}));
