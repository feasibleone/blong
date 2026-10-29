import type {IFeedbackSessionInput} from '@feasibleone/blong';
import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

/** `subject.object.page` at the very least — three segments, no line breaks. */
function isTargetId(value: unknown): value is string {
    if (typeof value !== 'string' || !value.trim()) return false;
    if (/[\r\n]/.test(value)) return false;
    // The identifier is the page id and then one segment per container, so the
    // dot-check of the first form still applies to the page it starts from.
    return value.split('/')[0].split('.').length >= 3;
}

/**
 * `feedback.session.add` — store one submission (`@@T-469`).
 *
 * The only write a non-administrator may make. All three rows and the session's
 * `core_resource` are one transaction: a submission whose picture landed without
 * its items (or the other way round) would show up in the review page as a
 * half-read report, and a reviewer has no way to tell which half is missing.
 *
 * Nothing here renders or stores prose — the document is generated from these
 * rows when it is asked for (`@@D-660`), which is why a later correction shows up
 * in the next render instead of going stale.
 */
export default handler(
    ({errors, lib: {limits, uuidBuf, actorBuf, newItemId, sessionResourceName}}) => ({
        async feedbackSessionAdd(
            params: {session?: IFeedbackSessionInput},
            $meta: IMeta,
        ): Promise<{sessionId: string; itemCount: number}> {
            const qb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const session = params?.session;
            const items = session?.items ?? [];
            if (!session || !items.length) throw errors.feedbackEmptySubmission({params: {}});
            if (items.length > limits.items) {
                throw errors.feedbackEmptySubmission({params: {reason: 'tooManyItems'}});
            }
            for (const item of items) {
                if (!isTargetId(item?.targetId)) {
                    throw errors.feedbackInvalidTarget({
                        params: {targetId: String(item?.targetId)},
                    });
                }
                if (typeof item.commentText !== 'string') {
                    throw errors.feedbackInvalidTarget({params: {targetId: item.targetId}});
                }
                if (item.commentText.length > limits.comment) {
                    throw errors.feedbackEmptySubmission({params: {reason: 'commentTooLong'}});
                }
            }
            const shot = session.shot;
            if (shot?.shotData && shot.shotData.length > limits.shotBytes) {
                throw errors.feedbackShotTooLarge({
                    params: {
                        byteSize: shot.shotData.length,
                        limit: limits.shotBytes,
                    },
                });
            }

            const submittedAt = new Date();
            // A session has no natural name, so its resource is named after the
            // time and a random tail — the id it receives is what identifies it
            // afterwards, and the prefix keeps it greppable in the graph.
            const name = sessionResourceName(
                `${submittedAt.getTime()}-${Math.random().toString(36).slice(2, 10)}`,
            );
            const actorId = $meta?.auth?.actorId;
            const actorKey = actorBuf(typeof actorId === 'string' ? actorId : undefined);

            return qb.transaction(async trx => {
                const ensured = await super.coreResourceEnsure(
                    {
                        name,
                        typeAlias: 'feedback.session',
                        table: 'feedback_session',
                        keyName: 'sessionId',
                        extraColumns: {
                            pageUrl: session.pageUrl ?? '',
                            pageTitle: session.pageTitle ?? null,
                            pageSubject: session.pageSubject ?? null,
                            pageObject: session.pageObject ?? null,
                            pageKind: session.pageKind ?? null,
                            languageCode: session.languageCode ?? null,
                            userResourceId: actorKey,
                            viewportJSON: session.viewportJSON ?? null,
                            shotStatus: session.shotStatus ?? 'unavailable',
                            status: 'new',
                            submittedAt,
                        },
                    },
                    $meta,
                    trx,
                );
                const sessionId: string = ensured.resourceId;
                const sessionKey = uuidBuf(sessionId);

                await trx('feedback_item').insert(
                    items.map((item, index) => ({
                        feedbackItemId: newItemId(),
                        sessionId: sessionKey,
                        itemIndex: item.itemIndex ?? index,
                        targetId: item.targetId,
                        targetKind: item.targetKind ?? 'section',
                        targetLabel: item.targetLabel ?? null,
                        domHint: item.domHint ?? null,
                        anchorJSON: item.anchor ? JSON.stringify(item.anchor) : null,
                        calloutJSON: item.callout ? JSON.stringify(item.callout) : null,
                        commentText: item.commentText ?? '',
                        refinedText: item.refinedText ?? null,
                        createdAt: submittedAt,
                    })),
                );

                if (shot?.shotData && session.shotStatus === 'captured') {
                    await trx('feedback_shot').insert({
                        sessionId: sessionKey,
                        shotData: shot.shotData,
                        mimeType: shot.mimeType ?? 'image/jpeg',
                        shotWidth: shot.shotWidth ?? null,
                        shotHeight: shot.shotHeight ?? null,
                        byteSize: shot.byteSize ?? shot.shotData.length,
                    });
                }

                return {sessionId, itemCount: items.length};
            });
        },
    }),
);
