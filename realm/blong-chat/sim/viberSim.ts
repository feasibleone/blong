import {adapter} from '@feasibleone/blong';

/**
 * sim/viberSim.ts — Viber's `send_message`, as far as this realm uses it.
 *
 * The same receiver the port itself runs, on its own path and port, answering `{status: 0}` the way
 * the API does (`@@D-681`).
 */
export default adapter(() => ({
    extends: 'adapter.webhook',
    activation: {
        default: {
            listen: true,
            namespace: 'viberSim',
            hook: 'viberSim',
            path: '/pa/*',
            mode: 'reply',
            server: {port: 18086},
            response: {code: 200, body: {status: 0}},
            imports: [/viberSim$/],
        },
    },
}));
