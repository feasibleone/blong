import type {IChatAccountMap, IChatChannelCreateParams} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/**
 * `slack.channel.create` — the `conversations.create` a plan's channel is opened with.
 *
 * A channel the bot creates is one it is already a member of, which is what makes the first message
 * and the questions that follow arrive without a second invite. The name is the caller's, because
 * the caller is the one that knows what the channel stands for; Slack's own rules (lowercase,
 * digits, `-` and `_`, at most 80) are enforced where the name is built (`@@D-805`).
 *
 * A name Slack already holds answers `ok: false, error: 'name_taken'`. That is not an error here:
 * the caller asked for *the* channel of this plan, and one that exists is the answer it wants — the
 * realm decides whether to reuse it or to report the clash.
 */
export default handler(({lib: {error, slackTokenGet, slackBaseGet}}) => {
    const errors = error({
        'slack.channelAccountMissing': {
            message: 'No Slack account {account} is configured',
            statusCode: 404,
        },
    });

    return function slackChannelCreateRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: IChatChannelCreateParams,
    ) {
        const token = slackTokenGet(this.config?.accounts, params.account);
        if (!token) {
            throw errors['slack.channelAccountMissing']({
                params: {account: params.account ?? ''},
            });
        }
        return {
            url: new URL(
                'conversations.create',
                slackBaseGet(this.config?.accounts, params.account, this.config?.url),
            ),
            path: 'conversations.create',
            method: 'POST',
            responseType: 'json',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json; charset=utf-8',
            },
            json: {
                name: params.channelName,
                is_private: params.isPrivate ?? true,
            },
        };
    };
});
