/**
 * Whether a flow's calls are recorded, and the record a phase produces.
 *
 * The *decision* is no longer made here. It is a capability — a per-execution
 * switch — and semantic-log owns those (`@feasibleone/semantic-log/capability`):
 * the switch lives in its ambient scope, travels with the identity in the `cap`
 * field of `x-semantic-trace`, and is read back where a record would be produced.
 * What this module keeps is everything that is the *framework's* rather than the
 * emitter's:
 *
 * - the configuration the decision falls back to (`log.calls.*`), and the entry
 *   patterns a high-throughput flow is opted out by;
 * - the envelope a call record carries — `$meta` with `mtid: 'event'` and a method
 *   naming the leg and the phase, which is what the ledger reads a call out of;
 * - the header a grant token arrives in.
 *
 * The line between the two is worth stating, because it is the line between the
 * packages: semantic-log knows what a call *is* (a leg, its target, its position,
 * its phases), and blong knows how this runtime names things and what its records
 * look like.
 */

import type {CallPhase} from '@feasibleone/blong/types';

/**
 * The capability that switches the call channel.
 *
 * The same name semantic-log's `createCallChannel` asks for — it is defined there
 * too, and `callTrace.test.ts` pins the two together, because a value that had to
 * agree across packages by convention is a value that would stop agreeing
 * silently.
 */
export const CALLS_CAPABILITY = 'calls';

/** The header a short-lived grant token arrives in. Never forwarded. */
export const GRANT_HEADER = 'x-blong-grant';

/**
 * What the framework may be told about call recording.
 *
 * Declared here rather than in the log implementation because both of them honour
 * it — the decision belongs to the framework, not to whichever logger a process
 * happens to run.
 */
export interface CallTraceConfig {
    /** Produce call records at all. On unless this is `false`. */
    enabled?: boolean;
    /**
     * Entry methods whose flows record nothing, matched against the name the flow
     * was minted with (the gateway's method, e.g. `payment.transfer.prepare`).
     *
     * `payment` and `payment.*` both match the whole namespace; an exact name
     * matches only that entry. The point is the high-throughput flows: recording
     * them costs a record per call, and the picture they would draw is the one a
     * reader already has.
     */
    off?: string[];
    /**
     * Print call records to stdout. Off unless asked for: the records are retained
     * and sent to the cluster either way, and a person watching a terminal is
     * reading the level log, not the call ledger.
     */
    stdout?: boolean;
}

let config: CallTraceConfig = {};

/** Install the configuration. Called by whichever log implementation loaded. */
export function configureCallTrace(next: CallTraceConfig | undefined): void {
    if (next === undefined) {
        config = {};
        return;
    }
    // `off` normalised to a list, because the CLI is one of the two ways this is
    // configured: `--log.calls.off=payment` arrives as a string and
    // `--log.calls.off=payment --log.calls.off=ledger` as an array, and a
    // configuration that only worked when it was repeated twice would be a trap.
    const off = next.off as string | string[] | undefined;
    config = {
        ...next,
        ...(off === undefined ? {} : {off: Array.isArray(off) ? off : [off]}),
    };
}

/** The configuration in force, for a caller that has to explain it. */
export function callTraceConfig(): CallTraceConfig {
    return config;
}

/** Does `pattern` name this entry method? */
function matches(pattern: string, entry: string): boolean {
    if (pattern.length === 0) return false;
    if (pattern === entry) return true;
    // `payment` and `payment.*` mean the same thing — the whole namespace — and a
    // bare name is what a configuration usually writes; the glob form exists so a
    // pattern can end in `*` where that reads better.
    const prefix = pattern.endsWith('.*') ? pattern.slice(0, -2) : pattern;
    return entry === prefix || entry.startsWith(`${prefix}.`);
}

/**
 * What the configuration says about an entry, when nothing else has decided.
 *
 * Only the configuration half of the decision: a capability already published for
 * the flow settles the question before this is reached, and `semanticContext.ts`
 * is where the two are put in order.
 */
export function callsPermitted(entry: string): boolean {
    if (config.enabled === false) {
        return false;
    }
    return !(config.off ?? []).some(pattern => matches(pattern, entry));
}

/**
 * The envelope a call record carries.
 *
 * What it was when these records were written through the level API — `$meta` with
 * `mtid: 'event'` and a method naming the leg and the phase — so nothing downstream
 * of the channel had to learn a new format, and the ledger still reads a call out
 * of the same two fields. The line beside it belongs to semantic-log, which hands
 * it to the writer on the event; nothing here names a phase in prose.
 */
export function callRecord(leg: string, phase: CallPhase): Record<string, unknown> {
    return {$meta: {mtid: 'event', method: `${leg}.${phase}`}};
}
