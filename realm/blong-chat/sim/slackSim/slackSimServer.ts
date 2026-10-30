import {handler} from '@feasibleone/blong';

import {simMessageCount, simRecord} from '../../simRecord.ts';

/**
 * `slackSim.server` — what the Web API answers.
 *
 * Four calls exist in this realm, and each is answered with the smallest body its caller accepts:
 * `chat.postMessage` with a `ts` (which the ask keeps, because the answer is written back over the
 * question), `chat.update` with the same `ts` and channel, `views.open` with `ok`, and `auth.test` with
 * a user. Everything is recorded first, so an assertion reads what arrived
 * even when the answer hides it — and a method this simulator does not implement answers `ok: false`
 * rather than a plausible success, so a call nobody expected cannot pass by looking like one.
 */
interface ISimContext {
    request: {path: string; body?: unknown};
}

export default handler(() => ({
    async slackSimServer(context: ISimContext): Promise<{code: number; body: unknown}> {
        const {path, body} = context.request;
        simRecord({platform: 'slack', path, body});
        if (path.endsWith('chat.postMessage')) {
            const channel = (body as {channel?: string} | undefined)?.channel;
            // `C-once` takes the question and refuses what comes after it — the conversation the bot
            // was removed from while a question was still waiting for an answer — and `C-never`
            // refuses everything, which is a question the platform would not deliver at all.
            if (channel === 'C-never')
                return {code: 200, body: {ok: false, error: 'channel_not_found'}};
            if (channel === 'C-once' && simMessageCount(channel) > 1)
                return {code: 200, body: {ok: false, error: 'channel_not_found'}};
            return {code: 200, body: {ok: true, ts: '1700000000.000100', channel}};
        }
        if (path.endsWith('chat.update')) {
            const {channel, ts} = body as {channel?: string; ts?: string};
            // The question is settled in its own message, which `C-once` no longer accepts either.
            if (channel === 'C-once')
                return {code: 200, body: {ok: false, error: 'channel_not_found'}};
            return {code: 200, body: {ok: true, ts, channel}};
        }
        if (path.endsWith('views.open')) return {code: 200, body: {ok: true}};
        if (path.endsWith('auth.test')) return {code: 200, body: {ok: true, user_id: 'U1'}};
        return {code: 200, body: {ok: false, error: 'unknown_method'}};
    },
}));
