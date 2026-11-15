import {server} from '@feasibleone/blong';
import {join} from 'node:path';

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
        /**
         * Gateway realm — OAuth applications, bundles and subscriptions.  The
         * ACL matrix over service accounts probes party records, but the matrix
         * over gateway applications needs this realm loaded: it owns the
         * `gateway_application` table and the bundle/subscription merges that
         * grant an application its scope.
         */
        async function gateway() {
            return import('@feasibleone/blong-gateway/server.ts');
        },
        /**
         * The blob store a person's photograph lives in (`@@D-845`).
         *
         * A companion: it owns no process and publishes no Service, so it sits beside `srv` and
         * `access` and stores whatever this process is told to. The claim it writes to is `party`'s,
         * named below — the realm that owns the record is the one that names the namespace.
         */
        async function blob() {
            return import('@feasibleone/blong-blob/server.ts');
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
            gateway: {},
            // The photographs this realm writes. `dev/blob` is gitignored, so a run leaves its files
            // where a person can look at them without committing anything (`@@D-845`). The key and the
            // cookie secret come from the realm's own `dev` block.
            blob: {
                storage: {directory: join('dev', 'blob'), namespaces: {party: {}}},
            },
            party: {},
            login: {},
        },
        integration: {
            watch: {
                test: ['test.registration.flow', 'test.acl.flow', 'test.scope'],
            },
        },
    },
}));
