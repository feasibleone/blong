import {server} from '@feasibleone/blong';

/**
 * index.ts — the `viewer` realm as a deployable suite, and the entry a developer
 * and the tap runner use.
 *
 * Two children beyond the realm: the gateway, because the page's reads are
 * authorized routes like any other page's, and the server-hosted test runner
 * (test intents only). The framework realms it reuses — `srv`, login, core and
 * access — are loaded by the loader before any suite child; the `dev` block
 * still names them, because a config block is where a realm is configured and
 * not a child declaration.
 *
 * `log.destination` points at this process's own listener so a local run and the
 * tap suite exercise the real path: a record is written over UDP by the
 * framework, reassembled by the adapter, and read back through the gateway. The
 * port is written here rather than left to `.blong_devrc`, because a test that
 * depended on a developer's rc file would pass on one machine and fail on
 * another.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        async function viewer() {
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
            // Where this process writes what it emits: its own listener, which
            // is what makes the page show the records the process is writing.
            log: {destination: {host: '127.0.0.1', port: 9999}},
            viewer: {log: {udpPort: 9999, host: '127.0.0.1'}},
            // The suite definition the `k8s` generator and the operator read.
            kustomize: {
                deploy: {
                    suite: {
                        name: 'blong-viewer',
                        namespace: 'blong-viewer',
                        entry: '/opt/deploy/suite/realm/blong-viewer/index.ts',
                        frameworkImage: 'docker.io/library/blong-gogo',
                        minFrameworkVersion: '1',
                    },
                    profile: 'monolith',
                    portal: {web: {}},
                    suiteVolume: {backend: 'nodeLocal'},
                    crd: true,
                },
            },
        },
        // A planning run and the migration Job each need every realm the suite
        // can deploy. The upgrade intent is what applies the capability seed.
        k8s: {viewer: {}, gateway: {}, login: {}, core: {}, access: {}},
        upgrade: {viewer: {}, gateway: {}, login: {}, core: {}, access: {}},
        dev: {
            srv: {},
            core: {},
            access: {},
            viewer: {},
            login: {},
            testRealm: {
                // Only this realm's server group may be started from the Test
                // runs console; the runner refuses every other method.
                testRun: {serverGroups: ['test.viewer.flow']},
            },
        },
        integration: {
            // Tests run beside whatever a developer has started, so every
            // listener the platform owns asks for a port the kernel chooses.
            rpcServer: {port: 0},
            gateway: {port: 0},
            watch: {test: ['test.viewer.flow']},
            testRealm: {
                testRun: {serverGroups: ['test.viewer.flow']},
            },
        },
        // Playwright drives the UI; the server does not need to run every test
        // group on boot, and those runs share the buffer with the console.
        playwright: {
            watch: {test: []},
        },
        'test-ui': {
            testRealm: {
                testRun: {serverGroups: ['test.viewer.flow']},
            },
        },
    },
}));
