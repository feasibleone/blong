import {adapter} from '@feasibleone/blong';

/**
 * sim/slackSim.ts — Slack's Web API, as far as this realm uses it.
 *
 * A receiving port on the same bidirectional adapter the Slack port itself uses, so the test exercises
 * the descriptor the real call would send rather than a stub beside it (`@@D-681`). The wildcard path
 * is the whole API surface: the platform port resolves `chat.postMessage` against this base, and the
 * server hook answers by the path it just received.
 */
export default adapter(() => ({
    extends: 'adapter.webhook',
    activation: {
        default: {
            listen: true,
            namespace: 'slackSim',
            hook: 'slackSim',
            path: '/api/*',
            // A reply is the API's answer, so the run waits for the chain and the test sees what the
            // port sent.
            mode: 'reply',
            server: {port: 18085},
            response: {code: 200, body: {ok: true}},
            imports: [/slackSim$/],
        },
    },
}));
