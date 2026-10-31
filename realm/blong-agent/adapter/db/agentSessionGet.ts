import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `agent.session.get` — one session, by id.
 *
 * `find` answers a list for a ticket or a worker, which is what a claim and a release need; a resume, a
 * wake and the recovery scan all start from an id they were handed and have nothing else to match on
 * (`@@D-704`).
 */
export default handler(({lib: {uuidBuf, rowOut}}) => ({
    async agentSessionGet(
        params: {sessionId: string},
        _$meta: IMeta,
    ): Promise<{session?: Record<string, unknown>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const rows = (await qb('agent_session')
            .where('sessionId', uuidBuf(params.sessionId))
            .limit(1)
            .select('*')) as Array<Record<string, unknown>>;
        return rows.length ? {session: rowOut(rows[0])} : {};
    },
}));
