import {handler} from '@feasibleone/blong';

import {simRecord} from '../../simRecord.ts';

/**
 * `viberSim.server` — what the Viber API answers.
 *
 * Viber reports a refusal in the body (`status` other than zero), so a success is the body it expects
 * and nothing else. What arrived is recorded first, for the assertions.
 */
interface ISimContext {
    request: {path: string; body?: unknown};
}

export default handler(() => ({
    async viberSimServer(context: ISimContext): Promise<{code: number; body: unknown}> {
        simRecord({platform: 'viber', path: context.request.path, body: context.request.body});
        return {
            code: 200,
            body: {status: 0, status_message: 'ok', message_token: 1700000000000},
        };
    },
}));
