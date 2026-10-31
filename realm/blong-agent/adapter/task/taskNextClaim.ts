import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `task.next.claim` — take the next free ticket for a worker.
 *
 * The worker id and the lease are the pool's, not the caller's: a caller says who it is and how long
 * it wants the ticket for, and the pool decides whether anything is free (`@@D-707`).
 */
export default handler(({lib: {taskPoolClaim}}) => ({
    async taskNextClaim(
        params: {workerId: string; leaseMs?: number},
        _$meta: IMeta,
    ): Promise<{ticket?: unknown}> {
        const ticket = taskPoolClaim(params.workerId, params.leaseMs ?? 60_000);
        return ticket ? {ticket} : {};
    },
}));
