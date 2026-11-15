import {server} from '@feasibleone/blong';
import {join} from 'node:path';

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
        /**
         * The store a document's file lives in (`@@D-845`).
         *
         * A companion: no process of its own, no Service — it stores for whichever process carries it,
         * and the namespace it writes to is `sport`'s, named in the config below.
         */
        async function blob() {
            return import('@feasibleone/blong-blob/server.ts');
        },
        /** `sport` management realm */
        async function sport() {
            return import('./server.ts');
        },
        /**
         * Feedback capture: submissions from the UI and the admin review API.
         *
         * A realm of its own rather than a table in `core` — feedback is business
         * data written by many processes and read centrally, which a library realm
         * would copy per database (`@@D-656`).
         */
        async function feedback() {
            return import('@feasibleone/blong-feedback/server.ts');
        },
        /** Server-hosted test runner (test intents only) */
        async function testRealm() {
            return import('@feasibleone/blong-test/server.ts');
        },
    ],
    config: {
        default: {
            // Enforce RBAC on the gateway — resolves allowed actions for the
            // authenticated user (access realm), 403 when not authorized. The stream body the upload
            // route needs is that route's own declaration, not this block's (`@@D-860`).
            gateway: {authorize: 'access.authorization.list'},
            // Explicit children need a config block to load. `testRealm` deliberately has none
            // here: the loader skips a child whose block is absent, so the test runner does not
            // load in a deployed process (@@D-637).
            party: {},
            sport: {},
            feedback: {},
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
            // A released process carries the store: without the child there is no directory to mount
            // and every upload answers that no namespace is configured (`@@D-854`).
            blob: {
                storage: {directory: '/var/lib/blong/blob', namespaces: {sport: {}}},
            },
            gateway: {
                static: {root: '/opt/deploy/suite/realm/blong-sport/dist'},
            },
            srv: {
                db: {
                    knex: {
                        connection: {
                            host: 'db',
                            port: 3306,
                            // No credential in a source tree (`@@D-857`): not the password and not the
                            // user, because the pair is one thing and a tree that names half of it is a
                            // tree that has a credential in it. A credential somebody sets by hand
                            // belongs in the tenant's own file — Secret `blong-releaserc-etc`, mounted at
                            // `/etc/blong_releaserc` and read by `rc` — not in `blong-secrets`, which the
                            // operator owns and fills with what it generates (`@@D-855`).
                            database: 'blong-sport',
                        },
                    },
                },
            },
        },
        // A planning run and the migration Job each need every realm the suite can deploy.
        // A child with no block does not load, and a deployment that does not load the store has no
        // claim to mount: the generated tree reads its volumes from the ports that are loaded (`@@D-854`).
        k8s: {
            sport: {},
            login: {},
            core: {},
            access: {},
            gateway: {},
            party: {},
            blob: {},
        },
        upgrade: {
            sport: {},
            login: {},
            core: {},
            access: {},
            gateway: {},
            party: {},
            feedback: {},
            // The store loads under `upgrade` too: its port is what a deployment mounts, and the
            // migration job reads the same tree as the process it migrates for (`@@D-854`).
            blob: {},
        },
        dev: {
            srv: {},
            core: {},
            access: {},
            gateway: {},
            party: {},
            // The documents this realm stores. `dev/blob` is gitignored, so a run leaves its files
            // where a person can look at them without committing anything (`@@D-845`). The key and the
            // cookie secret come from the realm's own `dev` block.
            blob: {
                storage: {directory: join('dev', 'blob'), namespaces: {sport: {}}},
            },
            sport: {},
            feedback: {},
            login: {},
            testRealm: {
                // Only this realm's server group may be started from the Test
                // runs console; the runner refuses every other method.
                testRun: {serverGroups: ['test.athlete', 'test.nomenclature', 'test.scope']},
            },
        },
        integration: {
            watch: {
                test: ['test.athlete', 'test.nomenclature', 'test.scope'],
            },
            gateway: {},
            party: {},
            blob: {
                storage: {directory: join('dev', 'blob'), namespaces: {sport: {}}},
            },
            sport: {},
            feedback: {},
            testRealm: {
                testRun: {serverGroups: ['test.athlete', 'test.nomenclature', 'test.scope']},
            },
        },
        // Playwright drives the UI; the server does not need to run every test
        // group on boot, and those runs share the database with the console.
        playwright: {
            watch: {test: []},
        },
        'test-ui': {
            testRealm: {
                testRun: {serverGroups: ['test.athlete', 'test.nomenclature', 'test.scope']},
            },
        },
    },
}));
