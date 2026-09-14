/**
 * Cross-reference ids (PRD R19).
 *
 * Ids are minted locally at emit time — no service round trip — so an offline
 * process still produces usable references. Each reference can also be
 * rendered as a terminal hyperlink (OSC 8) so it can be followed with one
 * click.
 */

import {monotonicFactory} from 'ulidx';
import type {RefKind} from './record.ts';

/** URI scheme used by every reference kind. */
export const REF_SCHEME = 'semantic-log';

/**
 * Length of the short template reference cut from the 32-hex fingerprint —
 * long enough to avoid collisions in practice, short enough to read.
 *
 * Defined here, on the emitter side, so that the reference minted by
 * `withIdentity()` and the service registry's key over the same cut cannot
 * drift. The dependency runs one way only: `src/service/*` imports this,
 * never the reverse.
 */
export const REF_LENGTH = 12;

/**
 * Serialised length at or above which an embedded value is rendered as a
 * payload reference instead of inlined (PRD R19/R20: "a reference for any large
 * embedded configuration value").
 *
 * One threshold, stated here and applied once. The logger decides at emit time
 * which values to retain and indexes them on `refs.payloads`; the renderer
 * substitutes exactly the fields that index names, and re-checks this same
 * length. Keeping both sides on one constant is what stops a reference naming a
 * payload that was never retained — a dead link, which is worse than the long
 * line this exists to avoid — and stops it being computed twice, differently.
 *
 * 1 KiB is chosen to be plainly larger than any ordinary field (an id, a status,
 * a duration) and plainly smaller than a configuration document, so the line
 * stays greppable without a per-service tuning knob.
 */
export const PAYLOAD_THRESHOLD = 1024;

/**
 * Monotonic ULID source. Two ids minted in the same millisecond stay ordered,
 * which is what makes the record reference usable for sorting and cursors.
 * Payload references come from the same source: they are the same kind of
 * locally minted identity, and one sequence keeps the two families ordered with
 * respect to each other.
 */
const mintUlid = monotonicFactory();

/** Mint a monotonic record reference without contacting anything. */
export function mintRecordRef(): string {
    return mintUlid();
}

/** Mint a monotonic payload reference without contacting anything (PRD R19). */
export function mintPayloadRef(): string {
    return mintUlid();
}

/**
 * The only characters left verbatim in an id segment (RFC 3986 unreserved).
 * Every ULID character is in this set, so a record reference is unchanged.
 */
const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/** Percent-encode the UTF-8 bytes of one character, upper-case hex. */
function encodeChar(char: string): string {
    return [...new TextEncoder().encode(char)].map(byte => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('');
}

/**
 * Percent-encode an id segment so an id can never alter the structure of the
 * rendered reference (PRD R19).
 *
 * A trace id commonly arrives from an inbound tracing header, so it is
 * untrusted text. Left raw, an id of `x] [r=semantic-log://record/ATTACKER`
 * closes the rendered reference group and forges a second reference that a
 * fixed-pattern extractor picks up as the record's own — a trust-boundary
 * crossing that defeats "extractable by a fixed pattern regardless of message
 * content". Encoding every character outside the unreserved set removes the
 * separators (`/`, `=`, `[`, `]`, space) an id would need to do that. Iterating
 * code points and encoding the UTF-8 bytes is total: a lone surrogate becomes
 * the replacement character's bytes rather than a `URIError`, so this cannot
 * throw out of a logging call either.
 *
 * Exported so the renderer's `p=<parent>` segment (`render.ts`) encodes by the
 * same rule: it renders an id without the `semantic-log://` prefix, but a
 * `refs.parent` read back from a store is untrusted text, and a raw id of
 * `x] [r=semantic-log://record/ATTACKER` would close the reference group and
 * forge a second reference exactly as it would in a URI.
 */
export function encodeSegment(id: string): string {
    let out = '';
    for (const char of id) {
        out += UNRESERVED.test(char) ? char : encodeChar(char);
    }
    return out;
}

/** Build a dereferenceable reference URI. */
export function refUri(kind: RefKind, id: string): string {
    return `${REF_SCHEME}://${kind}/${encodeSegment(id)}`;
}

/**
 * Wrap a reference in an OSC 8 hyperlink. Terminals that do not support OSC 8
 * render the label only, so the plain text stays readable.
 */
export function hyperlink(kind: RefKind, id: string, label?: string): string {
    const uri = refUri(kind, id);
    return `\u001B]8;;${uri}\u001B\\${label ?? uri}\u001B]8;;\u001B\\`;
}
