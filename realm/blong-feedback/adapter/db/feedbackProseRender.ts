import {type IMeta} from '@feasibleone/blong';
import type {
    FeedbackSessionStatus,
    IFeedbackItem,
    IFeedbackSession,
} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';
import type {IProseEntry} from './prose.ts';

type SessionRow = {
    sessionId: Buffer | string;
    pageUrl: string;
    pageTitle?: string | null;
    pageSubject?: string | null;
    pageObject?: string | null;
    pageKind?: string | null;
    languageCode?: string | null;
    userResourceId?: Buffer | string | null;
    viewportJSON?: string | null;
    shotStatus: IFeedbackSession['shotStatus'];
    status: IFeedbackSession['status'];
    processedBy?: Buffer | string | null;
    processedAt?: Date | string | null;
    submittedAt: Date | string;
};

type ItemRow = {
    sessionId: Buffer | string;
    itemIndex: number;
    targetId: string;
    targetKind: IFeedbackItem['targetKind'];
    targetLabel?: string | null;
    domHint?: string | null;
    anchorJSON?: string | null;
    commentText: string;
    refinedText?: string | null;
    removedAt?: Date | string | null;
};

/** A database timestamp as the ISO string the contract carries. */
function iso(value: Date | string | null | undefined): string | undefined {
    if (!value) return undefined;
    return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * `feedback.prose.render` — the Markdown for a batch (`@@T-471`).
 *
 * A read, and only a read: it takes either an explicit list of sessions or the
 * `new` queue, renders what the rows currently say, and writes nothing
 * (`@@D-660`, `@@D-663`). Repeating it is safe, a correction to a wording shows
 * up in the next call, and an empty document means the queue is clear.
 *
 * The optional polish hook is a rewrite of the response, named in the realm's
 * config (`config.prose.polish`) and reached through the handler proxy. It is
 * given the rendered document and the sessions it covers, and its answer is
 * returned — never stored.
 */
export default handler(
    ({handler, lib: {bufToUuid, renderProse}}) => ({
        async feedbackProseRender(
            params: {sessionIds?: string[]; status?: FeedbackSessionStatus},
            $meta: IMeta,
        ): Promise<{document: string; sessionIds: string[]; itemCount: number}> {
            const qb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const ids = (params?.sessionIds ?? []).filter(Boolean);
            const status = params?.status;
            const query = qb('feedback_session').select('*');
            if (ids.length) query.whereIn('sessionId', ids.map(id => Buffer.from(id.replace(/-/g, ''), 'hex')));
            else query.where({status: status ?? 'new'});
            const sessions = (await query) as SessionRow[];
            if (!sessions.length) {
                return {document: renderProse([]), sessionIds: [], itemCount: 0};
            }

            const keys = sessions.map(row => row.sessionId);
            const itemRows = (await qb('feedback_item')
                .whereIn('sessionId', keys)
                .orderBy(['sessionId', 'itemIndex'])) as ItemRow[];

            const bySession = new Map<string, IFeedbackItem[]>();
            for (const row of itemRows) {
                // A comment the reviewer closed is kept as a row and left out of the
                // document, so the count below and the sections agree (`@@T-496`).
                if (row.removedAt) continue;
                const key = bufToUuid(row.sessionId);
                const list = bySession.get(key) ?? [];
                list.push({
                    targetId: row.targetId,
                    targetKind: row.targetKind,
                    ...(row.targetLabel != null && {targetLabel: row.targetLabel}),
                    ...(row.domHint != null && {domHint: row.domHint}),
                    commentText: row.commentText,
                    ...(row.refinedText != null && {refinedText: row.refinedText}),
                    itemIndex: row.itemIndex,
                });
                bySession.set(key, list);
            }

            const entries: IProseEntry[] = sessions
                .map(row => {
                    const sessionId = bufToUuid(row.sessionId);
                    const session: IFeedbackSession = {
                        sessionId,
                        pageUrl: row.pageUrl,
                        ...(row.pageTitle != null && {pageTitle: row.pageTitle}),
                        ...(row.pageSubject != null && {pageSubject: row.pageSubject}),
                        ...(row.pageObject != null && {pageObject: row.pageObject}),
                        ...(row.pageKind != null && {pageKind: row.pageKind}),
                        ...(row.languageCode != null && {languageCode: row.languageCode}),
                        ...(row.userResourceId != null && {
                            userResourceId: bufToUuid(row.userResourceId),
                        }),
                        ...(row.viewportJSON != null && {viewportJSON: row.viewportJSON}),
                        shotStatus: row.shotStatus,
                        status: row.status,
                        ...(row.processedBy != null && {processedBy: bufToUuid(row.processedBy)}),
                        ...(row.processedAt != null && {processedAt: iso(row.processedAt)}),
                        submittedAt: iso(row.submittedAt) ?? '',
                        items: bySession.get(sessionId) ?? [],
                    };
                    return {session, items: session.items ?? []};
                })
                .filter(entry => entry.items.length > 0)
                .sort((a, b) => a.session.submittedAt.localeCompare(b.session.submittedAt));

            const document = renderProse(entries);
            const polish = (this.config as {prose?: {polish?: string}} | undefined)?.prose?.polish;

            if (polish) {
                const rewritten = (await handler[polish](
                    {document, sessionIds: entries.map(entry => entry.session.sessionId)},
                    $meta,
                )) as {document?: string} | string | undefined;
                const value =
                    typeof rewritten === 'string' ? rewritten : (rewritten?.document ?? '');
                if (value) {
                    return {
                        document: value,
                        sessionIds: entries.map(entry => entry.session.sessionId),
                        itemCount: entries.reduce((total, entry) => total + entry.items.length, 0),
                    };
                }
            }

            return {
                document,
                sessionIds: entries.map(entry => entry.session.sessionId),
                itemCount: entries.reduce((total, entry) => total + entry.items.length, 0),
            };
        },
    }),
);
