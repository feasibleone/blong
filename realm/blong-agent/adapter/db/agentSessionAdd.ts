import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `agent.session.add` — the row a run is recorded on.
 *
 * It carries the engine instance *and* the account inside it, because the same alias may exist in two
 * instances and a resume that picked the wrong one would reach the wrong endpoint (`@@D-712`), and the
 * worker that holds the workspace, because only that host may resume it (`@@D-704`).
 */
export default handler(({lib: {uuidBuf, rowOut}}) => ({
    async agentSessionAdd(
        params: {
            sessionId: string;
            /** Null for a chat session: there is no ticket, and the source says so. */
            ticketId?: string | null;
            ticketTitle?: string;
            /** `ticket` or `chat`; absent is a ticket session, which is what the pool opens. */
            source?: string;
            /** The persona it runs under, when one was resolved. */
            personaId?: string | null;
            /** The conversation it belongs to, in the chat realm's own key. */
            channelKey?: string | null;
            status: string;
            engineAdapter: string;
            engineAccount: string;
            engineMode: string;
            modelName?: string;
            workerId: string;
            /** Null when the persona claims no workspace. */
            workspacePath?: string | null;
            baseCommit?: string;
        },
        _$meta: IMeta,
    ): Promise<{session: Record<string, unknown>}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const now = new Date();
        const row = {
            sessionId: uuidBuf(params.sessionId),
            ticketId: params.ticketId ?? null,
            ticketTitle: params.ticketTitle ?? null,
            source: params.source ?? 'ticket',
            personaId: params.personaId ? uuidBuf(params.personaId) : null,
            channelKey: params.channelKey ?? null,
            status: params.status,
            engineAdapter: params.engineAdapter,
            engineAccount: params.engineAccount,
            engineMode: params.engineMode,
            modelName: params.modelName ?? null,
            engineSessionId: null,
            workerId: params.workerId,
            workspacePath: params.workspacePath ?? null,
            baseCommit: params.baseCommit ?? null,
            turnCount: 0,
            lastActivityAt: now,
            lastEventAt: now,
            createdAt: now,
            updatedAt: now,
        };
        await qb('agent_session').insert(row);
        return {session: rowOut({...row, sessionId: params.sessionId})};
    },
}));
