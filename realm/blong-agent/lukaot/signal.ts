import {declare} from '@feasibleone/lukaot';

/**
 * What the `agent` realm reports while it works (`@@T-717`).
 *
 * These two were the realm's only level calls, and both were the shape the conversion exists to remove:
 * a payload handed to `warn` with its sentence composed at the call site. A declared identifier names
 * *what happened*, so an operator can raise or silence one of them without touching the code — a wake that
 * could not be published is not the same event as a suspended session that had no checkpoint, even though
 * both used to be one `warn` line.
 */
export default declare({
    log: {
        /** A wake for another host's session was not published; that host's tick will pick it up. */
        agentAnswerWakeUnpublished: {
            level: 'warn',
            message: 'a wake for session {sessionId} was not published: {error}',
        },
        /** A suspended session carried no checkpoint, so the tick skipped it. */
        agentSessionUnrecoverable: {
            level: 'warn',
            message: 'a suspended session had no checkpoint to resume from, skipped: {sessionId}',
        },
        /** A ticket was claimed and its session opened. */
        agentTicketClaimed: {
            level: 'info',
            message: 'worker {workerId} claimed ticket {ticketId}',
        },
        /** A session was resumed from its checkpoint. */
        agentSessionResumed: {
            level: 'info',
            message: 'session {sessionId} resumed from its checkpoint',
        },
    },
});
