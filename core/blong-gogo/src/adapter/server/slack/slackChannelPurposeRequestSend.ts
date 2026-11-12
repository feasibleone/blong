import type {IChatAccountMap, IChatChannelPurposeParams} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/**
 * `slack.channel.purpose` — the channel's own title, which Slack keeps apart from its name.
 *
 * A channel name is lowercase and hyphenated, so a plan's title does not survive in it. The purpose
 * is where the readable title goes, and the topic carries the GitHub issue: a person arriving from
 * the issue finds the title, and a person arriving from the channel finds the issue (`@@D-805`).
 */
export default handler(({lib: {error, slackTokenGet, slackBaseGet}}) => {
    const errors = error({
        'slack.channelAccountMissing': {
            message: 'No Slack account {account} is configured',
            statusCode: 404,
        },
    });

    return function slackChannelPurposeRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: IChatChannelPurposeParams,
    ) {
        const token = slackTokenGet(this.config?.accounts, params.account);
        if (!token) {
            throw errors['slack.channelAccountMissing']({
                params: {account: params.account ?? ''},
            });
        }
        return {
            url: new URL(
                'conversations.setPurpose',
                slackBaseGet(this.config?.accounts, params.account, this.config?.url),
            ),
            path: 'conversations.setPurpose',
            method: 'POST',
            responseType: 'json',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json; charset=utf-8',
            },
            json: {channel: params.conversationId, purpose: params.purpose},
        };
    };
});
