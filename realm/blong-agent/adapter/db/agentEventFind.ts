import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/** `agent.event.find` — a session's trace, in the order it happened. */
export default handler(({lib: {uuidBuf, rowOut}}) => ({
    async agentEventFind(
        params: {sessionId: string; limit?: number},
        _$meta: IMeta,
    ): Promise<{events: Array<Record<string, unknown>>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const rows = (await qb('agent_event')
            .where('sessionId', uuidBuf(params.sessionId))
            .orderBy('sequence', 'asc')
            .limit(Math.min(Math.max(Number(params?.limit) || 200, 1), 1000))
            .select('*')) as Array<Record<string, unknown>>;
        return {events: rows.map(row => rowOut(row) as Record<string, unknown>)};
    },
}));
