import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `notify.answer.wake` — the wake a broker delivers, forwarded to the realm that can act on it.
 *
 * The framework's subscriber dispatches on the adapter it subscribed with, which is why this method
 * exists at all: a broker hands a message to the port that listens, and the port hands it to the realm.
 * The wake is a nudge (`@@D-709`), so a session this host does not hold answers nothing.
 */
export default handler(({handler: {agentAnswerWake}}) => ({
    async notifyAnswerWake(
        params: {sessionId?: string; promptId?: string},
        $meta: IMeta,
    ): Promise<{resumed: boolean}> {
        return (await agentAnswerWake(params, $meta)) as {resumed: boolean};
    },
}));
