/**
 * What retention keeps of a record, and what the rendered line says about it.
 *
 * The store holds **shapes**: one entry per kind of record, keyed by the shape
 * reference, holding the newest occurrence and the number of times the shape
 * happened. That is the denoise — nine hundred identical lines become one entry
 * that says it happened nine hundred times — and it is what keeps a shape every
 * run emits at the bound while the one-off records written after it age out.
 *
 * The consequence is stated rather than hidden: the entry is *not* the log line.
 * A shape's entry stands for every occurrence of it, so a reader who needs the
 * fields of the fourth of nine hundred occurrences cannot have them. Where that
 * matters, a record earns an entry of its own beside its shape, and these two
 * questions are what decide both halves: which shape a record belongs to, and
 * whether folding it away would hide something worth keeping.
 *
 * The two are asked in two places and must not disagree — the store asks them to
 * decide what to write, and the renderer asks them to decide whether the line
 * carries a `r=` link that resolves — which is why they live here, once, rather
 * than in each caller.
 */

import type {LogRecord} from './record.ts';

/**
 * Numeric level at or above which a record is an error (pino's own numbering,
 * restated from `level.ts` so this module depends on no resolver).
 */
const LEVEL_ERROR = 50;

/**
 * The shape a record belongs to: the reference its repeats share, which is also
 * the key the store holds it under.
 *
 * Derived by `withIdentity` from the record's fingerprint, so it is stable across
 * runs and deploys without a round trip, and it masks the values that vary
 * between occurrences — a retry count, a duration, an amount. A record written by
 * something that mints no identity (a transport, an older writer) has none, and
 * is kept under its own id instead.
 */
export function shapeKeyOf(record: LogRecord): string | undefined {
    const shape = record.refs?.template;
    return shape ? shape : undefined;
}

/**
 * Whether folding this record into its shape would hide something worth keeping.
 *
 * Two cases, both of them the denoise costing more than it saves:
 *
 * - **It withheld a payload.** A field too large to inline was replaced by a
 *   reference in the rendered line, and the occurrence that carried it is the one
 *   a reader would come back for. Folding it into its shape would leave the
 *   reference in the line and no occurrence to resolve it against.
 * - **It carries an error.** The shape of a failure repeats — that is what makes
 *   a deployment visible — but the *occurrence* is what is being diagnosed, and it
 *   is the one record where the details matter more than the identity.
 *
 * A record that is neither is represented faithfully by its shape's entry, and
 * says so with its count.
 */
export function denoiseHidesDetails(record: LogRecord): boolean {
    const payloads = record.refs?.payloads;
    if (payloads && Object.keys(payloads).length > 0) {
        return true;
    }
    if (record.err !== undefined) {
        return true;
    }
    return typeof record.level === 'number' && record.level >= LEVEL_ERROR;
}
