import type {IChatAccountMap, IChatChannelTopicParams} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/**
 * `slack.channel.topic` — the one thing a plan's channel says about itself.
 *
 * The topic carries the GitHub issue, which is what a person arriving from Slack needs: the plan
 * lives locally, the issue is what the rest of the team can read, and a channel with no link in it
 * is a conversation nobody can find the context for (`@@D-805`).
 *
 * `conversations.setTopic` is a separate call because Slack has no parameter for it at creation, so
 * the caller makes two calls and the channel exists briefly with no topic. That is the platform's
 * shape, not a design choice.
 */
export default handler(({lib: {error, slackTokenGet, slackBaseGet}}) => {
    const errors = error({
        'slack.channelAccountMissing': {
            message: 'No Slack account {account} is configured',
            statusCode: 404,
        },
    });

    return function slackChannelTopicRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: IChatChannelTopicParams,
    ) {
        const token = slackTokenGet(this.config?.accounts, params.account);
        if (!token) {
            throw errors['slack.channelAccountMissing']({
                params: {account: params.account ?? ''},
            });
        }
        return {
            url: new URL(
                'conversations.setTopic',
                slackBaseGet(this.config?.accounts, params.account, this.config?.url),
            ),
            path: 'conversations.setTopic',
            method: 'POST',
            responseType: 'json',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json; charset=utf-8',
            },
            json: {channel: params.conversationId, topic: params.topic},
        };
    };
});
