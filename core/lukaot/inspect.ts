/**
 * lukaot — resolve one reference.
 *
 * The CLI surface for reading what a line printed: a `lukaot://` reference resolved compactly, in
 * detail or machine-readably.
 *
 * A reference is the only thing a reader has once the process that wrote the line is gone. The
 * editor follows one with a click and `blong-dev log` fetches one entry by its id, but both are
 * *consumers* of the store: neither can answer "what does this line mean" from a program, which is
 * what a test or an agent needs. This module is that answer — the line in, the record or payload
 * out — and it opens the store the way an inspector must: read-only, so resolving a reference can
 * never be the thing that evicts an entry (`@@T-718`).
 *
 * It is deliberately small: parsing belongs to `refs.ts`, beside the writer, so the two cannot
 * disagree about the format; retention belongs to the cache. What is here is the one step between
 * them.
 */

import {cacheRecordIds, openCache, type RecordCache} from './src/cache.ts';
import type {LogRecord} from './src/record.ts';
import {parseReference, type IParsedReference} from './src/refs.ts';

/** What one reference resolved to. */
export interface IInspection {
    /** The reference as the line carried it, and the kind it names. */
    reference: IParsedReference;
    /** The record, for a `record`, `template` or `trace` reference. */
    record?: LogRecord;
    /** The value, for a `payload` reference. */
    payload?: unknown;
    /** Whether the store still holds it — `false` is a reference that has aged out. */
    resolved: boolean;
}

/** What a reader needs of a store: the two lookups, and nothing that writes. */
export interface IInspectStore {
    get(id: string): Promise<LogRecord | undefined>;
    getPayload(id: string): Promise<unknown | undefined>;
}

/**
 * Resolve one parsed reference against a store.
 *
 * The id-bearing kinds are one lookup: a shape is retained under its own reference and a record
 * under its own id, and both live in the tenant `get` reads. A payload is the other half of the
 * store and is asked separately, because a payload id and a record id are different sequences.
 */
export async function resolveReference(
    store: IInspectStore,
    reference: IParsedReference,
): Promise<IInspection> {
    if (reference.kind === 'payload') {
        const payload = await store.getPayload(reference.id);
        return payload === undefined
            ? {reference, resolved: false}
            : {reference, payload, resolved: true};
    }
    const record = await store.get(reference.id);
    return record === undefined
        ? {reference, resolved: false}
        : {reference, record, resolved: true};
}

/**
 * Resolve the reference a *line* carries, against the store in `dir`.
 *
 * The line is text because that is what a reader has. `undefined` means it carried no reference at
 * all, which is a different answer from a reference that no longer resolves (`resolved: false`) —
 * an inspector that conflated the two would report a moved format as an eviction.
 */
export async function inspectLine(
    dir: string,
    text: string,
    options: {limit?: number} = {},
): Promise<IInspection | undefined> {
    const reference = parseReference(text);
    if (reference === undefined) return undefined;
    const store = await openCache({dir, limit: options.limit ?? 5000, readOnly: true});
    try {
        return await resolveReference(store, reference);
    } finally {
        await store.close();
    }
}

/** Every id a store directory holds, so an inspector can list before it resolves anything. */
export async function inspectStore(dir: string): Promise<string[]> {
    return await cacheRecordIds(dir);
}

export type {RecordCache};
