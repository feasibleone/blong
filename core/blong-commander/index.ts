import {server} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

/**
 * index.ts — standalone server bootstrap for the blong-commander integration
 * tests. Wires the runtime infrastructure (blong-server, login, core, access)
 * around the commander realm and enables RBAC on the gateway so access-control
 * is enforced.
 */
export default server(() => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    children: [
        /** Built-in blong-server realm: RPC, validation orchestrator, DB adapter */
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        /** Core realm — resource/type/triple graph schema */
        async function core() {
            return import('@feasibleone/blong-core/server.ts');
        },
        /** Access realm — authZ tables + RBAC seeds (the `access-db` source) */
        async function access() {
            return import('@feasibleone/blong-access/server.ts');
        },
        /** Commander realm — generic protocol handlers + source descriptors */
        async function commander() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {
            // Enforce RBAC on the gateway — resolves allowed actions for the
            // authenticated user (access realm), 403 when not authorized.
            gateway: {authorize: 'access.authorization.list'},
            srv: {},
            core: {},
            access: {},
            commander: {},
            // Activate the login realm — a child with no config block is
            // skipped, so without this the gateway has no login routes.
            login: {},
        },
        integration: {
            watch: {
                test: ['test.commander'],
            },
        },
    },
}));
