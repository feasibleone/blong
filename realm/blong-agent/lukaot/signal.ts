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
        /**
         * A session says which of the two engines drives it, and why.
         *
         * The mode is a decision, not a setting: `native` hands the loop to the engine and `step`
         * drives it here, and a session that ran the wrong one is only explainable from a record that
         * names the choice (`@@D-933`).
         */
        agentSessionEngineChosen: {
            // `info`, not `debug`: one line per session, and the mode is the first thing a person
            // asking "why did it do that" needs. A decision whose record is filtered out is a
            // rationale nobody reads.
            level: 'info',
            message: 'session {sessionId} runs {mode}: {reason}',
        },
        /**
         * A tick looked for work and took none.
         *
         * A worker that claims nothing looks the same from the outside whether the pool is empty or its
         * own configuration is not finished, so the one case that *is* a mistake says so at `warn` and
         * the rest stay silent.
         */
        agentWorkerIdle: {
            level: 'warn',
            message: 'worker {workerId} did not claim: {reason}',
        },
    },
    decision: {
        /**
         * Which engine loop a session runs.
         *
         * The arms are the two modes the session can be opened in, and the record says which was taken
         * and what the session was opened with — a run that behaved unexpectedly is answered by reading
         * the rationale rather than by reproducing it.
         */
        agentEngineMode: {
            message: 'which loop drives the session',
            branch: {
                native: 'the engine owns its own loop and reports what it did',
                step: 'the realm drives one model turn, its calls and a checkpoint at a time',
            },
        },
        /**
         * Whether a tick takes a ticket from the pool.
         *
         * A tick with no engine account cannot run what it took, so it declines: taking a ticket and
         * then having nothing to run it with turns a configuration mistake into a lease the pool has to
         * wait out (`@@D-704`).
         */
        agentClaim: {
            message: 'whether this tick claims a ticket',
            branch: {
                claim: 'an engine account is configured, so the pool may be asked for work',
                noAccount: 'nothing could run it, so nothing is taken',
            },
        },
    },
});
