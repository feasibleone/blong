import * as cacache from 'cacache';
import {createRequire} from 'node:module';
import {pipeline} from 'node:stream/promises';

import type {Readable} from 'node:stream';
import type {IBlobMeta} from '@feasibleone/blong';

import type {IStorageEntry} from '../adapter/storage/storageLib.ts';

/**
 * `cacache`'s index writer, which the published types do not expose.
 *
 * A commit changes the record and not the bytes, and re-writing the content to change a word in its
 * index entry would read and write the whole file for nothing. `insert` writes the entry beside the
 * content it already points at.
 */
const entryIndex = (() => {
    try {
        return createRequire(import.meta.url)('cacache/lib/entry-index.js') as {
            insert: (cache: string, key: string, integrity: unknown, opts: unknown) => Promise<unknown>;
        };
    } catch {
        return null;
    }
})();

/**
 * The `cacache` calls the store makes, kept apart from the handler group.
 *
 * Nothing here knows about a realm, a namespace or configuration: it is a directory and a key. That
 * is what lets the round trip be proven by a plain tap test — a handler needs a loaded suite, and a
 * suite needs the infrastructure a store test should not depend on — while the handlers stay the two
 * lines that turn a namespace into a directory.
 */

/**
 * `cacache.rm.entry` with its third argument, which the published types do not declare.
 *
 * `removeFully` is real: cacache hands the option to `index.delete`, which removes the key's index
 * file instead of appending a tombstone to it. Without it a store keyed by unique ids grows one index
 * file per blob ever written, and every listing reads all of them.
 */
const removeEntryFully = cacache.rm.entry as unknown as (
    cachePath: string,
    key: string,
    opts: {removeFully?: boolean},
) => Promise<unknown>;

/** Write one blob's bytes, with its metadata, under `key`. The body is never buffered. */
export async function cachePut(
    directory: string,
    key: string,
    body: Readable,
    metadata: IBlobMeta,
): Promise<void> {
    const sink = cacache.put.stream(directory, key, {metadata});
    await pipeline(body, sink);
}

/** The index entry for `key`, or `null` — a read of the metadata alone. */
export async function cacheHead(directory: string, key: string): Promise<IStorageEntry | null> {
    return (await cacache.get.info(directory, key)) as IStorageEntry | null;
}

/** The index entry and an opened stream over the content, or `null` when the key is absent. */
export async function cacheGet(
    directory: string,
    key: string,
): Promise<{entry: IStorageEntry; stream: Readable} | null> {
    const entry = await cacheHead(directory, key);
    if (!entry) return null;
    // `cacache` answers a Minipass, which is a stream in every way the caller uses it.
    return {entry, stream: cacache.get.stream(directory, key) as unknown as Readable};
}

/** Every entry the directory holds. */
export async function cacheFind(directory: string): Promise<IStorageEntry[]> {
    const entries = (await cacache.ls(directory)) as Record<string, IStorageEntry>;
    return Object.values(entries);
}

/** Remove one key's index entry, and its content when no other key refers to it. */
export async function cacheRemove(directory: string, key: string): Promise<boolean> {
    if (!(await cacheHead(directory, key))) return false;
    await removeEntryFully(directory, key, {removeFully: true});
    return true;
}

/**
 * Replace one entry's metadata without touching its content.
 *
 * `cacache` has no public "write the index entry" call, so this reaches the module that writes it.
 * The integrity it points at is the one already stored, which is what keeps the content where it is.
 */
export async function cacheMetaPut(
    directory: string,
    key: string,
    metadata: IBlobMeta,
): Promise<boolean> {
    const entry = await cacheHead(directory, key);
    if (!entry || !entryIndex) return false;
    const integrity = (entry as unknown as {integrity?: unknown}).integrity;
    await entryIndex.insert(directory, key, integrity, {size: entry.size, metadata});
    return true;
}
