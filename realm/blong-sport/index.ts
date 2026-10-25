import {server} from '@feasibleone/blong';

/**
 * index.ts — standalone server bootstrap for `sport` integration tests.
 *
 * Only the `sport` realm and the test runner are children. The framework
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
        /**
         * Gateway realm — OAuth applications, bundles and subscriptions. Party's
         * ACL-matrix test seeds grant an application its scope, so a suite that
         * attaches `party` must attach this realm too or the seed phase fails
         * on the missing gateway tables.
         */
        async function gateway() {
            return import('@feasibleone/blong-gateway/server.ts');
        },
        /** Business parties: people and organisations the profiles extend */
        async function party() {
            return import('@feasibleone/blong-party/server.ts');
        },
        /** `sport` management realm */
        async function sport() {
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
        dev: {
            srv: {},
            core: {},
            access: {},
            gateway: {},
            party: {},
            sport: {},
            login: {},
            testRealm: {
                // Only this realm's server group may be started from the Test
                // runs console; the runner refuses every other method.
                testRun: {serverGroups: ['test.athlete']},
            },
        },
        integration: {
            watch: {
                test: ['test.athlete'],
            },
            gateway: {},
            party: {},
            sport: {},
            testRealm: {
                testRun: {serverGroups: ['test.athlete']},
            },
        },
        // Playwright drives the UI; the server does not need to run every test
        // group on boot, and those runs share the database with the console.
        playwright: {
            watch: {test: []},
        },
        'test-ui': {
            testRealm: {
                testRun: {serverGroups: ['test.athlete']},
            },
        },
    },
}));
