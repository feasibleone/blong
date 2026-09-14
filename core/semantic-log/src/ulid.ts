/**
 * ULID validation (PRD R9, amended 2026-09-13).
 *
 * A flow identity is a ULID the caller minted for **one execution** of a flow:
 * 26 characters of Crockford base32, which is uppercase base32 with `I`, `L`,
 * `O` and `U` removed. The validator lives here and nowhere else, so the two
 * callers that care can never disagree about what a ULID is:
 *
 * - `context.ts` **throws** for a caller who supplies something else
 *   (`withFlow`), because that is the local programmer's error (D3).
 * - `service/ingest.ts` **counts** a step whose identity is not a ULID as an
 *   unknown execution, because it arrived over the wire and an unbalanced peer
 *   must not be able to break ingestion (D3).
 *
 * The package *produces* ULIDs in two places — `mintRecordRef()` and
 * `mintPayloadRef()` in `refs.ts`, backed by `ulidx`'s monotonic factory, and the
 * entry participant's `flowFrom()` in `flow/participant.ts`, which mints the
 * identity of a flow execution — and this module is the only place that *checks*
 * one. `ulidx` is already a dependency; nothing here adds another.
 */

/**
 * 26 characters of Crockford base32: no `I`, `L`, `O` or `U`. The ranges are written
 * split (`HJ-KM-NP-TV`) rather than as one run so the character class never reads as an
 * unknown word to the spell checker that runs over this package.
 */
const ULID = /^[0-9A-HJ-KM-NP-TV-Z]{26}$/;

/** Is `value` a ULID? */
export function isUlid(value: unknown): boolean {
    return typeof value === 'string' && ULID.test(value);
}

/**
 * Assert that `value` is a ULID, naming the offending value in the failure.
 * `what` says which identity was expected, so a caller reads "flow id must be a
 * ULID, got …" rather than a bare regex complaint.
 */
export function assertUlid(value: unknown, what: string): asserts value is string {
    if (!isUlid(value)) {
        throw new TypeError(`${what} must be a ULID, got ${JSON.stringify(value)}`);
    }
}
