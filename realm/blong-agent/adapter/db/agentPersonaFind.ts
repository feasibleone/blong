import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `agent.persona.find` — the personas a deployment offers, in the order a picker shows them.
 *
 * The key filter is the one every caller needs: a channel binding names a key, never an id, so the
 * lookup that answers a message is by key; a picker asks for the enabled ones.
 */
export default handler(({lib: {rowOut}}) => ({
    async agentPersonaFind(
        params: {personaKey?: string; enabled?: boolean; limit?: number},
        _$meta: IMeta,
    ): Promise<{personas: Array<Record<string, unknown>>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const query = qb('agent_persona')
            .select('*')
            .orderBy([
                {column: 'sortOrder', order: 'asc'},
                {column: 'personaKey', order: 'asc'},
            ]);
        if (params?.personaKey) query.where('personaKey', params.personaKey);
        if (params?.enabled !== undefined) query.where('enabled', params.enabled ? 1 : 0);
        query.limit(Math.min(Math.max(Number(params?.limit) || 100, 1), 500));
        const rows = (await query) as Array<Record<string, unknown>>;
        return {personas: rows.map(row => rowOut(row) as Record<string, unknown>)};
    },
}));
