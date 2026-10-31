import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `agent.checkpoint.lastGet` — the newest boundary a resume can start from.
 *
 * Newest rather than "the one named", because a crash loses the name and not the order (`@@D-705`).
 */
export default handler(({lib: {uuidBuf, rowOut}}) => ({
    async agentCheckpointLastGet(
        params: {sessionId: string},
        _$meta: IMeta,
    ): Promise<{checkpoint?: Record<string, unknown>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const rows = (await qb('agent_checkpoint')
            .where('sessionId', uuidBuf(params.sessionId))
            .orderBy('sequence', 'desc')
            .limit(1)
            .select('*')) as Array<Record<string, unknown>>;
        return rows.length ? {checkpoint: rowOut(rows[0])} : {};
    },
}));
