import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `chat.channel.edit` — bind, rebind, or mark activity.
 *
 * `touch` is the common case and the reason this is one method rather than two: every inbound message
 * moves `lastActivityAt` and counts a turn, and the consumer's continuation window is measured from
 * exactly that. Writing the binding and marking activity therefore share a row and a moment.
 *
 * A field is written only when the caller named it, so `undefined` keeps the stored value while
 * `null` clears it — which is what an unbind means.
 */
export default handler(({lib: {uuidBuf, rowOut}}) => ({
    async chatChannelEdit(
        params: {
            channelId: string;
            patch: {
                conversationTitle?: string | null;
                consumerMethod?: string | null;
                bindingKind?: string | null;
                bindingKey?: string | null;
                bindingParams?: string | null;
                touch?: boolean;
            };
        },
        _$meta: IMeta,
    ): Promise<{updated: boolean; channel?: Record<string, unknown>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const patch = params.patch ?? {};
        const row: Record<string, unknown> = {updatedAt: new Date()};
        for (const key of [
            'conversationTitle',
            'consumerMethod',
            'bindingKind',
            'bindingKey',
            'bindingParams',
        ] as const) {
            if (patch[key] !== undefined) row[key] = patch[key];
        }
        if (patch.touch) {
            row.lastActivityAt = new Date();
            row.turnCount = qb.raw('COALESCE(turnCount, 0) + 1');
        }
        const updated = await qb('chat_channel')
            .where('channelId', uuidBuf(params.channelId))
            .update(row);
        if (Number(updated) === 0) return {updated: false};
        const rows = (await qb('chat_channel')
            .where('channelId', uuidBuf(params.channelId))
            .limit(1)
            .select('*')) as Array<Record<string, unknown>>;
        return {updated: true, channel: rows.length ? rowOut(rows[0]) : undefined};
    },
}));
