/**
 * Capabilities: the per-execution switches, and the level-free record channels
 * they switch.
 *
 * A **capability** answers one question — "is this kind of record produced for
 * this execution?" — and it is deliberately not a level. A level says how loud a
 * message is and filters it per record; a capability decides whether a whole
 * *kind* of record exists for a whole execution, and it is decided once, where
 * the execution begins, because an answer taken per record (or per call) leaves
 * a flow recorded in halves.
 *
 * ## What a capability is not
 *
 * It is not a permission and not a credential. Its subject is the *cost* of
 * observing a running system: some kinds of record are valuable in an incident
 * and unaffordable on every request, and a capability is how a deployment says
 * "not by default, and here is how to ask". What asks — a configuration, a
 * short-lived token, a caller in another process — is the framework's business:
 * this module only holds the answer, carries it with the identity, and reads it
 * back where a record would be produced.
 *
 * ## The channels
 *
 * The switch exists because some records have nowhere to *show* themselves. A
 * call's two ends are the case this module was written for: they are the input of
 * the flow ledger, so they must exist, and they are worthless as stdout — one
 * line per call, repeating what the level log already says about the request.
 * {@link createCallChannel} therefore writes records whose destination is its
 * caller's decision: retained and shipped by default, printed only when asked
 * for.
 *
 * Nothing here knows how a record is shaped. The envelope (`$meta`, `mtid`, the
 * leg naming a method) belongs to whatever runtime has calls to report, and it
 * arrives as the `write` callback — see `@feasibleone/blong-gogo`'s
 * `callTrace.ts` for the one in this repository.
 */

import {capabilityState} from './context.ts';

export {capabilityState, currentCapabilities, enterCapability, withCapability} from './context.ts';
export {
    CAP_FIELD,
    decodeCapabilities,
    encodeCapabilities,
    withoutCapabilities,
} from './propagation.ts';

/** The capability that switches the call channel. */
export const CALLS_CAPABILITY = 'calls';

/**
 * The four phases of one call.
 *
 * A **caller** writes `start`, then `end` or `error`; the **receiver** writes
 * `received` for the leg it was handed. The phases are this package's own
 * vocabulary — it is where legs, their declared target and their position live —
 * and the ledger reads a call out of the pair (phase, leg) alone.
 */
export type CallPhase = 'start' | 'end' | 'error' | 'received';

/** One phase of one call, as the channel is asked to write it. */
export interface CallEvent {
    phase: CallPhase;
    /** The leg the record belongs to: `<caller>.<method>`, as the grammar allows. */
    leg: string;
    /**
     * The line this phase writes about that leg.
     *
     * Built here rather than by the writer, because the phases and their wording are
     * this package's vocabulary — and because a runtime's writer may live on a path
     * its browser bundle shares, where importing anything from this module (which
     * reaches Node's `async_hooks`) is not an option — the trap that cost a browser
     * run twice (F-197). Handing the line over keeps the
     * wording in one place and the writer free of it.
     */
    message: string;
    /** The failure, on the `error` phase, when the caller has one to report. */
    error?: unknown;
    /** Whatever else the writer wants on the record. */
    fields?: Record<string, unknown>;
}

/** How a channel's records reach their destination. */
export type CallWriter = (event: CallEvent) => void;

/**
 * The call channel a writer implements: the same four phases, with the switch
 * asked once per call rather than per record.
 */
export interface CallChannel {
    /** Whether this execution records calls at all. */
    enabled(): boolean;
    start(leg: string, fields?: Record<string, unknown>): void;
    end(leg: string, fields?: Record<string, unknown>): void;
    error(leg: string, error?: unknown, fields?: Record<string, unknown>): void;
    received(leg: string, fields?: Record<string, unknown>): void;
}

/** The line a phase writes about a leg. */
export function callPhaseMessage(phase: CallPhase, leg: string): string {
    const text: Record<CallPhase, string> = {
        start: 'call start',
        end: 'call end',
        error: 'call error',
        received: 'call received',
    };
    return `${text[phase]}: ${leg}`;
}

/**
 * Build the call channel over a writer.
 *
 * The gate is asked before the writer is called, so an execution that decided not
 * to record pays a scope read per call and nothing else: no envelope is built, no
 * line is rendered, no record is retained. `enabled()` is exposed for a caller
 * that would have to assemble its fields first — asking is an optimisation, never
 * a requirement, because every phase checks it too.
 */
export function createCallChannel(write: CallWriter): CallChannel {
    const emit = (event: Omit<CallEvent, 'message'>): void => {
        if (capabilityState(CALLS_CAPABILITY) !== true) return;
        write({...event, message: callPhaseMessage(event.phase, event.leg)});
    };
    return {
        enabled: () => capabilityState(CALLS_CAPABILITY) === true,
        start: (leg, fields) => emit({phase: 'start', leg, ...(fields && {fields})}),
        end: (leg, fields) => emit({phase: 'end', leg, ...(fields && {fields})}),
        error: (leg, error, fields) =>
            emit({
                phase: 'error',
                leg,
                ...(error === undefined ? {} : {error}),
                ...(fields && {fields}),
            }),
        received: (leg, fields) => emit({phase: 'received', leg, ...(fields && {fields})}),
    };
}
