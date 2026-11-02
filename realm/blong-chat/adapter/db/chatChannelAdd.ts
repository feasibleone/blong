import {randomUUID} from 'node:crypto';

import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `chat.channel.add` — remember a conversation, and what it talks to.
 *
 * The binding arrives as the three generic columns, so this handler writes whatever the consumer
 * named and reads none of it (`@@D-725`). `consumerMethod` is stored beside them because a channel may
 * outlive a change to the deployment's forward map: the conversation already knows who answers it.
 */
export default handler(({lib: {uuidBuf, rowOut}}) => ({
    async chatChannelAdd(
        params: {
            platform: string;
            account?: string;
            conversationId: string;
            conversationTitle?: string;
            consumerMethod?: string;
            bindingKind?: string;
            bindingKey?: string;
            bindingParams?: string;
        },
        _$meta: IMeta,
    ): Promise<{channel: Record<string, unknown>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const channelId = randomUUID();
        const now = new Date();
        const row = {
            channelId: uuidBuf(channelId),
            platform: params.platform,
            account: params.account ?? '',
            conversationId: params.conversationId,
            conversationTitle: params.conversationTitle ?? null,
            consumerMethod: params.consumerMethod ?? null,
            bindingKind: params.bindingKind ?? null,
            bindingKey: params.bindingKey ?? null,
            bindingParams: params.bindingParams ?? null,
            lastActivityAt: now,
            turnCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        await qb('chat_channel').insert(row);
        return {channel: rowOut({...row, channelId})};
    },
}));
