import {server} from '@feasibleone/blong';
import {simBase, TEST_PORTS} from '@feasibleone/blong-chat/testPorts.ts';

/**
 * index.ts — standalone server bootstrap for the `agent` realm.
 *
 * The realm is the only child that serves an API; the framework realms it reuses — blong-server
 * (`srv`) for the database, login for the token, core and access for the resource graph and RBAC —
 * are configured in the `dev` block, and `testRealm` is the server-hosted test runner the test
 * intents drive.
 *
 * Under `integration` every listener asks the kernel for a port and no worker tick is started until
 * a test calls one, so a run never collides with a developer's own process and never claims a ticket
 * behind their back (`@@D-704`).
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        /** `agent` realm */
        async function agent() {
            return import('./server.ts');
        },
        /**
         * The public JSON-RPC surface the portal and a caller address.
         *
         * It is a child rather than left to `srv` because a component loads only when its config
         * block exists, and this is the gateway that authorizes every route: the account page is an
         * administrator's, so the caller is checked against the access realm before a handler runs.
         */
        async function gateway() {
            return import('@feasibleone/blong-gateway/server.ts');
        },
        /**
         * The records this deployment's own processes wrote: the `viewer` realm's UDP receiver and
         * the gateway routes the page reads through (`@@D-946`). A deployable realm, so a profile
         * that splits gives it a process of its own and a Service named after it; in this suite's
         * `monolith` profile it rides the one process, and its Service is what the log destination
         * names all the same (`@@D-950`).
         */
        async function viewer() {
            return import('@feasibleone/blong-viewer/server.ts');
        },
        // The server-hosted test runner, so the integration intent can drive the realm's groups.
        async function testRealm() {
            return import('@feasibleone/blong-test/server.ts');
        },
        // The realm that answers a question. It loads only where its config block exists, which is the
        // `chat` intent alone: every other run answers through a test method. Its Slack simulator is a
        // layer of that realm, not a child here — `slackSim: {}` gates it.
        async function chat() {
            return import('@feasibleone/blong-chat/server.ts');
        },
    ],
    config: {
        default: {
            agent: {
                agentDispatch: {
                    // The personas this deployment offers, in the one block every intent merges. An
                    // intent decides where a message comes from and which account answers it; the cast
                    // of characters is not a property of a platform (`@@D-726`).
                    personaPresets: {
                        chat: {
                            title: 'General assistant',
                            description: 'Talks things through. No tools, no workspace.',
                            workspaceMode: 'none',
                            tools: [],
                            instructions: 'You are a concise assistant in a chat channel.',
                            sortOrder: 0,
                        },
                        reviewer: {
                            title: 'Code reviewer',
                            description: 'Reads a change and says what is wrong with it.',
                            workspaceMode: 'none',
                            tools: [],
                            instructions: 'You review code and say what to change.',
                            sortOrder: 10,
                        },
                    },
                },
            },
            // The suite definition the `k8s` generator and the operator read. The profile is a monolith
            // because the worker and the methods it calls have to answer on one namespace and share one
            // workspace volume — a split tree would give the ticket's files to a pod that never sees the
            // session that owns them (`@@D-704`).
            kustomize: {
                deploy: {
                    suite: {
                        name: 'blong-agent',
                        namespace: 'blong-agent',
                        entry: '/opt/deploy/suite/realm/blong-agent/index.ts',
                        frameworkImage: 'docker.io/library/blong-gogo',
                        minFrameworkVersion: '1',
                    },
                    profile: 'monolith',
                    // The database is the chat deployment's, restored under this deployment's name
                    // before the first converge: its rows are the Slack accounts nobody wants to set
                    // up again, and the migration Job adds the `agent` schema beside them rather than
                    // replacing them (`@@D-857`).
                    externalServices: {
                        db: {
                            externalName: 'mysql.blong-integration.svc.cluster.local',
                            ports: [{name: 'mysql', port: 3306}],
                        },
                    },
                    // The host is the deployment's, not the suite's: it comes from
                    // `kustomize.deploy.portal.web` in the rc file of the `k8s` intent and from the
                    // CR, so the source names only the Secret its certificate lands in. The Secret
                    // name stays the chat one for the same reason the host does: a DNS record and a
                    // Slack app's request URL are what a tenant already has (`@@D-796`).
                    portal: {
                        web: {
                            tls: {secretName: 'chat-tls'},
                            annotations: {
                                'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
                            },
                        },
                    },
                    suiteVolume: {
                        backend: 'nodeLocal',
                        artifact: {
                            source: 'url',
                            url: 'http://blong-artifact.default.svc.cluster.local/agent.zip',
                        },
                    },
                    crd: true,
                },
            },
        },
        // The deployment: how a served process reaches another realm, where its records go, and which
        // database it owns.
        release: {
            // How a deployed process finds another realm's process: the Service of that name.
            resolution: {impl: 'kubernetes'},
            // Every process of this deployment sends its records to the `viewer` realm, at the name its
            // port is published under (`@@D-950`).
            log: {destination: {host: 'viewer', port: 9999}},
            // The gateway a deployment serves through: the account page is an administrator's, so
            // the caller is checked against the access realm before a handler runs. It lives here
            // rather than in `default` because a test run must serve without RBAC, and a child
            // loads only where its block exists.
            gateway: {
                authorize: 'access.authorization.list',
                port: 8080,
                static: {root: '/opt/deploy/suite/realm/blong-agent/dist'},
            },
            srv: {
                db: {
                    knex: {
                        connection: {
                            host: 'db',
                            port: 3306,
                            // The pair comes from the tenant's own file, not from a source tree
                            // (`@@D-857`): Secret `blong-releaserc-etc`, mounted at
                            // `/etc/blong_releaserc` and merged by `rc`.
                            database: 'blong-agent',
                        },
                    },
                },
            },
            // The account store the deployment keeps: the portal adds an account, the next maintenance
            // pass serves it. It lives here rather than in `default` because a test or simulator run
            // must answer from its configuration and never from a database (`@@D-797`, `@@F-641`).
            chat: {
                chatDispatch: {
                    // A channel remembers which persona it talks to, which is what makes a
                    // conversation outlive one message (`@@D-727`).
                    channelStore: 'db',
                    // And a message that arrives is a turn for this realm: keyed by `*` because the
                    // realm asks for the account that received it, so a `slack` key would never
                    // match and every message would take the fallback and be dropped.
                    forward: {'*': 'agent.chat.receive'},
                },
                slack: {
                    accountsMethod: 'chat.credential.list',
                    accountsSaveMethod: 'chat.credential.provision',
                },
            },
        },
        // A planning run and the migration Job each need every realm the suite can deploy. The webhook
        // hosts are declared here rather than in `default` because only a tree reads them: a test or
        // simulator run must not load the chat realm for an Ingress it will never write (`@@D-800`).
        k8s: {
            agent: {},
            chat: {
                slack: {
                    k8sIngresses: {
                        chatSlack: {
                            tls: {secretName: 'chat-hook-tls'},
                            // The host's annotations, so the Viber path beside this one inherits them
                            // (`@@D-799`). An Ingress with a TLS secret nothing issues answers no
                            // handshake, and Slack cannot reach a request URL it cannot open.
                            annotations: {'cert-manager.io/cluster-issuer': 'letsencrypt-prod'},
                        },
                    },
                },
                viber: {
                    k8sIngresses: {
                        chatViber: {
                            tls: {secretName: 'chat-hook-tls'},
                        },
                    },
                },
            },
            login: {},
            core: {},
            access: {},
            gateway: {},
            viewer: {},
        },
        upgrade: {agent: {}, chat: {}, login: {}, core: {}, access: {}, gateway: {}, viewer: {}},
        dev: {
            srv: {},
            core: {},
            access: {},
            login: {},
            agent: {},
        },
        // Carried beside `integration` when a real model is being exercised: a 14B model on a 32k
        // context wanders if the loop is left open, so the run caps the steps and the calls it may make
        // and gives a question longer than five seconds to be answered (`@@T-591`).
        ollama: {
            agent: {
                agentDispatch: {
                    maxSteps: 8,
                    maxToolCalls: 4,
                },
            },
            // The real-model group is listed here and nowhere else: it is a development aid that talks
            // to a model on the LAN, so a plain integration run — which is what CI makes — never
            // schedules it at all, rather than scheduling it and skipping every step.
            watch: {
                test: [
                    'test.agent.ticket',
                    'test.agent.session',
                    'test.agent.workspace',
                    'test.agent.recovery',
                    'test.agent.model',
                ],
            },
        },
        // The cross-realm seam, which needs the realm that asks and a platform that answers: run
        // `blong ./index.ts integration chat`. Only the seam group is scheduled, because
        // `questionMethod` is one setting for the whole process and every other group answers its
        // questions through `test.agent.question.echo` (`@@T-574`).
        chat: {
            rpcServer: {port: 0},
            gateway: {port: 0},
            srv: {},
            core: {},
            access: {},
            login: {},
            agent: {
                agentDispatch: {
                    questionMethod: 'chat.prompt.ask',
                    questionTimeoutMs: 15_000,
                    // The account the personas inherit. The simulator's is `chat`; a deployment points
                    // this at its own account in its rc file, because a persona names an account and a
                    // machine is what has one (`@@D-724`).
                    engineAccount: 'chat',
                },
            },
            chat: {
                // The intent that makes a channel remember which persona it talks to (`@@D-727`).
                //
                // `forward` is keyed by the account alias, not by the platform: the realm asks it for
                // the account that received the message, so a `slack` key would never match and every
                // message would take the `*` entry — which is how a real workspace ends up talking to
                // this realm and getting silence.
                chatDispatch: {
                    channelStore: 'db',
                    forward: {'*': 'agent.chat.receive'},
                },
                slack: {
                    server: {port: TEST_PORTS.slack},
                    accounts: {
                        demo: {
                            appId: 'A1',
                            clientId: 'T1',
                            botToken: 'xoxb-test',
                            signingSecret: 'slack-signing-secret',
                            url: simBase('slack'),
                        },
                    },
                },
                slackSim: {server: {port: TEST_PORTS.slackSim}},
            },
            // The empty block is what loads the simulator child.
            slackSim: {},
            testRealm: {},
            watch: {test: ['test.agent.chat', 'test.agent.persona']},
        },
        // The real thing: a platform's own workspace, no simulator and no scripted account. It exists so
        // a machine's account can live in `.blong_slackrc` — the rc file is named after the last intent,
        // and a suffix of its own is what keeps a laptop's bot token out of every `integration chat` run
        // (`@@F-667`). Run `blong ./index.ts dev slack`, or `b slack`.
        slack: {
            rpcServer: {port: 0},
            gateway: {port: 0},
            // Every namespace this deployment serves is in this one process, so a dispatch to itself
            // must not leave it: without in-process resolution the webhook's hop to `chat.in.receive`
            // goes out over a socket to a name only a cluster has, hangs, and — because the platform is
            // answered before the realm runs — drops the message with nothing to show for it (`@@F-669`).
            remote: {canSkipSocket: true},
            srv: {},
            core: {},
            access: {},
            login: {},
            agent: {
                agentDispatch: {
                    // A conversation is answered by the consumer the chat realm forwards to, and a
                    // person reading a channel gets longer than a test's fifteen seconds to answer the
                    // persona question.
                    questionMethod: 'chat.prompt.ask',
                    questionTimeoutMs: 120_000,
                    continuationMinutes: 1440,
                    // A chat deployment claims no tickets: the pool's tickets name accounts it does not
                    // have, and a tick that asks about one takes the process down with it (`@@F-670`).
                    // The recovery scan is off for the same reason — its sessions are a test's.
                    workerStart: false,
                },
            },
            chat: {
                chatDispatch: {
                    channelStore: 'db',
                    forward: {'*': 'agent.chat.receive'},
                },
                // The account itself is the machine's: `chat.slack.accounts` is merged from the rc,
                // because a bot token and a signing secret are not a source tree's to hold.
                slack: {server: {port: 8095}},
            },
        },
        // The wake-up channel, when a broker is configured: run `blong ./index.ts integration notify`.
        // Only the notify group is scheduled, because a wake changes *when* a resume happens rather
        // than what it does, and the connection is the point of the run (`@@T-560`).
        notify: {
            rpcServer: {port: 0},
            gateway: {port: 0},
            srv: {},
            core: {},
            access: {},
            login: {},
            agent: {},
            testRealm: {},
            watch: {test: ['test.agent.notify']},
        },
        integration: {
            rpcServer: {port: 0},
            gateway: {port: 0},
            srv: {},
            core: {},
            access: {},
            login: {},
            agent: {
                // A test answers the human question through its own method: the chat realm is not a
                // child of this one, and a question with nowhere to go would park for thirty minutes.
                agentDispatch: {
                    questionMethod: 'test.agent.question.echo',
                    questionTimeoutMs: 5_000,
                },
            },
            testRealm: {},
            // Every group the realm runs is listed here, or the watch runner never executes it.
            watch: {
                test: [
                    'test.agent.ticket',
                    'test.agent.session',
                    'test.agent.workspace',
                    'test.agent.recovery',
                    'test.agent.native',
                    // A runtime account answers one turn where one is reachable, and says nothing
                    // where it is not (`@@T-777`).
                    'test.agent.copilot',
                    // The list and the tail a session page reads (`@@T-792` `@@T-793`).
                    'test.agent.feed',
                ],
            },
        },
        // The browser run: `blong-dev playwright` starts this suite beside the Vite dev server and
        // drives the session page (`@@T-801`). Telemetry comes from the ring rather than a topic,
        // because a Playwright machine has no broker and the page must not be the thing that
        // notices (`@@D-988`, `@@D-1008`). The group below is the only one a browser may start, and
        // it exists to give the page a conversation to draw.
        playwright: {
            rpcServer: {port: 0},
            gateway: {port: 0},
            srv: {},
            core: {},
            access: {},
            login: {},
            agent: {
                agentDispatch: {
                    questionMethod: 'test.agent.question.echo',
                    questionTimeoutMs: 5_000,
                    telemetry: {source: 'memory'},
                },
            },
            testRealm: {testRun: {serverGroups: ['test.agent.ui']}},
            // The conversation the page is opened on. It is written at boot, through the same two
            // handlers an engine uses, so the spec needs no seeding surface of its own: it opens the
            // page and reads what this run published (`@@T-801`).
            watch: {test: ['test.agent.ui']},
        },
    },
}));
