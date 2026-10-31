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
            agent: {},
            gateway: {port: 8080},
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
                    },
                    profile: 'monolith',
                },
            },
        },
        dev: {
            srv: {},
            core: {},
            access: {},
            login: {},
            agent: {},
        },
        // The upgrade intent reads this block to know which realms a migration process carries.
        upgrade: {
            agent: {},
            login: {},
            core: {},
            access: {},
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
                    questionTimeoutMs: 60_000,
                },
            },
            chat: {
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
            watch: {test: ['test.agent.chat']},
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
                ],
            },
        },
    },
}));
