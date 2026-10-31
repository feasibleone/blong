import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `agent.session.find` — the sessions a caller can list, newest first.
 *
 * The filters are the ones a worker and a test ask for: by ticket, by status, and by the host that
 * owns a suspended one (`@@D-702`).
 */
export default handler(({lib: {rowOut}}) => ({
    async agentSessionFind(
        params: {ticketId?: string; status?: string; workerId?: string; limit?: number},
        _$meta: IMeta,
    ): Promise<{sessions: Array<Record<string, unknown>>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const query = qb('agent_session').select('*').orderBy('createdAt', 'desc');
        if (params?.ticketId) query.where('ticketId', params.ticketId);
        if (params?.status) query.where('status', params.status);
        if (params?.workerId) query.where('workerId', params.workerId);
        query.limit(Math.min(Math.max(Number(params?.limit) || 50, 1), 500));
        const rows = (await query) as Array<Record<string, unknown>>;
        return {sessions: rows.map(row => rowOut(row) as Record<string, unknown>)};
    },
}));
