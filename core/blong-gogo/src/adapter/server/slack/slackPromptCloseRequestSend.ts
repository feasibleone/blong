import type {IChatAccountMap, IChatPromptCloseParams} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/**
 * `slack.prompt.close` — the question's own message, rewritten once it can no longer be answered.
 *
 * A prompt that times out leaves its options and its submit button in the channel, and both still
 * look live: the click arrives, the realm finds no parked question behind it, and the person is left
 * believing the button is broken. `chat.update` is the same call the answered question makes, with the
 * controls replaced by the caller's notice — the question stays readable and nothing interactive
 * survives (`@@T-524`).
 *
 * Unlike a settle, this is cleanup on a call that has already failed with its timeout, so a message
 * that cannot be named is not worth an error the caller would see twice: the caller logs the skip and
 * the person is left with a stale message rather than a second failure.
 */
export default handler(({lib: {error, slackTokenGet, slackBaseGet, slackPromptExpiredBlocks}}) => {
    const errors = error({
        'slack.closeAccountMissing': {
            message: 'No Slack account {account} is configured',
            statusCode: 404,
        },
    });

    return function slackPromptCloseRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: IChatPromptCloseParams,
    ) {
        const token = slackTokenGet(this.config?.accounts, params.account);
        if (!token) throw errors['slack.closeAccountMissing']({params: {account: params.account ?? ''}});
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
                // What a notification and a search result read, where blocks are not rendered.
                text: `${params.prompt.text} — ${params.notice}`,
                mrkdwn: true,
                blocks: slackPromptExpiredBlocks(params.prompt, params.notice),
            },
        };
    };
});
