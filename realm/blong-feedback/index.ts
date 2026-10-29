import {server} from '@feasibleone/blong';

/**
 * index.ts — standalone server bootstrap for `feedback` integration tests.
 *
 * Only the `feedback` realm and the test runner are children. The framework
 * realms it reuses — blong-server (`srv`), login, core, access and blong — are
 * loaded by the loader before any suite child, so `testRealm.testDispatch` is
 * the last port to claim the `test` namespace and serves `test.run.*`. The
 * `dev` blocks below still name them, because a config block is where a realm
 * is configured and not a child declaration.
 *
 * RBAC is enforced on the gateway: the access realm resolves the caller's allowed
 * actions, and a call without one is answered 403.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        /** `feedback` management realm */
        async function feedback() {
            return import('./server.ts');
        },
        /** Server-hosted test runner (test intents only) */
        async function testRealm() {
            return import('@feasibleone/blong-test/server.ts');
        },
    ],
    config: {
        default: {
            // Enforce RBAC on the gateway — resolves allowed actions for the
            // authenticated user (access realm), 403 when not authorized.
            gateway: {authorize: 'access.authorization.list'},
        },
        // The upgrade intent reads this block to know which realms a migration
        // process carries: a realm absent from it is not loaded at all, which is
        // why an upgrade with no block above answered `getaddrinfo rpc-core` when
        // it needed a model handler.
        upgrade: {
            feedback: {},
            login: {},
            core: {},
            access: {},
        },
        dev: {
            srv: {},
            core: {},
            access: {},
            feedback: {},
            login: {},
        },
        integration: {
            // The feedback flow proves the storage contract on every save
            // (`@@T-477`).
            watch: {
                test: ['test.feedback.flow'],
            },
        },
        // Playwright drives the UI; the server does not need to run every test
        // group on boot, and those runs share the database with the console.
        playwright: {
            watch: {test: []},
        },
    },
}));
