import {type IFeedbackBox, type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

/**
 * `feedback.session.items` — one session with its comments (`@@T-471`).
 *
 * The review page and the tap flow need the items with the ids the wire carries,
 * which the generic `get` cannot give: it normalises a `uid` key to the binary
 * column value and then hands it to a where-object, which knex refuses. This
 * reader is also where the `anchorJSON` string becomes an object again, so the
 * page can draw the rectangles without parsing them itself.
 */
export default handler(({errors, lib: {uuidBuf, bufToUuid, itemIdOf}}) => ({
    async feedbackSessionItems(
        params: {sessionId?: string},
        _$meta: IMeta,
    ): Promise<{
        session: Record<string, unknown>;
        items: Array<Record<string, unknown>>;
    }> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const sessionId = String(params?.sessionId ?? '');
        if (!sessionId) throw errors.feedbackSessionNotFound({params: {sessionId}});

        const session = (await qb('feedback_session')
            .where('sessionId', uuidBuf(sessionId))
            .first()) as Record<string, unknown> | undefined;
        if (!session) throw errors.feedbackSessionNotFound({params: {sessionId}});

        const rows = (await qb('feedback_item')
            .where('sessionId', uuidBuf(sessionId))
            .orderBy('itemIndex')) as Array<{
            feedbackItemId: Buffer | string;
            targetId: string;
            targetKind: string;
            targetLabel?: string | null;
            domHint?: string | null;
            anchorJSON?: unknown;
            calloutJSON?: unknown;
            commentText: string;
            refinedText?: string | null;
            removedAt?: Date | string | null;
            itemIndex: number;
        }>;

        const items = rows.map(row => ({
            feedbackItemId: itemIdOf(row.feedbackItemId),
            targetId: row.targetId,
            targetKind: row.targetKind,
            targetLabel: row.targetLabel ?? undefined,
            domHint: row.domHint ?? undefined,
            anchor: parseBox(row.anchorJSON),
            callout: parseBox(row.calloutJSON),
            commentText: row.commentText,
            refinedText: row.refinedText ?? undefined,
            removedAt: row.removedAt ? new Date(row.removedAt).toISOString() : undefined,
            itemIndex: row.itemIndex,
        }));

        return {
            session: {
                sessionId: bufToUuid(session.sessionId as Buffer | string),
                pageUrl: session.pageUrl,
                pageTitle: session.pageTitle ?? undefined,
                pageSubject: session.pageSubject ?? undefined,
                pageObject: session.pageObject ?? undefined,
                pageKind: session.pageKind ?? undefined,
                languageCode: session.languageCode ?? undefined,
                shotStatus: session.shotStatus,
                status: session.status,
                submittedAt: session.submittedAt,
                itemCount: items.length,
            },
            items,
        };
    },
}));

/**
 * Read a stored box, tolerating the three shapes it arrives in.
 *
 * The driver hands a JSON column back already parsed and a text column back as
 * text — the same table served both while this column was introduced — so the
 * reader accepts either rather than refusing the whole session over a shape it
 * did not expect.
 */
function parseBox(value: unknown): IFeedbackBox | undefined {
    if (!value) return undefined;
    let parsed: unknown = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            return undefined;
        }
    }
    if (!parsed || typeof parsed !== 'object') return undefined;
    const box = parsed as Partial<IFeedbackBox>;
    const keys = ['x', 'y', 'width', 'height'] as const;
    if (!keys.every(key => typeof box[key] === 'number')) return undefined;
    return {
        x: box.x as number,
        y: box.y as number,
        width: box.width as number,
        height: box.height as number,
    };
}
