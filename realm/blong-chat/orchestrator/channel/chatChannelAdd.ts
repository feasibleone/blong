import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `chat.channel.add` — Remember a conversation and the binding it carries (`@@D-725`).
 *
 * The query lives in `adapter/db`, where `queryBuilder` is in scope; this is the group the dispatch port
 * serves, so another realm reaches the channel through one namespace and not through the adapter's own.
 */
export default handler(({handler: {'db/chatChannelAdd': chatChannelAdd}}) => ({
    async chatChannelAdd(
        params: {platform: string; account?: string; conversationId: string; conversationTitle?: string; consumerMethod?: string; bindingKind?: string; bindingKey?: string; bindingParams?: string},
        $meta: IMeta,
    ): Promise<{channel: Record<string, unknown>}> {
        return (await chatChannelAdd(params, $meta)) as {channel: Record<string, unknown>};
    },
}));
