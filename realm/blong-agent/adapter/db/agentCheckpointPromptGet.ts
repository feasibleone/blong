import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `agent.checkpoint.prompt.get` — the checkpoint that was waiting for an answer, by its prompt.
 *
 * A cold answer arrives with nothing but the prompt id the question was asked under, so this is the
 * lookup that turns it into a session — and the reason the pending checkpoint is written before the ask
 * rather than after it (`@@D-709`).
 */
export default handler(({lib: {rowOut}}) => ({
    async agentCheckpointPromptGet(
        params: {promptId: string},
        _$meta: IMeta,
    ): Promise<{checkpoint?: Record<string, unknown>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const rows = (await qb('agent_checkpoint')
            .where('pendingPromptId', params.promptId)
            .orderBy('sequence', 'desc')
            .limit(1)
            .select('*')) as Array<Record<string, unknown>>;
        return rows.length ? {checkpoint: rowOut(rows[0])} : {};
    },
}));
