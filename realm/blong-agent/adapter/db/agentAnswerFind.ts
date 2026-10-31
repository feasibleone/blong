import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/** `agent.answer.find` — what is waiting for a session, oldest first, so a resume takes the first. */
export default handler(({lib: {uuidBuf, rowOut}}) => ({
    async agentAnswerFind(
        params: {sessionId?: string; consumed?: boolean; limit?: number},
        _$meta: IMeta,
    ): Promise<{answers: Array<Record<string, unknown>>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const query = qb('agent_answer').select('*').orderBy('receivedAt', 'asc');
        if (params?.sessionId) query.where('sessionId', uuidBuf(params.sessionId));
        if (params?.consumed === false) query.whereNull('consumedAt');
        if (params?.consumed === true) query.whereNotNull('consumedAt');
        query.limit(Math.min(Math.max(Number(params?.limit) || 20, 1), 200));
        const rows = (await query) as Array<Record<string, unknown>>;
        return {answers: rows.map(row => rowOut(row) as Record<string, unknown>)};
    },
}));
