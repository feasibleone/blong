import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `agent.session.find` — the sessions a caller can list, newest first (`T-792`).
 *
 * The filters are the ones a worker and a test ask for: by ticket, by status, by the host that owns
 * a suspended one, by the persona a chat session runs under (`@@D-702`). A page list adds paging by
 * `updatedAt` and the summary the projector writes (`@@D-992`), so drawing a row costs no replay.
 */
/**
 * A page cursor: the `updatedAt` of the last row a reader has, and the row itself.
 *
 * The timestamp alone cannot be a cursor: the projection's columns keep whole seconds, so every
 * session written in one second ties, and a page that asked for `updatedAt <` that second would
 * skip the rest of it. `next` is therefore `<iso>|<sessionId>` and a bare timestamp still pages a
 * caller that passes one (`@@D-1007`).
 */
const parseCursor = (before: string): {at: Date; sessionId?: string} => {
    const separator = before.lastIndexOf('|');
    if (separator < 0) return {at: new Date(before)};
    return {at: new Date(before.slice(0, separator)), sessionId: before.slice(separator + 1)};
};

/**
 * The part of the query builder a grouped OR needs, as the two call shapes it uses.
 *
 * Narrowed here rather than reached as `any`: the builder arrives on `config.context`, whose type
 * is the framework's, and a group of conditions is the one place the three-argument form is not
 * enough on its own.
 */
interface IWhereGroup {
    where: {
        (column: string, value: unknown): IWhereGroup;
        (column: string, operator: string, value: unknown): IWhereGroup;
        (conditions: (this: IWhereGroup) => unknown): IWhereGroup;
    };
    orWhere: IWhereGroup['where'];
}

export default handler(({lib: {rowOut, uuidBuf}}) => ({
    async agentSessionFind(
        params: {
            ticketId?: string;
            status?: string;
            workerId?: string;
            /** The conversation a chat session belongs to, which is how a turn finds its session. */
            channelKey?: string;
            source?: string;
            personaId?: string;
            /** The last `updatedAt` of the page the reader already has. */
            before?: string;
            limit?: number;
        },
        _$meta: IMeta,
    ): Promise<{sessions: Array<Record<string, unknown>>; next?: string}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const limit = Math.min(Math.max(Number(params?.limit) || 50, 1), 500);
        // One row per session with the summary beside it: a session whose feed never reached a
        // broker has no metric row yet, and a left join still lists it.
        const query = qb('agent_session as s')
            .leftJoin('agent_sessionMetric as m', 'm.sessionId', 's.sessionId')
            .select(
                's.sessionId',
                's.ticketId',
                's.ticketTitle',
                's.source',
                's.status',
                's.personaId',
                's.workerId',
                's.modelName',
                's.kafkaPartition',
                // Where the session works, which is what lets a page show a tool's path the way the
                // runtime sees it rather than as an absolute one (`@@T-820`).
                's.workspacePath',
                's.turnCount',
                's.lastActivityAt',
                's.updatedAt',
                'm.turnCount as metricTurnCount',
                'm.messageTokens as metricMessageTokens',
                'm.toolCount as metricToolCount',
                'm.lastEventAt as metricLastEventAt',
            )
            // The id breaks the tie, so the order is total and a page boundary that lands inside
            // one second still has one row on either side of it.
            .orderBy([
                {column: 's.updatedAt', order: 'desc'},
                {column: 's.sessionId', order: 'desc'},
            ]);
        if (params?.ticketId) query.where('s.ticketId', params.ticketId);
        if (params?.status) query.where('s.status', params.status);
        if (params?.workerId) query.where('s.workerId', params.workerId);
        if (params?.channelKey) query.where('s.channelKey', params.channelKey);
        if (params?.source) query.where('s.source', params.source);
        if (params?.personaId) query.where('s.personaId', params.personaId);
        if (params?.before) {
            const cursor = parseCursor(params.before);
            query.where(function (this: IWhereGroup) {
                this.where('s.updatedAt', '<', cursor.at);
                if (cursor.sessionId === undefined) return;
                this.orWhere(function (this: IWhereGroup) {
                    this.where('s.updatedAt', cursor.at).where(
                        's.sessionId',
                        '<',
                        uuidBuf(cursor.sessionId!),
                    );
                });
            });
        }
        // One more than asked for: whether it exists is what says there is a next page.
        query.limit(limit + 1);
        const rows = (await query) as Array<Record<string, unknown>>;
        const page = rows.slice(0, limit);
        const sessions: Array<Record<string, unknown>> = page.map(row => {
            const {
                metricTurnCount,
                metricMessageTokens,
                metricToolCount,
                metricLastEventAt,
                ...session
            } = row;
            return {
                ...(rowOut(session) as Record<string, unknown>),
                metric: {
                    turnCount: Number(metricTurnCount ?? 0),
                    messageTokens: Number(metricMessageTokens ?? 0),
                    toolCount: Number(metricToolCount ?? 0),
                    lastEventAt: metricLastEventAt ?? null,
                },
            };
        });
        // The cursor is built from the row as it was *written out*: `s.sessionId` arrives as a
        // `BINARY(16)`, and turning that buffer into a string names a session no query can find.
        const last = sessions[sessions.length - 1];
        return {
            sessions,
            ...(rows.length > limit &&
                last?.updatedAt !== undefined && {
                    next: `${new Date(last.updatedAt as string).toISOString()}|${String(
                        last.sessionId,
                    )}`,
                }),
        };
    },
}));
