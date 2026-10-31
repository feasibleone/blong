import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `agent.ticket.release` — finish a ticket, or hand it back.
 *
 * The release is decided by the session, not by the caller: a worker that no longer holds the session
 * has nothing to finish, and answering that with the pool's silence would leave a caller believing a
 * ticket was closed (`@@D-707`).
 *
 * Handing the ticket back (`todo`) is a failed attempt rather than a fresh one: the session that ran it
 * ended, and the next attempt is a new session beside the same ticket.
 */
export interface IAgentTicketReleaseParams {
    ticketId: string;
    workerId: string;
    /** `done` closes it, `failed` closes it as a failure, `todo` returns it to the pool. */
    ticketStatus?: 'todo' | 'done' | 'failed';
    summary?: string;
}

export default handler(
    ({
        handler: {
            'db/agentSessionFind': agentSessionFind,
            'db/agentSessionEdit': agentSessionEdit,
            taskTicketRelease,
        },
        errors: {errorAgentTicketNotClaimed},
    }) => ({
        async agentTicketRelease(
            params: IAgentTicketReleaseParams,
            $meta: IMeta,
        ): Promise<{released: boolean; sessionId?: string}> {
            const found = (await agentSessionFind(
                {ticketId: params.ticketId, workerId: params.workerId, limit: 1},
                $meta,
            )) as {sessions: Array<Record<string, unknown>>};
            const session = found.sessions?.[0];
            if (!session) throw errorAgentTicketNotClaimed({...params});
            const status = params.ticketStatus ?? 'done';
            const released = (await taskTicketRelease(
                {ticketId: params.ticketId, workerId: params.workerId, ticketStatus: status},
                $meta,
            )) as {ticket?: unknown};
            if (!released?.ticket) throw errorAgentTicketNotClaimed({...params});
            const sessionId = String(session.sessionId);
            await agentSessionEdit(
                {
                    sessionId,
                    patch: {
                        status: status === 'done' ? 'done' : 'failed',
                        lastEventAt: new Date().toISOString(),
                    },
                },
                $meta,
            );
            return {released: true, sessionId};
        },
    }),
);
