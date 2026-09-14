/**
 * Redaction and path censorship (PRD R17, R18; parity row "Redaction and path
 * censorship", §5.1).
 *
 * The row's verdict is *Kept, extended*, and the extension is the reason this
 * module exists at record construction rather than inside `render.ts`: the
 * withheld value must be absent from the ring buffer and the retained store,
 * not only from output. A renderer-side redaction would leave the secret in the
 * record the cache holds and the CLI reads back. Every record is therefore
 * redacted before it reaches any sink — writer, buffer, cache or renderer — so
 * a withheld path is indistinguishable from an absent one in every mode.
 *
 * Patterns are dotted paths over the record tree: a segment matches literally,
 * `*` matches exactly one segment, and `**` matches the remainder of the path
 * (so `req.headers.*` covers every header and `fields.nested.**` withholds the
 * whole subtree). The value at a matched path is replaced by `[redacted]`,
 * which reveals neither the original nor its length, shape or type.
 *
 * Redaction runs before identity minting: `withIdentity` derives `template`,
 * `fingerprint` and `refs.template` from the message and error message, and a
 * hash of a withheld value is itself a leak (offline dictionary attacks,
 * cross-record correlation). The caller therefore derives the identity family
 * from *this* function's result, never from the record as it arrived.
 *
 * Two limits are deliberate and worth stating. A pattern that matches nothing
 * redacts nothing and reports nothing: there is no signal that a configured
 * path was never present, so a typo'd or stale pattern fails silently. And the
 * record's own identity is structural rather than payload: naming `id` or
 * `refs` leaves them intact (see `STRUCTURAL_ROOT_KEYS`), because redacting the
 * slot the logger mints into would destroy the reference every consumer needs.
 * Withholding the caller's identifying *values* — a token, a header, a message
 * that embeds one — is what redacts identity.
 */

import type {ErrorDetail, LogRecord} from './record.ts';

/** The placeholder every withheld value is replaced by. */
const REDACTED = '[redacted]';

/** Marker for a self-referencing value, matching `renderJson`'s marker. */
const CIRCULAR = '[Circular]';

/**
 * The record-root slots that are structural rather than caller payload, and so
 * are left intact by any pattern that names them.
 *
 * `refs` must stay a container: `withIdentity` and the logger both spread it,
 * and spreading a string scatters its characters into index keys, so a pattern
 * that matched the whole container (`refs`, `*`, `**`) used to turn a
 * well-formed `{record, template}` into `{"0":"[","1":"r",…}`.
 *
 * `id` must keep the value the logger minted: the logger restores
 * `refs.record` from it, so a pattern that replaced it (`id`, `**`) made every
 * record share `semantic-log://record/[redacted]`, the cache key every record
 * to one file, and the first prune delete it.
 *
 * Naming either slot is therefore a no-op rather than a way to redact identity.
 * The identity is structural; the values that identify the caller are redacted
 * where the caller carries them.
 */
const STRUCTURAL_ROOT_KEYS: ReadonlySet<string> = new Set(['refs', 'id']);

/** Match a concrete path against a dotted pattern with `*` and `**` segments. */
export function matchesPath(path: string, pattern: string): boolean {
    const actual = path.split('.');
    const expected = pattern.split('.');
    for (let i = 0; i < expected.length; i++) {
        const segment = expected[i];
        if (segment === '**') {
            return true;
        }
        if (segment === '*') {
            continue;
        }
        if (segment !== actual[i]) {
            return false;
        }
    }
    return expected.length === actual.length;
}

/** True for the objects the walk may descend into: a plain object or a null-prototype record. */
function isPlainObject(value: object): boolean {
    const proto = Object.getPrototypeOf(value) as object | null;
    return proto === Object.prototype || proto === null;
}

function matchesAny(path: string, patterns: readonly string[]): boolean {
    return patterns.some(pattern => matchesPath(path, pattern));
}

/** Append a segment to the path walked so far; the root has no prefix. */
function childPath(prefix: string, segment: string): string {
    return prefix ? `${prefix}.${segment}` : segment;
}

/**
 * Withhold an error's message while keeping its stack frames.
 *
 * An error's stack embeds `Type: message` verbatim, so replacing `err.message`
 * alone would leave the text in `err.stack` — and, because a record's identity
 * is derived from what is retained, in `template` and the fingerprint too. The
 * frames below the first line carry the debugging value and no secret, so only
 * the message text is removed from them.
 */
function withholdErrorMessage(err: ErrorDetail): ErrorDetail {
    const out: ErrorDetail = {...err, message: REDACTED};
    if (typeof err.stack === 'string' && err.message) {
        out.stack = err.stack.split(err.message).join(REDACTED);
    }
    return out;
}

/**
 * Copy `value`, replacing the value at every path matched by `patterns`.
 *
 * Only plain objects and arrays are descended into. A `Date`, `Map`, `RegExp`,
 * `Buffer` or other host object has no addressable children, so passing it
 * through untouched is both lossless and safe; copying it as a plain object
 * would silently turn it into `{}` (or an index map, for a `Buffer`) even when
 * no pattern matched.
 *
 * `ancestors` holds the objects currently being copied, so a value that
 * contains itself terminates instead of recursing forever. It is a stack, not a
 * set of everything seen: a value shared by two sibling keys is copied once per
 * path, because a redaction pattern can match one path and not the other, and
 * reusing the first copy would carry the withheld value into the second.
 */
function walk(value: unknown, prefix: string, paths: readonly string[], ancestors: Set<object>): unknown {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (!Array.isArray(value) && !isPlainObject(value)) {
        return value;
    }
    if (ancestors.has(value)) {
        return CIRCULAR;
    }
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            return value.map((item, index) => {
                const path = childPath(prefix, String(index));
                return matchesAny(path, paths) ? REDACTED : walk(item, path, paths, ancestors);
            });
        }
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            const path = childPath(prefix, key);
            // A structural root slot is never replaced by the scalar
            // placeholder: see `STRUCTURAL_ROOT_KEYS`.
            const structural = prefix === '' && STRUCTURAL_ROOT_KEYS.has(key);
            out[key] = matchesAny(path, paths) && !structural ? REDACTED : walk(item, path, paths, ancestors);
        }
        return out;
    } finally {
        ancestors.delete(value);
    }
}

/**
 * Return a redacted copy of `record`; the input is never mutated.
 *
 * The record this receives is retained (a ring buffer, an on-disk cache) and
 * handed to writers, so mutating it in place would corrupt the retained copy as
 * well as surprising the caller that still owns the object it passed in. With
 * no paths configured the record is returned unchanged, so a logger that
 * redacts nothing does no work at all.
 *
 * Identity is deliberately *not* computed here: the caller derives it from the
 * returned record (see `logger.ts`), so `template`, `fingerprint` and
 * `refs.template` are hashes of what is retained rather than of the withheld
 * value — a hash of a secret is itself a leak.
 */
export function redactRecord(record: LogRecord, paths: readonly string[]): LogRecord {
    if (paths.length === 0) {
        return record;
    }
    const withholdsError = matchesAny('err', paths);
    const withholdsErrorMessage = withholdsError || matchesAny('err.message', paths);
    const source: LogRecord =
        record.err && withholdsErrorMessage ? {...record, err: withholdErrorMessage(record.err)} : record;

    if (withholdsError && source.err) {
        // `err` matched whole. Collapsing it to the placeholder would discard
        // the frames, so the sanitized detail is kept instead: the message is
        // withheld, but the record still says where the failure happened. The
        // generic pass runs without `err` so it cannot overwrite that detail.
        const {err, ...rest} = source;
        const out = walk(rest, '', paths, new Set<object>()) as LogRecord;
        out.err = err; // already sanitized above: matching `err` implies matching `err.message`
        return out;
    }
    return walk(source, '', paths, new Set<object>()) as LogRecord;
}

/** A bare record, so `redactRecord` can walk a detached bag in a given position. */
function emptyRecord(): LogRecord {
    return {id: '', time: 0, level: 0, levelName: 'info', msg: '', service: '', refs: {record: ''}};
}

/**
 * Replace `Error` values in a withheld bag with the structured detail the
 * record's own `err` slot carries.
 *
 * `JSON.stringify` turns an `Error` into `{}`: `message` and `stack` are own but
 * non-enumerable, so a withheld `{err}` escalated to `"err":{}` — no message,
 * no frames, nothing R10 exists to surface. Normalising here, before redaction,
 * is what lets a configured `err.message` pattern still reach the value and what
 * makes the escalation payload readable in both output modes.
 */
function normaliseErrors(fields: Record<string, unknown>): Record<string, unknown> {
    const entries = Object.entries(fields);
    if (!entries.some(([, value]) => value instanceof Error)) {
        return fields;
    }
    return Object.fromEntries(
        entries.map(([key, value]) => [
            key,
            value instanceof Error ? {type: value.name, message: value.message, stack: value.stack} : value,
        ]),
    );
}

/**
 * Redact a withheld field bag before it is retained (PRD R10).
 *
 * Task 8 puts redaction at record construction precisely so a withheld value is
 * absent from *everything* retained — the ring buffer included — and not only
 * from what is printed. Buffering raw fields would reopen that hole: the secret
 * would sit in memory in plaintext until a later escalation happened to redact
 * it on the way out, and the retained store (Task 10) would hold it in between.
 * Applying the same patterns here, before the value is retained, closes the gap
 * by construction — the buffer holds what the record would have held.
 *
 * The bag occupies two positions in the record tree, so it is redacted in both.
 * A caller configures one pattern set for the whole logger, and a withheld
 * `err`/`req`/`res` must be redacted by the same patterns that redact the
 * record's own slot:
 *
 * 1. *Presentation position.* Once escalated the bag is mounted at
 *    `record.fields.withheld[].fields`, so a pattern such as `fields.password`
 *    redacts a withheld `{password}` exactly as it redacts a logged one.
 * 2. *Root position.* The bag's own keys occupy the record root — a withheld
 *    `{err}` or `{req}` is the same slot the record's own `err`/`req` sits in.
 *    Without this pass `err.message` could not reach `withhold({err})` at all,
 *    and `req.headers.authorization` could not reach `withhold({req})`; the
 *    `err` handling below is also what removes the message embedded in an
 *    error's stack, keeping the `at …` frames.
 *
 * Emit-time redaction is *not* a fallback for the bag. By then it sits at
 * `fields.withheld.<i>.fields.<name>`, which a `fields.<name>` pattern does not
 * match (`fields.password` addresses `fields.password`, not that nested path).
 * This pass is therefore the only thing protecting withheld detail, and it runs
 * before the value is retained.
 */
export function redactWithheldBag(fields: Record<string, unknown>, paths: readonly string[]): Record<string, unknown> {
    // Normalisation runs even with no patterns configured: withholding is how a
    // failure detail is kept, and an un-normalised `Error` reaches the record as
    // `{}`. See `normaliseErrors`.
    const normalised = normaliseErrors(fields);
    if (paths.length === 0) {
        return normalised;
    }
    const presentation = redactRecord({...emptyRecord(), fields: normalised}, paths).fields;
    if (presentation === undefined || typeof presentation !== 'object') {
        // A pattern matched the bag itself (`fields`, `**`), so no nested detail
        // survives to be walked at the root; withhold each key in place so the
        // caller still sees the bag's shape.
        return Object.fromEntries(Object.keys(normalised).map(key => [key, REDACTED]));
    }
    const atRoot = redactRecord({...emptyRecord(), ...presentation}, paths) as unknown as Record<string, unknown>;
    // The keys the caller withheld are the bag's contract; the shell's own keys
    // (`id`, `msg`, `refs`, …) exist only to let `redactRecord` walk it.
    return Object.fromEntries(Object.keys(normalised).map(key => [key, atRoot[key]]));
}
