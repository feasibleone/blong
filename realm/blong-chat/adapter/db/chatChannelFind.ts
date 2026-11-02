import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `chat.channel.find` — the row for one conversation, if this realm has met it before.
 *
 * The address is the unique index: platform, account and conversation id. A caller that has only the
 * conversation (a webhook that resolved no account) passes an empty account and gets whatever the
 * platform stored under that key, which is what keeps one address shape rather than two.
 */
export default handler(({lib: {rowOut}}) => ({
    async chatChannelFind(
        params: {platform: string; account?: string; conversationId: string},
        _$meta: IMeta,
    ): Promise<{channel?: Record<string, unknown>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const rows = (await qb('chat_channel')
            .where('platform', params.platform)
            .where('account', params.account ?? '')
            .where('conversationId', params.conversationId)
            .limit(1)
            .select('*')) as Array<Record<string, unknown>>;
        return rows.length ? {channel: rowOut(rows[0])} : {};
    },
}));
