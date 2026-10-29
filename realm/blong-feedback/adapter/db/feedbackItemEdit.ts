import {type IFeedbackBox, type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

/**
 * `feedback.item.edit` — the reviewer's clarification of one comment (`@@T-471`).
 *
 * Edits the *stored* wording, never a rendered document: `refinedText` is what
 * the prose prefers over `commentText` on the next render, so a correction is
 * durable without a document to keep in sync (`@@D-660`).
 *
 * The session id is part of the address on purpose — an item id alone would let a
 * caller edit a row of a session it cannot read.
 *
 * The reviewer also owns the box: `callout` writes back the geometry a move or a
 * resize produced, so the picture keeps the shape it was left in (`@@T-495`), and
 * `removed` closes a comment without deleting what the person said (`@@T-496`).
 */
export default handler(({errors, lib: {uuidBuf, itemBuf, limits}}) => ({
    async feedbackItemEdit(
        params: {
            sessionId?: string;
            itemId?: string;
            commentText?: string;
            refinedText?: string;
            callout?: IFeedbackBox;
            removed?: boolean;
        },
        $meta: IMeta,
    ): Promise<{updated: number}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');

        const {sessionId, itemId} = params ?? {};
        if (!sessionId || !itemId) {
            throw errors.feedbackItemNotInSession({
                params: {
                    itemId: String(itemId),
                    sessionId: String(sessionId),
                },
            });
        }
        if (
            params.refinedText !== undefined &&
            params.refinedText !== null &&
            params.refinedText.length > limits.refined
        ) {
            throw errors.feedbackEmptySubmission({params: {reason: 'refinedTooLong'}});
        }
        if (
            params.commentText !== undefined &&
            params.commentText !== null &&
            params.commentText.length > limits.comment
        ) {
            throw errors.feedbackEmptySubmission({params: {reason: 'commentTooLong'}});
        }

        const sessionKey = uuidBuf(sessionId);
        const existing = await qb('feedback_item')
            .where('sessionId', sessionKey)
            .where('feedbackItemId', itemBuf(itemId))
            .first('feedbackItemId');
        if (!existing) {
            throw errors.feedbackItemNotInSession({params: {itemId, sessionId}});
        }

        const patch: Record<string, unknown> = {};
        if (params.commentText !== undefined) patch.commentText = params.commentText;
        if (params.refinedText !== undefined) patch.refinedText = params.refinedText;
        if (params.callout !== undefined) {
            const box = params.callout;
            const fractions = [box?.x, box?.y, box?.width, box?.height];
            if (!fractions.every(value => typeof value === 'number' && value >= 0 && value <= 1)) {
                throw errors.feedbackEmptySubmission({params: {reason: 'calloutNotFractional'}});
            }
            patch.calloutJSON = JSON.stringify({
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
            });
        }
        if (params.removed !== undefined) patch.removedAt = params.removed ? new Date() : null;
        if (!Object.keys(patch).length) return {updated: 0};

        const updated = await qb('feedback_item')
            .where('sessionId', sessionKey)
            .where('feedbackItemId', itemBuf(itemId))
            .update(patch);
        void $meta;
        return {updated: Number(updated) || 0};
    },
}));
