import {library} from '@feasibleone/blong';

/**
 * `task.pool` — the ticket pool in a module, until `blong-task` owns one (`@@D-707`).
 *
 * A real pool is a table the other realm leases rows in. This one is an array that survives between
 * calls in one process, which is the whole of what a stand-in has to do, and the three operations are
 * the contract a `blong-task`-backed component answers with the same names — so the loop that claims,
 * releases and edits does not change when the fixture goes.
 *
 * A claim takes a ticket that is free or whose lease has run out, exactly as the database update will:
 * that is what makes two workers polling at once take one ticket between them rather than two.
 */
export interface ITaskTicket {
    ticketId: string;
    ticketTitle: string;
    ticketDescription: string;
    ticketStatus: 'todo' | 'claimed' | 'done' | 'failed';
    workerId?: string;
    leaseExpiresAt?: string;
    platformName?: string;
    accountAlias?: string;
    conversationId?: string;
    workspaceSource?: string;
    attemptCount: number;
}

const seed = (): ITaskTicket[] => [
    {
        ticketId: 'T-1001',
        ticketTitle: 'Fix the flaky login test',
        ticketDescription:
            'The login suite fails about one run in five. Find the race, fix it, and say why in ' +
            'a comment beside the fix.',
        ticketStatus: 'todo',
        platformName: 'slack',
        accountAlias: 'demo',
        conversationId: 'D1',
        attemptCount: 0,
    },
    {
        ticketId: 'T-1002',
        ticketTitle: 'Add a regression test for ticket claims',
        ticketDescription:
            'Two workers polling at once must never take the same ticket. Cover it with a test, ' +
            'and leave the pool alone if it already behaves.',
        ticketStatus: 'todo',
        platformName: 'slack',
        accountAlias: 'demo',
        conversationId: 'D1',
        attemptCount: 0,
    },
    {
        ticketId: 'T-1003',
        ticketTitle: 'Answer a question nobody answers',
        ticketDescription:
            'Ask a human something and wait. Nothing arrives, so the session has to suspend rather ' +
            'than die.',
        ticketStatus: 'todo',
        platformName: 'slack',
        accountAlias: 'demo',
        conversationId: 'D2',
        attemptCount: 0,
    },
    {
        ticketId: 'T-1004',
        ticketTitle: 'Run the whole dialogue on the engine side',
        ticketDescription: 'A native session reports what it did rather than asking for instructions.',
        ticketStatus: 'todo',
        platformName: 'slack',
        accountAlias: 'demo',
        conversationId: 'D3',
        attemptCount: 0,
    },
    {
        ticketId: 'T-1005',
        ticketTitle: 'A ticket whose workspace belongs to another host',
        ticketDescription:
            'The workspace named here is not on this host, so claiming it has to be refused and the ' +
            'ticket handed back rather than edited in a directory nobody deploys.',
        ticketStatus: 'todo',
        platformName: 'slack',
        accountAlias: 'demo',
        conversationId: 'D4',
        workspaceSource: '/srv/elsewhere/T-1005',
        attemptCount: 0,
    },
];

const pool: ITaskTicket[] = seed();

const find = (ticketId: string): ITaskTicket | undefined =>
    pool.find(ticket => ticket.ticketId === ticketId);

const claim = (
    workerId: string,
    leaseMs: number,
    now: number = Date.now(),
): ITaskTicket | undefined => {
    const free = pool.find(
        ticket =>
            ticket.ticketStatus === 'todo' ||
            (ticket.ticketStatus === 'claimed' &&
                ticket.leaseExpiresAt !== undefined &&
                Date.parse(ticket.leaseExpiresAt) <= now),
    );
    if (!free) return undefined;
    free.ticketStatus = 'claimed';
    free.workerId = workerId;
    free.leaseExpiresAt = new Date(now + leaseMs).toISOString();
    free.attemptCount += 1;
    return {...free};
};

const release = (
    ticketId: string,
    ticketStatus: ITaskTicket['ticketStatus'],
    workerId: string,
): ITaskTicket | undefined => {
    const ticket = find(ticketId);
    if (!ticket) return undefined;
    // A release from a worker that no longer holds the lease is refused rather than applied: the
    // point of the lease is that the pool, not the caller, decides who may finish a ticket.
    if (ticket.workerId !== undefined && ticket.workerId !== workerId) return undefined;
    ticket.ticketStatus = ticketStatus;
    ticket.workerId = undefined;
    ticket.leaseExpiresAt = undefined;
    return {...ticket};
};

const edit = (ticketId: string, patch: Partial<ITaskTicket>): ITaskTicket | undefined => {
    const ticket = find(ticketId);
    if (!ticket) return undefined;
    Object.assign(ticket, patch);
    return {...ticket};
};

const reset = (): void => {
    pool.splice(0, pool.length, ...seed());
};

export default library(() => ({
    taskPoolClaim: claim,
    taskPoolRelease: release,
    taskPoolEdit: edit,
    taskPoolReset: reset,
}));
