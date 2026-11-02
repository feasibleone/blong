import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `chat.channel.find` — The stored row for one conversation, if this realm has met it before (`@@D-725`).
 *
 * The query lives in `adapter/db`, where `queryBuilder` is in scope; this is the group the dispatch port
 * serves, so another realm reaches the channel through one namespace and not through the adapter's own.
 */
export default handler(({handler: {'db/chatChannelFind': chatChannelFind}}) => ({
    async chatChannelFind(
        params: {platform: string; account?: string; conversationId: string},
        $meta: IMeta,
    ): Promise<{channel?: Record<string, unknown>}> {
        return (await chatChannelFind(params, $meta)) as {channel?: Record<string, unknown>};
    },
}));
