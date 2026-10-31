import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `task.ticket.release` — finish a ticket, or hand it back.
 *
 * A release from a worker that no longer holds the lease answers nothing rather than applying: the
 * lease is what decides who may finish a ticket (`@@D-707`).
 */
export default handler(({lib: {taskPoolRelease}}) => ({
    async taskTicketRelease(
        params: {ticketId: string; ticketStatus: 'todo' | 'done' | 'failed'; workerId: string},
        _$meta: IMeta,
    ): Promise<{ticket?: unknown}> {
        const ticket = taskPoolRelease(params.ticketId, params.ticketStatus, params.workerId);
        return ticket ? {ticket} : {};
    },
}));
