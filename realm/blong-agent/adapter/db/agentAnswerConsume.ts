import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/** `agent.answer.consume` — mark an answer used, so no resume applies it twice (`@@D-702`). */
export default handler(({lib: {uuidBuf}}) => ({
    async agentAnswerConsume(
        params: {answerId: string},
        _$meta: IMeta,
    ): Promise<{consumed: boolean}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const changed = await qb('agent_answer')
            .where('answerId', uuidBuf(params.answerId))
            .update({consumedAt: new Date()});
        return {consumed: Number(changed) > 0};
    },
}));
