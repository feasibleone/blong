import {server} from '@feasibleone/blong';

/**
 * index.ts — standalone server bootstrap for `blong` integration tests.
 *
 * Only the realm itself is named. The infrastructure it needs — blong-server for
 * the runtime, login for authentication, core and access for RBAC — is loaded by
 * the framework, which resolves each of those realms from this file's own
 * location and therefore only loads the ones this package depends on. Naming
 * them here as well would be redundant wiring, and the framework skips a realm a
 * suite has already named anyway.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        /** `blong` — the realm under test */
        async function blong() {
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
            // Only the realm's own block. The realms the framework loads are given
            // theirs by the framework, which fills an empty block for each child it
            // loads — a child with no block is skipped, which is why that has to
            // happen where the child is created rather than here.
            blong: {},
        },
        integration: {
            watch: {
                test: ['test.blongRealmFlow'],
            },
        },
    },
}));
