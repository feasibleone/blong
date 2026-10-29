import type {FeedbackSessionStatus} from '@feasibleone/blong';
import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

/**
 * `feedback.session.update` — mark a batch processed (`@@T-471`).
 *
 * Bulk by design (`update`, not `edit`): a reviewer works the queue, takes one
 * document out of it and hands over everything it covered in one act (`@@D-663`).
 * The status is the only mutable state on a session, and this handler is the only
 * place that writes it — which is what keeps a render a pure read.
 */
export default handler(({errors, lib: {uuidBuf, actorBuf}}) => ({
    async feedbackSessionUpdate(
        params: {sessionIds?: string[]; status?: FeedbackSessionStatus},
        $meta: IMeta,
    ): Promise<{updated: number}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');

        const sessionIds = (params?.sessionIds ?? []).filter(Boolean);
        if (!sessionIds.length) {
            throw errors.feedbackEmptySubmission({params: {reason: 'noSessions'}});
        }
        const status: FeedbackSessionStatus = params?.status ?? 'processed';
        const actorId = $meta?.auth?.actorId;
        const actorKey = actorBuf(typeof actorId === 'string' ? actorId : undefined);

        const updated = await qb('feedback_session')
            .whereIn('sessionId', sessionIds.map(uuidBuf))
            .update({
                status,
                processedBy: actorKey,
                processedAt: status === 'processed' ? new Date() : null,
            });

        return {updated: Number(updated) || 0};
    },
}));
