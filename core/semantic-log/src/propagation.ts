// cspell:ignore traceparent NDEKTSV RRFFQ
/**
 * Identity propagation (PRD R22).
 *
 * Every identity that travels between processes rides **one** header:
 *
 *     x-semantic-trace: trace=tr-1,flow=01ARZ3NDEKTSV4RRFFQ69G5FAV,leg=quote.rates,from=payer,to=hub,seq=1.2
 *
 * One header rather than five, because the fields are one thing — the context of
 * the call being made — and because a single value is what an application can set
 * in one place whatever transport it uses. The shape follows `traceparent`, the
 * W3C precedent for packing a call's identity into one field.
 *
 * ## What counts as an identity
 *
 * A field is present only if the scope was handed one; **nothing is minted here**
 * (PRD R9), so a scope that was given no identity propagates none, and the
 * receiving end mints its own rather than being handed a value the sender never
 * chose. Three rules decide whether a value is usable:
 *
 * - **A repeated key is not a field.** Node joins duplicate header *lines* into one
 *   value, separating them with a comma **and a space**, so a value naming the same
 *   field twice (`trace=a, trace=b`) is what a caller that set the header twice
 *   produces. Each field is therefore trimmed before it is read — the join is what
 *   introduces the space — and the whole value is rejected rather than half-read: a
 *   corrupt identity that still looks like one is worse than a missing one, because
 *   the receiving end would carry it onward.
 * - **A value with no `=` is a bare trace id** — the form this header had before
 *   the leg existed — so an emitter written against the old contract keeps working.
 *   The same shape *with* a comma is not a bare trace: that is the duplicate-line
 *   case above, and it is rejected.
 * - **A field whose content is not lawful is read as absent**, not as a reason to
 *   reject the header: the header is structurally sound, the rest of it is usable,
 *   and a receiver that refused the whole call over one malformed field would let an
 *   unbalanced peer break a request (D3, `docs/decisions.md`). The grammars live in
 *   `src/context.ts` (`isLegId`, `isServiceName`, `isLegSeq`) and are applied where
 *   the value is adopted, in `flow/participant.ts` and `src/service/registry.ts`.
 *
 * Direction of dependency: this module reads the ambient context and touches
 * nothing else — no network, no filesystem — so it is as usable from an adapter as
 * from a fixture (R18).
 */

import {currentContext} from './context.ts';

/** The one header every identity travels in. */
export const TRACE_HEADER = 'x-semantic-trace';

/** Causal trace id (PRD R7). */
export const TRACE_FIELD = 'trace';

/** Flow **execution** id — a caller-minted ULID (PRD R9). */
export const FLOW_FIELD = 'flow';

/** The leg: the method this call reaches its callee with (PRD R22). */
export const LEG_FIELD = 'leg';

/**
 * The unit that declared the leg — the logical unit the call is made by.
 *
 * A field of its own rather than a prefix of the leg id, because the two answer
different questions. The id is what the callee is addressed by, and it is read as a
label: a reader of a diagram wants the method, and repeating the caller in it made
the label longer than the arrow. Which unit made the call is an identity, and it is
carried as one — read by the ledger to place an arrow's source, and by a receiver
that wants to know who called it.
 */
export const FROM_FIELD = 'from';

/** The receiving participant the caller declared for that leg. */
export const TO_FIELD = 'to';

/** The leg's position in the execution: a path of counters, e.g. `1.2`. */
export const SEQ_FIELD = 'seq';

/**
 * The capabilities decided for the execution, as one field of this header.
 *
 * They travel *with* the identity rather than beside it because they are part of
 * the same statement — "this is the execution this call belongs to, and this is
 * what was decided for it" — and because one header is one thing to set, copy and
 * parse wherever a call is made. The value is a dot-separated list of names, with
 * a leading `-` for the ones explicitly switched off:
 *
 *     x-semantic-trace: trace=tr-1,flow=01ARZ3NDEKTSV4RRFFQ69G5FAV,cap=calls.-payloads
 *
 * Dots rather than commas *inside* the field, because the header's own separator
 * is a comma: a list that used it would split into fields, and half of a
 * capability is worse than none — the receiving end would adopt `payloads` as a
 * trace field or reject the identity outright. Capability names are therefore
 * simple words (`[A-Za-z0-9_-]+`), which is what a switch's name should be.
 *
 * Switching one off explicitly matters as much as switching one on: without it, a
 * process that has no decision would fall back to its own configuration and record
 * half of a flow the entry point had decided not to record.
 */
export const CAP_FIELD = 'cap';

/**
 * The separator *inside* the capability field.
 *
 * Never a comma: the header's own separator is a comma, so a list written with one
 * would split into fields (see above). A dot is already the separator inside a leg
 * id and inside a method name, and it is lawful in a header value, so it needs no
 * escaping and reads as what it is.
 */
const CAP_SEPARATOR = '.';

/** The identities bound in a scope, each absent unless it was bound. */
export interface Identities {
    trace?: string;
    flow?: string;
    leg?: string;
    /** The unit that declared the call, where the declaring side stated one. */
    from?: string;
    to?: string;
    seq?: string;
    /** The capabilities decided for the execution, as name → on/off. */
    capabilities?: Record<string, boolean>;
}

/**
 * A capability set as the header's field value: `calls,-payloads`.
 *
 * Sorted, so two processes that decided the same set write the same text — a
 * value that differs only in order is a value that looks changed when it is not.
 */
export function encodeCapabilities(capabilities: Record<string, boolean>): string {
    return Object.keys(capabilities)
        .sort()
        .map(name => (capabilities[name] ? name : `-${name}`))
        .join(CAP_SEPARATOR);
}

/**
 * Read a capability field.
 *
 * Tolerant by design: this value arrives from another process, and a field that
 * cannot be read is a field that was not decided — never a reason to reject the
 * call it arrived with. An empty name, an empty value and a repeated name are
 * dropped for the same reason a malformed identity field is (see above): a
 * corrupt answer that still looks like one is worse than no answer.
 */
export function decodeCapabilities(value: string): Record<string, boolean> | undefined {
    const capabilities: Record<string, boolean> = {};
    let seen = false;
    for (const part of value.split(CAP_SEPARATOR)) {
        const entry = part.trim();
        if (entry.length === 0) continue;
        const off = entry.startsWith('-');
        const name = off ? entry.slice(1).trim() : entry;
        if (name.length === 0 || name in capabilities) continue;
        capabilities[name] = !off;
        seen = true;
    }
    return seen ? capabilities : undefined;
}

/**
 * The same header value with the capability field removed.
 *
 * A trust boundary needs it: a capability decides what a process may cost itself,
 * so a value that arrived from outside the deployment must not be adopted — the
 * entry point strips it and publishes its own decision in its place. The rest of
 * the identity is left exactly as it arrived.
 */
export function withoutCapabilities(value: string | undefined): string {
    if (typeof value !== 'string' || !value.includes(`${CAP_FIELD}=`)) return value ?? '';
    const fields = value
        .split(',')
        .map(field => field.trim())
        .filter(field => field.length > 0 && !field.startsWith(`${CAP_FIELD}=`));
    return fields.join(',');
}

/**
 * The identities bound in this scope, as headers for one outbound call.
 *
 * `extra` is merged last, so a caller adds transport headers (content type,
 * authorization) in the same pass without either set displacing the other.
 */
export function identityHeaders(extra?: Record<string, string>): Record<string, string> {
    const context = currentContext();
    const fields: string[] = [];
    if (context.trace !== undefined) fields.push(`${TRACE_FIELD}=${context.trace}`);
    if (context.flow !== undefined) fields.push(`${FLOW_FIELD}=${context.flow.id}`);
    if (context.leg !== undefined) fields.push(`${LEG_FIELD}=${context.leg}`);
    if (context.legFrom !== undefined) fields.push(`${FROM_FIELD}=${context.legFrom}`);
    if (context.legTo !== undefined) fields.push(`${TO_FIELD}=${context.legTo}`);
    if (context.legSeq !== undefined) fields.push(`${SEQ_FIELD}=${context.legSeq}`);
    const capabilities = encodeCapabilities(context.capabilities ?? {});
    if (capabilities.length > 0) fields.push(`${CAP_FIELD}=${capabilities}`);
    if (fields.length === 0) {
        return {...extra};
    }
    return {[TRACE_HEADER]: fields.join(','), ...extra};
}

/**
 * Read the identities off an inbound header bag.
 *
 * Structural only: the fields are split out and the two rules above are applied,
 * while each field's *content* is left to the code that adopts it — this module
 * knows the wire format, not what a lawful leg id or service name is. Anything
 * unrecognised yields an empty result, so a caller always gets a usable answer.
 */
export function readIdentities(headers: Record<string, unknown>): Identities {
    const raw = headers[TRACE_HEADER];
    if (typeof raw !== 'string' || raw.length === 0) {
        return {};
    }
    if (!raw.includes('=')) {
        return raw.includes(',') ? {} : {trace: raw};
    }
    const identities: Identities = {};
    const seen = new Set<string>();
    for (const part of raw.split(',')) {
        const field = part.trim();
        const at = field.indexOf('=');
        if (at <= 0) {
            return {};
        }
        const key = field.slice(0, at);
        const value = field.slice(at + 1);
        if (value.length === 0 || seen.has(key)) {
            return {};
        }
        seen.add(key);
        switch (key) {
            case TRACE_FIELD:
                identities.trace = value;
                break;
            case FLOW_FIELD:
                identities.flow = value;
                break;
            case LEG_FIELD:
                identities.leg = value;
                break;
            case FROM_FIELD:
                identities.from = value;
                break;
            case TO_FIELD:
                identities.to = value;
                break;
            case SEQ_FIELD:
                identities.seq = value;
                break;
            case CAP_FIELD: {
                const capabilities = decodeCapabilities(value);
                if (capabilities !== undefined) identities.capabilities = capabilities;
                break;
            }
            default:
                // A field this version does not know is ignored rather than fatal, so
                // an emitter from a later version still reaches a receiver from an
                // earlier one with everything that receiver can use.
                break;
        }
    }
    return identities;
}
