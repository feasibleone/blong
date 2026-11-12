import type {IChatAccountMap, IChatChannelInviteParams} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/**
 * `slack.channel.invite` — the people a private channel is useless without.
 *
 * A bot-created private channel has exactly one member, the bot, and nobody can find it to join. The
 * caller names the user ids; `conversations.invite` takes them comma-separated, which is the one
 * place the platform's own API shape leaks into a parameter (`@@D-805`).
 *
 * An invite for somebody already in the channel answers `ok: false, error: 'already_in_channel'`,
 * which the caller treats as success: the point is that they are there.
 */
export default handler(({lib: {error, slackTokenGet, slackBaseGet}}) => {
    const errors = error({
        'slack.channelAccountMissing': {
            message: 'No Slack account {account} is configured',
            statusCode: 404,
        },
    });

    return function slackChannelInviteRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: IChatChannelInviteParams,
    ) {
        const token = slackTokenGet(this.config?.accounts, params.account);
        if (!token) {
            throw errors['slack.channelAccountMissing']({
                params: {account: params.account ?? ''},
            });
        }
        return {
            url: new URL(
                'conversations.invite',
                slackBaseGet(this.config?.accounts, params.account, this.config?.url),
            ),
            path: 'conversations.invite',
            method: 'POST',
            responseType: 'json',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json; charset=utf-8',
            },
            json: {
                channel: params.conversationId,
                users: params.invite.join(','),
            },
        };
    };
});
