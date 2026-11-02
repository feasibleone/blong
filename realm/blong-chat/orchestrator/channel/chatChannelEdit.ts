import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `chat.channel.edit` — Bind, rebind, or mark activity on a conversation (`@@D-727`).
 *
 * The query lives in `adapter/db`, where `queryBuilder` is in scope; this is the group the dispatch port
 * serves, so another realm reaches the channel through one namespace and not through the adapter's own.
 */
export default handler(({handler: {'db/chatChannelEdit': chatChannelEdit}}) => ({
    async chatChannelEdit(
        params: {channelId: string; patch: {conversationTitle?: string | null; consumerMethod?: string | null; bindingKind?: string | null; bindingKey?: string | null; bindingParams?: string | null; touch?: boolean}},
        $meta: IMeta,
    ): Promise<{updated: boolean; channel?: Record<string, unknown>}> {
        return (await chatChannelEdit(params, $meta)) as {updated: boolean; channel?: Record<string, unknown>};
    },
}));
