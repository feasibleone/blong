import type {IChatAccountMap, IChatPromptParams} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/**
 * `slack.prompt.send` — the question, as a message.
 *
 * A choice or a confirmation is answered in the message itself; a multiple choice or a free-text
 * question gets one button that asks for the form (`slack.prompt.form`), because Slack renders those
 * controls in a modal only (`@@D-678`).
 */
export default handler(({lib: {error, slackTokenGet, slackBaseGet, slackPromptBlocks}}) => {
    const errors = error({
        'slack.accountMissing': {
            message: 'No Slack account {account} is configured',
            statusCode: 404,
        },
    });

    return function slackPromptSendRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: IChatPromptParams,
    ) {
        const token = slackTokenGet(this.config?.accounts, params.account);
        if (!token) throw errors['slack.accountMissing']({params: {account: params.account ?? ''}});
        return {
            url: new URL(
                'chat.postMessage',
                slackBaseGet(this.config?.accounts, params.account, this.config?.url),
            ),
            path: 'chat.postMessage',
            method: 'POST',
            responseType: 'json',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json; charset=utf-8',
            },
            json: {
                channel: params.conversationId,
                mrkdwn: true,
                text: params.prompt.text,
                blocks: slackPromptBlocks(params.prompt),
            },
        };
    };
});
