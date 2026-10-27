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
            // Explicit children need a config block to load. `testRealm` deliberately has none
            // here: the loader skips a child whose block is absent, so the test runner does not
            // load in a deployed process (@@D-637).
            party: {},
            sport: {},
            // The suite definition read by the `k8s` generator and the operator. The framework
            // image and version are overridden by the CR, which names the release image.
            kustomize: {
                deploy: {
                    suite: {
                        name: 'blong-sport',
                        namespace: 'blong-sport',
                        entry: '/opt/deploy/suite/realm/blong-sport/index.ts',
                        frameworkImage: 'docker.io/library/blong-gogo',
                        minFrameworkVersion: '1',
                    },
                    profile: 'monolith',
                    externalServices: {
                        db: {
                            externalName: 'mysql.blong-integration.svc.cluster.local',
                            ports: [{name: 'mysql', port: 3306}],
                        },
                    },
                    portal: {
                        web: {
                            // The address is the deployment's, not the suite's: it comes from
                            // `kustomize.deploy.portal.web` in the rc file of the `k8s` intent, host and
                            // certificate issuer together, so no domain is baked into a source tree
                            // @@D-645. What the suite does say is that it publishes a page and which
                            // Secret its certificate lands in.
                            tls: {secretName: 'sport-tls'},
                        },
                    },
                    suiteVolume: {
                        backend: 'nodeLocal',
                        artifact: {
                            source: 'url',
                            url: 'http://blong-artifact.default.svc.cluster.local/sport.zip',
                        },
                    },
                    crd: true,
                },
            },
        },
        release: {
            // How a *deployed* process finds another namespace: the Service of that name. It belongs
            // here and not in `default`, because the default applies to a test run too, and a tap or
            // playwright run is not in a cluster: the login realm's token verification tried
            // `login.default.svc.cluster.local` and the browser flow's three HTTP assertions answered
            // 401 with `rpc.jwtInvalid` (@@F-616). `release` is the trailing intent every deployed
            // process and the migration Job carry, so this is the block they read.
            resolution: {impl: 'kubernetes'},
            // Party's dbTest seeds are handler-backed, and the handler group is not loaded in a
            // release process: leaving the flag on made the migration job fall through to the
            // generic `merge`, which read an undefined `party.hierarchy` and failed with
            // `Cannot read properties of undefined (reading 'map')`. The test fixtures are for the
            // dev and integration intents; a released process does not need them.
            party: {schema: {dbTest: false}},
            gateway: {
                static: {root: '/opt/deploy/suite/realm/blong-sport/dist'},
            },
            srv: {
                db: {
                    knex: {
                        connection: {
                            host: 'db',
                            port: 3306,
                            user: 'blong-sport',
                            password: 'password',
                            database: 'blong-sport',
                        },
                    },
                },
            },
        },
        // A planning run and the migration Job each need every realm the suite can deploy.
        k8s: {sport: {}, login: {}, core: {}, access: {}, gateway: {}, party: {}},
        upgrade: {
            sport: {},
            login: {},
            core: {},
            // The local dev cluster's portal check logs in as `testAdmin`, which lives in access's
            // dbTest seed. Seeded by the migration step only, so a running process never re-seeds it,
            // and party's handler-backed test fixtures stay off for the reason the release block gives.
            access: {schema: {dbTest: true}},
            gateway: {},
            party: {schema: {dbTest: false}},
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
