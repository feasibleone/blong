import type {IChatAccountMap, IChatPromptSettleParams} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/**
 * `slack.prompt.settle` — the question's own message, rewritten once it is answered.
 *
 * `chat.update` addresses a message by `channel` and `ts`, which is why the ask keeps the `ts` its
 * send reply named. The blocks come from `slackPromptAnsweredBlocks`: the options stay, the chosen
 * ones are marked, and every interactive element is gone — the message records the answer instead of
 * offering controls that no longer do anything (`@@D-692`).
 *
 * A settle with no id cannot name its message, and inventing one would edit whatever happened to be
 * at the end of the conversation, so it is refused where the mistake is made.
 */
export default handler(({lib: {error, slackTokenGet, slackBaseGet, slackPromptAnsweredBlocks}}) => {
    const errors = error({
        'slack.accountMissing': {
            message: 'No Slack account {account} is configured',
            statusCode: 404,
        },
        'slack.messageUnknown': {
            message:
                'The Slack message for prompt {promptId} was never reported, so it cannot be edited',
            statusCode: 409,
        },
    });

    return function slackPromptSettleRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: IChatPromptSettleParams,
    ) {
        const token = slackTokenGet(this.config?.accounts, params.account);
        if (!token) throw errors['slack.accountMissing']({params: {account: params.account ?? ''}});
        if (!params.messageId)
            throw errors['slack.messageUnknown']({params: {promptId: params.prompt.promptId}});
        const answer = params.answer;
        const text = [answer.value, ...(answer.values ?? []), answer.text]
            .filter((part): part is string => Boolean(part))
            .join(', ');
        return {
            url: new URL(
                'chat.update',
                slackBaseGet(this.config?.accounts, params.account, this.config?.url),
            ),
            path: 'chat.update',
            method: 'POST',
            responseType: 'json',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json; charset=utf-8',
            },
            json: {
                channel: params.conversationId,
                ts: params.messageId,
                // The fallback a notification and a search result read, where blocks are not rendered.
                text: `${params.prompt.text} — ${text || 'no answer'}`,
                mrkdwn: true,
                blocks: slackPromptAnsweredBlocks(params.prompt, params.answer),
            },
        };
    };
});
