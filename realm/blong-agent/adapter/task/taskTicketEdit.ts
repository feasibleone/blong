import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `task.ticket.edit` — change fields the pool owns on behalf of the worker.
 *
 * A heartbeat is this method with a new lease: the worker renews what it holds rather than taking the
 * ticket again (`@@D-707`).
 */
export default handler(({lib: {taskPoolEdit}}) => ({
    async taskTicketEdit(
        params: {ticketId: string; patch: Record<string, unknown>},
        _$meta: IMeta,
    ): Promise<{ticket?: unknown}> {
        const ticket = taskPoolEdit(params.ticketId, params.patch as never);
        return ticket ? {ticket} : {};
    },
}));
