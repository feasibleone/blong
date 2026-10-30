import {server} from '@feasibleone/blong';

import {simBase, TEST_PORTS} from './testPorts.ts';

/**
 * index.ts — standalone entry point for the `chat` realm.
 *
 * What a developer runs with `blong` inside this folder, and what the tap runner loads. The realm is
 * the only child: it needs no `srv`, no login and no database, because the listeners and the port
 * configs are the whole surface, and the gateway answers the public `chat.*` methods locally
 * (`@@D-682`).
 *
 * The gateway is named here rather than left to a default because a component loads only when its
 * config block exists: `gateway: {}` would start one on the framework's default port, and the
 * explicit `8080` is what the README tells a caller to address.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        async function chat() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {
            // A child loads only when its block is present.
            chat: {},
            gateway: {port: 8080},
            // The suite definition the `k8s` generator and the operator read. A chat deployment
            // publishes no page — its addresses are the webhook paths the adapters declare — so there
            // is no portal here, and the host those paths answer on is the tenant's: a DNS record and a
            // certificate belong to a deployment, not to a source tree, so the rc file of the `k8s`
            // intent names it as `chat.slack.k8sIngresses.chatSlack.host` (and the Viber entry beside
            // it).
            kustomize: {
                deploy: {
                    suite: {
                        name: 'blong-chat',
                        namespace: 'blong-chat',
                        entry: '/opt/deploy/suite/realm/blong-chat/index.ts',
                    },
                    profile: 'monolith',
                },
            },
        },
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
                },
                slack: {
                    // The one address a real app posts to and a tunnel forwards: the same port the
                    // simulator's accounts post *back* to is decided per account, not here (`@@D-687`).
                    server: {port: TEST_PORTS.slack},
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
            watch: {test: ['test.chat.inbound', 'test.chat.outbound']},
        },
    },
}));
