import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

/**
 * `feedback.shot.get` — the screenshot of one session (`@@T-471`).
 *
 * The picture lives in its own table so a session list never drags it; this is
 * the read that pays for it, one session at a time, and only when the review page
 * actually shows a picture.
 */
export default handler(({errors, lib: {uuidBuf}}) => ({
    async feedbackShotGet(
        params: {sessionId?: string},
        _$meta: IMeta,
    ): Promise<{
        shotData: string;
        mimeType: string;
        shotWidth?: number;
        shotHeight?: number;
        byteSize?: number;
    }> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const sessionId = String(params?.sessionId ?? '');
        if (!sessionId) throw errors.feedbackShotMissing({params: {sessionId}});

        const row = (await qb('feedback_shot').where('sessionId', uuidBuf(sessionId)).first()) as
            | {
                  shotData: string;
                  mimeType: string;
                  shotWidth?: number;
                  shotHeight?: number;
                  byteSize?: number;
              }
            | undefined;
        if (!row) throw errors.feedbackShotMissing({params: {sessionId}});

        return {
            shotData: row.shotData,
            mimeType: row.mimeType,
            ...(row.shotWidth != null && {shotWidth: row.shotWidth}),
            ...(row.shotHeight != null && {shotHeight: row.shotHeight}),
            ...(row.byteSize != null && {byteSize: row.byteSize}),
        };
    },
}));
