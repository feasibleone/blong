// cspell:ignore ENOENT EISDIR
/**
 * JSON snapshot persistence (PRD R4: the registry is the durable artifact).
 *
 * Deliberately a file, not a database: the spec requires that a template
 * survives a restart, and an infrastructure dependency would make the
 * acceptance suite depend on services that have nothing to do with the change.
 * The snapshot covers the **template registry** and nothing else — this
 * service's digest, causal lineage, incident store and flow-drift history are
 * process-lifetime surfaces by design, and `ServiceOptions.persistTo` is
 * documented in `app.ts` as meaning exactly the registry (see
 * `.github/memory/decision.md`, Task 12).
 *
 * The write is atomic (a temp file, then `rename`) so a reader never sees half
 * a snapshot, and the temp name is unique per call so two concurrent saves of
 * one path cannot collide. Uniqueness is not ordering, though: left to the
 * filesystem, two overlapping saves would be settled by whichever `rename`
 * finished last, which may be the **older** snapshot. Saves of one path are
 * therefore serialised on a promise chain, so a snapshot written from a later
 * read of the registry can never be overwritten by one written from an earlier
 * read.
 *
 * A **missing** file is an empty registry — a service that has never been run
 * has no snapshot, and that is not an error. Every other read failure is
 * rethrown: treating a permission error or a directory as "no templates" would
 * start the service empty and then overwrite the real snapshot on the next
 * save. A file that exists but is not this snapshot is likewise reported rather
 * than read as empty, for the same reason: a deltas-and-counts surface must not
 * silently answer "nothing here" when what it means is "I could not read it".
 * That includes JSON that parses but is not a registry: not an object, an
 * array, `entries` that is not an array, or an array whose elements are not
 * entries. The last case matters because `registry.replaceAll` keys on
 * `entry.ref`, so a `null` or a `ref`-less object would silently become one
 * entry under the key `undefined`.
 */

import {readFile, rename, writeFile} from 'node:fs/promises';
import type {TemplateEntry} from './registry.ts';

/** Bumped if the on-disk shape ever changes, so a reader can tell formats apart. */
const SNAPSHOT_VERSION = 1;

/** Distinguishes concurrent saves' temp files within one process. */
let counter = 0;

/**
 * The per-path save chain. Each save appends its publish to the chain for its
 * own path, so renames complete in the order the snapshots were taken rather
 * than the order the filesystem happened to finish them. Keyed by path, so two
 * different snapshots written in one process do not block each other. The
 * stored value is always settlement-tolerant (see `saveSnapshot`), so one
 * rejected save cannot poison the saves queued behind it.
 */
const queues = new Map<string, Promise<void>>();

/** A save that is not this snapshot's shape, named by what was wrong. */
function malformed(path: string, what: string): Error {
    return new Error(`loadSnapshot: ${what} (${path})`);
}

/** Write the registry snapshot atomically (unique temp file + rename). */
export async function saveSnapshot(path: string, entries: TemplateEntry[]): Promise<void> {
    // Serialise *now*, before it is this save's turn: the caller handed over the
    // registry's live entries, and the bytes must freeze at the moment the save
    // was asked for, not at the moment the earlier save ahead of it finished.
    const snapshot = JSON.stringify({version: SNAPSHOT_VERSION, entries}, null, 2);
    const previous = queues.get(path) ?? Promise.resolve();
    const write = previous.then(() => publish(path, snapshot));
    // Remember the settlement-tolerant form, not `write` itself: a rejected save
    // must reject *its own* caller and then let the queue continue, not reject
    // every save behind it.
    queues.set(path, write.then(() => undefined, () => undefined));
    await write;
}

/** Write `snapshot` to a unique temp file and publish it with one atomic rename. */
async function publish(path: string, snapshot: string): Promise<void> {
    const temporary = `${path}.${process.pid}.${counter++}.tmp`;
    await writeFile(temporary, snapshot);
    await rename(temporary, path);
}

/**
 * Read a snapshot. A missing file yields an empty registry.
 *
 * Every read parses the file afresh, so what a caller is handed is its own:
 * there is no cache behind this function, and mutating a returned entry cannot
 * reach the next read — or the registry a later read feeds.
 */
export async function loadSnapshot(path: string): Promise<TemplateEntry[]> {
    let raw: string;
    try {
        raw = await readFile(path, 'utf8');
    } catch (error) {
        // Only "there is no such file" is an empty registry; anything else is
        // reported, because an empty answer here would be saved back over the
        // snapshot on the next write.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw malformed(path, 'snapshot is not valid JSON');
    }
    if (parsed === null) {
        throw malformed(path, 'snapshot is not a registry snapshot');
    }
    if (typeof parsed !== 'object') {
        throw malformed(path, 'snapshot is not a registry snapshot');
    }
    if (Array.isArray(parsed)) {
        throw malformed(path, 'snapshot is not a registry snapshot');
    }
    const {entries} = parsed as {entries?: unknown};
    if (entries === undefined) {
        return [];
    }
    if (!Array.isArray(entries)) {
        throw malformed(path, 'snapshot entries is not an array');
    }
    // Every element must at least be keyed by a string reference: the registry
    // is a `Map` keyed by `entry.ref`, so `{"entries":[null]}` would otherwise
    // install one entry under the key `undefined` and answer a template read
    // with it. The rest of an entry's shape is the writer's contract; the key
    // is what makes the file a registry at all.
    for (const entry of entries) {
        if (typeof (entry as {ref?: unknown} | null)?.ref !== 'string') {
            throw malformed(path, 'snapshot contains an entry with no string reference');
        }
    }
    return entries as TemplateEntry[];
}
