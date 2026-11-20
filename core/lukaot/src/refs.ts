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

/**
 * URI scheme used by every reference kind.
 *
 * Renamed to `lukaot` with the editor extension and `blong-dev log` in `T-716`: the scheme is one
 * token shared by three consumers, so it moves in the change that moves all three rather than
 * leaving a ported test asserting a scheme nothing else speaks yet.
 */
export const REF_SCHEME = 'lukaot';

/**
 * The path segment each kind is spelled as.
 *
 * One letter, because the rendered line is the surface a reader pays for: the kind
 * used to be a label in front of the URI (`r=lukaot://record/<id>`), which is a
 * byte-for-byte duplicate of a segment that can carry the same information — and
 * the label is what stopped an editor from recognising the URI as a link and
 * making it clickable. A rendered reference is now the URI and nothing else.
 *
 * The letters are the ones the labels used or named: `r` record, `t` template, `x`
 * trace, `p` payload. They are part of the link format the editor extension and
 * `blong-dev log` match on, so they are declared here, once, rather than spelled in
 * each of them.
 */
const KIND_SEGMENT: Readonly<Record<RefKind, string>> = {
    record: 'r',
    template: 't',
    trace: 'x',
    payload: 'p',
};

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
    return [...new TextEncoder().encode(char)]
        .map(byte => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
        .join('');
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
 * same rule: it renders an id without a URI, but a `refs.parent` read back from a
 * store is untrusted text, and a raw id of
 * `x] [lukaot://r/ATTACKER` would close the reference group and forge a second
 * reference exactly as it would in a URI.
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
    return `${REF_SCHEME}://${KIND_SEGMENT[kind]}/${encodeSegment(id)}`;
}

/**
 * The inverse table, derived from {@link KIND_SEGMENT} so the two cannot drift.
 *
 * A reference is written by one package and read by three — the editor, `blong-dev log` and
 * `lukaot inspect` — and the reader must agree with the writer on the segment letter. Deriving the
 * reverse here is what makes that agreement structural rather than a convention each reader
 * repeats.
 */
const SEGMENT_KIND: Readonly<Record<string, RefKind>> = Object.fromEntries(
    Object.entries(KIND_SEGMENT).map(([kind, segment]) => [segment, kind as RefKind]),
);

/** One reference found in text, with the id it names. */
export interface IParsedReference {
    kind: RefKind;
    id: string;
    /** The URI exactly as it was found, so a caller can report what it resolved. */
    uri: string;
}

/**
 * The first reference a line carries, or `undefined` when it carries none.
 *
 * What a reader has is a *line* — the one a terminal printed — so the reference is found in the
 * text rather than assumed to be the whole of it. The pattern is anchored on the scheme and the
 * single-letter segment, which is why no id can forge a second reference: an id's own separators
 * are percent-encoded by {@link encodeSegment}.
 */
export function parseReference(text: string): IParsedReference | undefined {
    const pattern = new RegExp(`\\b${REF_SCHEME}://([a-z])/([^\\s\\]]+)`);
    const match = pattern.exec(text);
    if (match === null) return undefined;
    const kind = SEGMENT_KIND[match[1] as string];
    if (kind === undefined) return undefined;
    let id: string;
    try {
        id = decodeURIComponent(match[2] as string);
    } catch {
        // A malformed escape is not a reference this build wrote; reporting it as text is better
        // than throwing out of a reader that was handed a log line.
        return undefined;
    }
    return {kind, id, uri: match[0] as string};
}

/**
 * Wrap a reference in an OSC 8 hyperlink. Terminals that do not support OSC 8
 * render the label only, so the plain text stays readable.
 */
export function hyperlink(kind: RefKind, id: string, label?: string): string {
    const uri = refUri(kind, id);
    return `\u001B]8;;${uri}\u001B\\${label ?? uri}\u001B]8;;\u001B\\`;
}
