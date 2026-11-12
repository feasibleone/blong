import {server} from '@feasibleone/blong';

import {simBase, TEST_PORTS} from './testPorts.ts';

/**
 * index.ts — the `chat` realm as a deployable suite, and the entry a developer and the tap runner use.
 *
 * The realm itself is a bridge (`server.ts`), so this entry adds only what a served deployment needs:
 * the framework realms the portal and its login run on, the database that keeps the accounts
 * (`@@D-797`), and the suite definition the `k8s` generator and the operator read.
 *
 * Two addresses, not one (`@@D-796`): the portal answers on the deployment's own host — sent by the rc
 * file of the `k8s` intent and by the CR, as every address is — while the Slack and Viber paths answer
 * on the webhook host the config names. The tree refuses a webhook on a portal's host, because ingress
 * annotations belong to the host and the webhook would inherit the portal's authentication.
 *
 * The gateway is named here rather than left to a default because a component loads only when its
 * config block exists: `gateway: {}` would start one on the framework's default port.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        /** The public JSON-RPC surface the portal and a caller address. */
        async function gateway() {
            return import('@feasibleone/blong-gateway/server.ts');
        },
        async function chat() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {
            // The account page is an administrator's, so the caller is authorized on every route.
            gateway: {authorize: 'access.authorization.list', port: 8080},
            // A child loads only when its block is present.
            chat: {
                slack: {
                    // The public base a manifest points at, when no account names one. Left unset on
                    // purpose: a host is a DNS record and a certificate somebody owns, and an account
                    // row carries the base its own app points at (`@@D-796`). Set it here only for a
                    // deployment that wants a fallback for accounts that name nothing.
                    // publicUrl: '<the webhook base>',
                    // Where the account map and a renewed credential pair come from and go. The port
                    // dispatches both, so an account added in the portal is served on the next pass
                    // (`@@D-797`).
                    accountsMethod: 'chat.credential.list',
                    accountsSaveMethod: 'chat.credential.provision',
                    k8sIngresses: {
                        chatSlack: {
                            // The host is the deployment's, not the tree's: `kustomize.deploy.ingresses`
                            // in the rc file of a local run, `spec.ingresses` in the CR for a release,
                            // keyed by this alias (`@@D-800`). The example CR beside the generated base
                            // writes `PLACEHOLDER` where it goes.
                            tls: {secretName: 'chat-hook-tls'},
                            // The host's annotations, so the Viber path beside this one inherits
                            // them (`@@D-799`). An Ingress with a TLS secret nothing issues answers
                            // no handshake, and Slack cannot reach a request URL it cannot open.
                            annotations: {'cert-manager.io/cluster-issuer': 'letsencrypt-prod'},
                        },
                    },
                },
                viber: {
                    k8sIngresses: {
                        chatViber: {
                            // Addressed the same way, by the same declaration (`@@D-800`).
                            tls: {secretName: 'chat-hook-tls'},
                        },
                    },
                },
            },
            // The suite definition the `k8s` generator and the operator read. A setting that appears
            // only under `k8s` makes an operator pass report objects it does not manage as drift.
            kustomize: {
                deploy: {
                    suite: {
                        name: 'blong-chat',
                        namespace: 'blong-chat',
                        entry: '/opt/deploy/suite/realm/blong-chat/index.ts',
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
                    // The host is the deployment's, not the suite's: it comes from
                    // `kustomize.deploy.portal.web` in the rc file of the `k8s` intent and from the
                    // CR, so the source names only the Secret its certificate lands in.
                    portal: {
                        web: {
                            tls: {secretName: 'chat-tls'},
                        },
                    },
                    suiteVolume: {
                        backend: 'nodeLocal',
                        artifact: {
                            source: 'url',
                            url: 'http://blong-artifact.default.svc.cluster.local/chat.zip',
                        },
                    },
                    crd: true,
                },
            },
        },
        release: {
            // How a deployed process finds another realm's process: the Service of that name.
            resolution: {impl: 'kubernetes'},
            gateway: {
                static: {root: '/opt/deploy/suite/realm/blong-chat/dist'},
            },
            srv: {
                db: {
                    knex: {
                        connection: {
                            host: 'db',
                            port: 3306,
                            user: 'blong-chat',
                            password: 'password',
                            database: 'blong-chat',
                        },
                    },
                },
            },
        },
        // A planning run and the migration Job each need every realm the suite can deploy.
        k8s: {chat: {}, login: {}, core: {}, access: {}, gateway: {}},
        upgrade: {chat: {}, login: {}, core: {}, access: {}, gateway: {}},
        integration: {
            // Tests run beside whatever a developer has started, so every listener the platform owns
            // asks for a port the kernel chooses rather than for the one dev uses.
            rpcServer: {port: 0},
            gateway: {port: 0},
            chat: {
                // The setting a handler reads belongs to the port that serves the namespace: a group
                // closure is handed its own folder's slice (`chat.in`, `chat.out`), while `this.config`
                // inside a handler is the config of the port the method was dispatched on. So the realm
                // keeps it here, under the orchestrator's own name (`@@F-641`).
                chatDispatch: {
                    // A test consumer is an ordinary consumer: the realm forwards each account to the
                    // method its config names, and an account nobody maps falls back to the port's `*`
                    // entry, which drops and logs the message.
                    forward: {demo: 'test.chat.received'},
                    // The conversation memory is on, because the group that covers it is the only
                    // place the database half of this realm runs (`@@T-525`). A test process has the
                    // shared adapter either way; `none` is the default a listener-only deployment
                    // keeps.
                    channelStore: 'db',
                },
                slack: {
                    // The one address a real app posts to and a tunnel forwards: the same port the
                    // simulator's accounts post *back* to is decided per account, not here (`@@D-687`).
                    server: {port: TEST_PORTS.slack},
                    // A test run serves the accounts the configuration names: no store is in play and
                    // the maintenance pass has nothing to renew. An empty method is how a block that
                    // merges *after* `default` turns the store off — an absent key would leave the
                    // default's answer in place.
                    accountsMethod: '',
                    accountsSaveMethod: '',
                    maintainIntervalMs: 0,
                    accounts: {
                        demo: {
                            appId: 'A1',
                            clientId: 'T1',
                            botToken: 'xoxb-test',
                            signingSecret: 'slack-signing-secret',
                            // The account, not the port, decides where its calls go: this one posts to
                            // the simulator while the port's own `url` stays Slack's.
                            url: simBase('slack'),
                        },
                        // A second account no `forward` entry names, so what it delivers is dropped
                        // and logged — which is what a deployment with no consumer does.
                        other: {
                            appId: 'A2',
                            clientId: 'T2',
                            botToken: 'xoxb-test-other',
                            signingSecret: 'slack-signing-secret',
                            url: simBase('slack'),
                        },
                    },
                },
                viber: {
                    server: {port: TEST_PORTS.viber},
                    accounts: {
                        demo: {
                            appId: 'pa1',
                            clientId: 'C1',
                            authToken: 'viber-token',
                            url: simBase('viber'),
                        },
                    },
                },
                // The two simulators as ports of this realm, on the ports this run uses.
                slackSim: {server: {port: TEST_PORTS.slackSim}},
                viberSim: {server: {port: TEST_PORTS.viberSim}},
            },
            // The simulators the platform APIs are, loaded only where tests run. The empty blocks
            // gate loading; the ports themselves are configured inside the realm's own block, which
            // is the slice a realm-layer port reads (`@@F-641`).
            slackSim: {},
            viberSim: {},
            // Every group the realm runs has to be listed here, or the watch runner never executes it
            // and the coverage report says "incomplete" for no visible reason.
            watch: {
                test: [
                    'test.chat.inbound',
                    'test.chat.outbound',
                    'test.chat.models',
                    'test.chat.store',
                    'test.chat.channel',
                ],
            },
        },
    },
}));
