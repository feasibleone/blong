import type {IChatAccountMap, IChatPromptSettleParams} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/**
 * `viber.prompt.settle` — the question's own message, rewritten once it is answered.
 *
 * Viber edits by `message_token`, the id `send_message` answered with, and the keyboard is what has to
 * go: a message whose buttons no longer answer anything is the same trap the Slack side removes
 * (`@@D-692`). The answer is written as text because a Viber message has no blocks — a ticked option
 * cannot be marked in place, so the answer is named instead.
 */
export default handler(({lib: {error, viberTokenGet, viberBaseGet}}) => {
    const errors = error({
        'viber.accountMissing': {
            message: 'No Viber account {account} is configured',
            statusCode: 404,
        },
        'viber.messageUnknown': {
            message:
                'The Viber message for prompt {promptId} was never reported, so it cannot be edited',
            statusCode: 409,
        },
    });

    return function viberPromptSettleRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: IChatPromptSettleParams,
    ) {
        const token = viberTokenGet(this.config?.accounts, params.account);
        if (!token) throw errors['viber.accountMissing']({params: {account: params.account ?? ''}});
        if (!params.messageId)
            throw errors['viber.messageUnknown']({params: {promptId: params.prompt.promptId}});
        return {
            url: new URL(
                'edit_message',
                viberBaseGet(this.config?.accounts, params.account, this.config?.url),
            ),
            path: 'edit_message',
            method: 'POST',
            responseType: 'json',
            headers: {
                'x-viber-auth-token': token,
                'content-type': 'application/json; charset=utf-8',
            },
            json: {
                receiver: params.conversationId,
                message_token: Number(params.messageId),
                type: 'text',
                // Viber has no mentions, so the name is written out; without one the answer is
                // named instead, the same way the Slack line falls back (`@@D-693`).
                // Viber has no mentions, so the name is written out; without one the answer speaks for
                // itself, the same way the Slack line falls back (`@@D-693`).
                text: `${params.prompt.text} — ${
                    params.answer.sender?.name ?? params.answer.sender?.id ?? 'Answer'
                } answered: ${params.answerText}`,
            },
        };
    };
});
