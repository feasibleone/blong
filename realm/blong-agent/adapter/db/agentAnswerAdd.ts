import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `agent.answer.add` — a human answer, stored once per prompt.
 *
 * Idempotent on the prompt id rather than a duplicate error: a platform retries a click, and the second
 * delivery of the same answer is not a fault (`@@D-702`).
 */
export default handler(({lib: {uuidBuf, rowOut}}) => ({
    async agentAnswerAdd(
        params: {
            answerId: string;
            promptId: string;
            ticketId: string;
            sessionId?: string;
            answerText: string;
            senderName?: string;
        },
        _$meta: IMeta,
    ): Promise<{answer: Record<string, unknown>; stored: boolean}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const existing = (await qb('agent_answer')
            .where('promptId', params.promptId)
            .limit(1)
            .select('*')) as Array<Record<string, unknown>>;
        if (existing.length) return {answer: rowOut(existing[0]), stored: false};
        const now = new Date();
        const row = {
            answerId: uuidBuf(params.answerId),
            promptId: params.promptId,
            ticketId: params.ticketId,
            sessionId: params.sessionId ? uuidBuf(params.sessionId) : null,
            answerText: params.answerText,
            senderName: params.senderName ?? null,
            receivedAt: now,
            consumedAt: null,
        };
        await qb('agent_answer').insert(row);
        return {answer: rowOut({...row, answerId: params.answerId}), stored: true};
    },
}));
