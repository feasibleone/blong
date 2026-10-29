import type {FeedbackSessionStatus} from '@feasibleone/blong';
import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

/**
 * `feedback.session.list` — the reviewer's queue (`@@T-473`).
 *
 * The generic `find` cannot answer this: it normalises a `uid` key to a Buffer
 * and knex refuses one in a where-object, and the page needs one row per session
 * carrying its item count. Ordering is newest first, because a reviewer works
 * backwards from what was just reported.
 */
export default handler(({lib: {bufToUuid}}) => ({
    async feedbackSessionList(
        params: {status?: FeedbackSessionStatus | null; limit?: number},
        _$meta: IMeta,
    ): Promise<{sessions: Array<Record<string, unknown>>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');

        const limit = Math.min(Math.max(Number(params?.limit) || 100, 1), 500);
        const query = qb('feedback_session')
            .select('*')
            .orderBy('submittedAt', 'desc')
            .limit(limit);
        const status = params?.status;
        if (status === 'new' || status === 'processed') query.where('status', status);
        const rows = (await query) as Array<Record<string, unknown>>;

        // The rows are `Record<string, unknown>`, and the column is BINARY(16):
        // naming the two shapes is what makes `whereIn` resolve to the overload
        // that takes values rather than to the one that takes a column list.
        const keys = rows.map(row => row.sessionId as Buffer | string);
        const counts = new Map<string, number>();
        if (keys.length) {
            // Open comments only: the queue says how much is left to read, and a
            // comment the reviewer closed is not (`@@T-496`).
            const itemRows: Array<{sessionId: Buffer | string; total: number | string}> = await qb(
                'feedback_item',
            )
                .whereIn('sessionId', keys)
                .whereNull('removedAt')
                .groupBy('sessionId')
                .select('sessionId')
                .count({total: 'feedbackItemId'});
            for (const row of itemRows) {
                counts.set(bufToUuid(row.sessionId), Number(row.total) || 0);
            }
        }

        const sessions = rows.map(row => {
            const sessionId = bufToUuid(row.sessionId as Buffer | string);
            return {
                sessionId,
                pageUrl: row.pageUrl,
                pageTitle: row.pageTitle ?? undefined,
                pageSubject: row.pageSubject ?? undefined,
                pageObject: row.pageObject ?? undefined,
                pageKind: row.pageKind ?? undefined,
                languageCode: row.languageCode ?? undefined,
                shotStatus: row.shotStatus,
                status: row.status,
                submittedAt:
                    row.submittedAt instanceof Date
                        ? row.submittedAt.toISOString()
                        : String(row.submittedAt ?? ''),
                itemCount: counts.get(sessionId) ?? 0,
            };
        });

        return {sessions};
    },
}));
