/**
 * Bounded local on-disk record cache with direct lookup (PRD R21; §5.1 parity
 * row "Dereferenceable reference in the terminal").
 *
 * Every emitted record is retained here, whether or not the cluster service
 * received it, so `semantic-log://record/<id>` still resolves after the emitting
 * process has exited and with no service running (PRD R19/R21). Storage is one
 * JSON file per record, named by the record's own id, plus an append-only
 * `index.jsonl` of `{id,time}` lines used *only* for pruning:
 *
 *     <dir>/index.jsonl           oldest-first `{id,time}` lines, rewritten on prune
 *     <dir>/records/<id>.json     the retained record
 *     <dir>/payloads.jsonl        the payload store's own prune index
 *     <dir>/payloads/<id>.json    the retained payload, stored as its JSON text
 *
 * The second pair of files is the **payload store**: the bounded retention for
 * the inline-payload reference kind (PRD R19/R20). It is a second accumulating
 * surface, held to the same rules as the first — the same bound, the same
 * `requireSafeId` guard, the same entry-before-index write order, the same
 * atomic index publish and the same synchronous variant a `fatal` needs — so
 * neither can drift from the other in the properties that matter. Both are one
 * implementation over one shared core (`openBoundedFileStore`), and each counts
 * what it drops.
 *
 * R21's acceptance criterion is that resolving one reference does not read the
 * whole store. That holds structurally here rather than incidentally: `get` and
 * `getPayload` each build a single path from the id and read exactly one file,
 * and the module's only directory enumeration (`cacheRecordIds`) is a separate
 * diagnostic helper that no lookup path calls. An index is consulted solely by
 * its writer, so the only volume-proportional work — reading and rewriting an
 * index — happens on the write path, amortised across entries, and never during
 * a lookup.
 *
 * An index is a prune hint, not the source of truth: an entry resolves because
 * its own file exists, so an entry written immediately before a crash still
 * resolves even though its index line was never appended. Two consequences are
 * accepted deliberately. First, an index line whose entry file is gone (a
 * crash between `rm` and the index rewrite) resolves to `undefined` — the same
 * answer as a pruned entry — and is dropped by the next rewrite. Second, an
 * entry file whose index line is missing (a crash between the entry write and
 * the index append) is an orphan: it resolves, but later pruning cannot reach
 * it, so it outlives the bound. Orphans are bounded by the number of crashes
 * inside that window; writing the entry first is the ordering that keeps the
 * entry rather than the bookkeeping, which is exactly what R21 promises.
 *
 * A crash mid-rewrite cannot truncate an index either: every rewrite goes to a
 * sibling temporary file and is published with `rename`, which is atomic on
 * POSIX, so a reader sees either the whole old index or the whole new one. The
 * append path is not atomic, so a torn tail line is skipped when the index is
 * read rather than aborting the load. One writer per directory is assumed —
 * concurrent writes within a cache are serialised, but two processes sharing a
 * directory would clobber each other's index.
 */

import {appendFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {appendFile, mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {LogRecord} from './record.ts';

export interface CacheOptions {
    /** Directory holding the cache. Created if it does not exist. */
    dir: string;
    /**
     * Maximum number of records retained, and — independently — the maximum
     * number of payloads. Pruning removes the oldest past it.
     */
    limit: number;
}

/**
 * The read side of a payload store, which is all a resolver needs (PRD R19).
 *
 * Stated separately from the writer halves so a service can be handed something
 * that only reads payloads — whether a reference resolves is a fact about the
 * store, not about the emitter that wrote it — without acquiring the writer
 * half.
 */
export interface PayloadReader {
    /** The payload retained under `id`, or `undefined` when it is not retained. */
    getPayload(id: string): Promise<unknown | undefined>;
}

/**
 * The record half of the store: retention and lookup of emitted records.
 *
 * Split out of `RecordCache` so a caller that only retains records can be handed
 * — or can hand over — exactly that capability. A logger's record path is the
 * only reason a store exists for most callers, and a test double for it should
 * not have to grow four payload methods it will never exercise; the payload half
 * is a separate interface below.
 */
export interface RecordStore {
    /**
     * Retain `record`, pruning the oldest records when `limit` is exceeded.
     * Rejects if the record cannot be written; the caller decides whether that
     * is worth reporting.
     */
    put(record: LogRecord): Promise<void>;
    /**
     * Retain `record` *synchronously*, so it resolves the instant this returns.
     *
     * This is the path `fatal` needs: `process.exit` drains no pending I/O, so
     * the queued `put` a fatal record would otherwise use never runs — and the
     * one record worth keeping would be the one that is lost. Same file name,
     * same `{id,time}` index line, same bound and same order (record first,
     * index second) as `put`. The ordinary case is a plain `appendFileSync` in
     * both paths — deliberately non-atomic, which is why a torn tail line is
     * skipped when the index is read. Only the prune rewrite is published
     * atomically, and this path does that through its *own* temporary file
     * rather than the queued rewrite's, so the two cannot collide.
     *
     * It never throws. The caller is a process-failure handler, where an escaping
     * throw aborts the very process the record exists to report, so a failed
     * retention (unwritable directory, full disk) is swallowed exactly as a
     * rejected `put` is. A retention that failed is not counted — but an entry
     * removed from the index is, whether or not deleting its file succeeded,
     * because `evict` increments `dropped` as it removes; that is the meaning of
     * `dropped` on this path and on the asynchronous one alike.
     */
    putSync(record: LogRecord): void;
    /** The record retained under `id`, or `undefined` when it is not retained. */
    get(id: string): Promise<LogRecord | undefined>;
    /** Records currently retained, and records pruned since this cache opened. */
    stats(): {size: number; dropped: number};
    /**
     * Await writes still in flight. Nothing is buffered, so there is no flush.
     *
     * On a full `RecordCache` this drains `put` *and* `putPayload`: the two
     * queues are separate, and one that drained only the records would let
     * `close()` return while a payload write was still landing.
     */
    close(): Promise<void>;
}

/**
 * The write side of a payload store (PRD R19/R20) — the half a *logger* needs
 * to retain an inline payload, and the half the inspect-side reader does not.
 *
 * `RecordCache` is the union of `RecordStore` and this; `openCache` backs both
 * with one bounded directory. Stating the halves separately is what keeps each
 * caller's dependency honest: a resolver reads payloads (`PayloadReader`), a
 * logger that mints payload references writes them (`PayloadStore`), and a
 * caller that only retains records depends on `RecordStore` alone.
 */
export interface PayloadStore extends PayloadReader {
    /**
     * Retain a payload under `id`, keyed exactly as the reference names it (PRD
     * R19). `json` is the value's JSON text, produced at emit time so the
     * payload is a snapshot of the value as it was rendered rather than a live
     * reference the caller can still mutate.
     *
     * Bounded by the same `limit` as the records, and dropped oldest-first by
     * the same rule. Rejects if it cannot be written, as `put` does.
     */
    putPayload(id: string, time: number, json: string): Promise<void>;
    /**
     * `putPayload` for the `fatal` path, and for the same reason as `putSync`:
     * the exit that follows drains nothing, so a queued payload write would
     * never run and the fatal record's reference would be a dead link. Never
     * throws, swallowing a failure exactly as `putSync` does.
     */
    putPayloadSync(id: string, time: number, json: string): void;
    /** Payloads currently retained, and payloads pruned since this cache opened. */
    payloadStats(): {size: number; dropped: number};
}

/** A store holding both halves: what `openCache` returns and the CLI reads. */
export interface RecordCache extends RecordStore, PayloadStore {}

/** One `{id,time}` line of the prune index. */
interface IndexEntry {
    id: string;
    time: number;
}

const INDEX_FILE = 'index.jsonl';
const RECORDS_DIR = 'records';
const PAYLOAD_INDEX_FILE = 'payloads.jsonl';
const PAYLOADS_DIR = 'payloads';
const ENTRY_SUFFIX = '.json';
const TEMPORARY_SUFFIX = '.tmp';

/**
 * The synchronous prune's own temporary file name, deliberately distinct from
 * the queued rewrite's. A `fatal` can arrive while an asynchronous prune is in
 * flight, and `putSync` sits outside `enqueue` by design, so sharing the
 * temporary path would let the synchronous `writeFileSync`/`renameSync` pair
 * interleave with the asynchronous `writeFile`/`rename`: whichever rename
 * landed last would decide the contents, and the fatal record's index line
 * could be reverted away. Keeping the `.tmp` suffix means a leftover is still
 * recognisable to the `.tmp` scans of the cache directory.
 */
const SYNCHRONOUS_TEMPORARY_SUFFIX = '.sync.tmp';

/**
 * Reject ids that could escape a store's directory or name something other than
 * one entry file. ULID-shaped ids always pass; anything else is a programming
 * error on the write path and an automatic miss on the read path. `what` names
 * the surface the id belongs to, so the message says which caller is at fault.
 */
function requireSafeId(id: string, what: string): string {
    if (!/^[0-9A-Za-z_-]+$/.test(id)) {
        throw new Error(`semantic-log cache: unsafe ${what} id ${JSON.stringify(id)}`);
    }
    return id;
}

/**
 * A bounded, self-pruning directory of JSON entries, each named by an id and
 * indexed (for pruning only) by an append-only `{id,time}` log.
 *
 * This is the one implementation behind both accumulating surfaces of the
 * cache, so the records and the payloads cannot diverge on the properties this
 * module exists to guarantee: the bound, the drop accounting, the id guard, the
 * entry-before-index write order, the atomic index publish, and the synchronous
 * variant a process-failure handler needs. The store knows nothing about what
 * it holds — it is handed an entry's JSON text and hands the same text back.
 */
interface BoundedFileStore {
    /** Queue `json` under `id`. Rejects on an unsafe id or a failed write. */
    write(id: string, time: number, json: string): Promise<void>;
    /**
     * Write `json` under `id` before returning. Never waits on the queue, so it
     * can be used from a process-exit path; it may throw, and its caller
     * swallows the failure (see `putSync` / `putPayloadSync`).
     */
    writeSync(id: string, time: number, json: string): void;
    /** The stored text for `id`, or `undefined` for an unsafe id or a miss. */
    read(id: string): Promise<string | undefined>;
    /** Entries currently retained, and entries pruned since this store opened. */
    size(): number;
    dropped(): number;
    /** Resolves once every write queued so far has settled. Never rejects. */
    idle(): Promise<void>;
}

interface BoundedStoreOptions {
    /** The cache root holding this store's index and its entries directory. */
    dir: string;
    /** Entries retained before the oldest are pruned. */
    limit: number;
    /** The subdirectory holding one file per entry. */
    entriesDir: string;
    /** The prune index's file name, inside `dir`. */
    indexFile: string;
    /** The surface's name, used in the unsafe-id message. */
    what: string;
}

/** Open (creating if needed) one bounded store under `options.dir`. */
async function openBoundedFileStore(options: BoundedStoreOptions): Promise<BoundedFileStore> {
    const entriesDir = join(options.dir, options.entriesDir);
    const indexPath = join(options.dir, options.indexFile);
    await mkdir(entriesDir, {recursive: true});

    // In-memory mirror of the index, oldest first. It is the prune order; the
    // files are the retention truth.
    const index: IndexEntry[] = [];
    let dropped = 0;

    try {
        const raw = await readFile(indexPath, 'utf8');
        for (const line of raw.split('\n')) {
            if (!line.trim()) {
                continue;
            }
            try {
                const entry = JSON.parse(line) as IndexEntry;
                if (entry && typeof entry.id === 'string' && Number.isFinite(entry.time)) {
                    index.push({id: entry.id, time: entry.time});
                }
            } catch {
                // A torn tail line from a crash mid-append. Skipping it loses one
                // prune entry, not the entries themselves, and leaves the rest of
                // the index usable.
            }
        }
    } catch {
        // No index yet — a fresh store. Entries already on disk still resolve,
        // because `read` never consults the index.
    }

    // Mutations run one at a time: `prune` rewrites a whole file, so two of them
    // interleaving would race on the same temporary path and could see a
    // half-shifted index. Reads are not queued — they never mutate. The
    // synchronous prune cannot join this queue (`writeSync` must not wait for a
    // later tick), so it publishes through its own temporary instead.
    let tail: Promise<void> = Promise.resolve();
    function enqueue<T>(action: () => Promise<T>): Promise<T> {
        const result = tail.then(action);
        // The chain itself never rejects: one failed write must not poison every
        // later write, nor turn `idle` into a rejection. `result` still carries
        // the failure to the caller of `write`.
        tail = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }

    /** The retained file for `id`; refuses an id that could escape the directory. */
    function entryPath(id: string): string {
        return join(entriesDir, `${requireSafeId(id, options.what)}${ENTRY_SUFFIX}`);
    }

    /** The whole index, in the exact text both rewrites publish. */
    function serializeIndex(): string {
        return `${index.map(entry => JSON.stringify(entry)).join('\n')}\n`;
    }

    /**
     * Drop the oldest entries past the bound and return them, oldest first — the
     * removal is what makes the bound an LRU-by-time.
     */
    function evict(): IndexEntry[] {
        const pruned = index.splice(0, Math.max(0, index.length - options.limit));
        dropped += pruned.length;
        return pruned;
    }

    async function rewriteIndex(): Promise<void> {
        const temporary = `${indexPath}${TEMPORARY_SUFFIX}`;
        await writeFile(temporary, serializeIndex());
        await rename(temporary, indexPath);
    }

    async function prune(): Promise<void> {
        for (const entry of evict()) {
            await rm(entryPath(entry.id), {force: true});
        }
        await rewriteIndex();
    }

    /**
     * `prune` for the synchronous path. It publishes through its own temporary
     * path, never the queued rewrite's (see `SYNCHRONOUS_TEMPORARY_SUFFIX`), so
     * the two cannot interleave. The temporary is removed on the failure path as
     * well: the cache directory is scanned elsewhere, so a partially-written
     * leftover must not accumulate.
     */
    function pruneSync(): void {
        for (const entry of evict()) {
            rmSync(entryPath(entry.id), {force: true});
        }
        const temporary = `${indexPath}${SYNCHRONOUS_TEMPORARY_SUFFIX}`;
        try {
            writeFileSync(temporary, serializeIndex());
            renameSync(temporary, indexPath);
        } finally {
            // A no-op after a successful rename, because the file no longer
            // exists there; the cleanup after a failed write or a failed publish.
            rmSync(temporary, {force: true});
        }
    }

    return {
        // `async` so that an unsafe id is reported as a rejection rather than a
        // synchronous throw: the interface promises a promise, and a caller that
        // logs must never have to guard the call itself.
        write: async (id: string, time: number, json: string): Promise<void> => {
            // Validated before the write is queued: an id that could escape the
            // directory is a bug and is reported to the caller rather than
            // silently retained under a mangled name.
            const safe = requireSafeId(id, options.what);
            const entry: IndexEntry = {id: safe, time};
            return enqueue(async () => {
                // Entry first, index second: if the process dies between the two,
                // the entry still resolves (see the module comment).
                await writeFile(entryPath(safe), json);
                index.push(entry);
                await appendFile(indexPath, `${JSON.stringify(entry)}\n`);
                if (index.length > options.limit) {
                    await prune();
                }
            });
        },
        writeSync: (id: string, time: number, json: string): void => {
            // Deliberately outside `enqueue`: the queue is drained on a later
            // tick, which the synchronous `exit` that follows never reaches.
            const safe = requireSafeId(id, options.what);
            const entry: IndexEntry = {id: safe, time};
            // Entry first, index second (as in `write`): a death in between
            // leaves an entry that still resolves and, at worst, an index line
            // the next rewrite finds no file for.
            writeFileSync(entryPath(safe), json);
            index.push(entry);
            appendFileSync(indexPath, `${JSON.stringify(entry)}\n`);
            if (index.length > options.limit) {
                pruneSync();
            }
        },
        read: async (id: string): Promise<string | undefined> => {
            try {
                return await readFile(entryPath(id), 'utf8');
            } catch {
                // Absent, pruned, not yet written, unnamed safely, or truncated by
                // a crash: all of them mean "not retained", which is a normal
                // answer for a cache and must never fail a lookup.
                return undefined;
            }
        },
        size: () => index.length,
        dropped: () => dropped,
        idle: () => tail,
    };
}

/** Open (creating if needed) the cache in `options.dir`. */
export async function openCache(options: CacheOptions): Promise<RecordCache> {
    if (!options.dir) {
        throw new Error('openCache: a cache directory is required');
    }
    if (!Number.isInteger(options.limit) || options.limit < 1) {
        throw new Error('openCache: limit must be a positive integer');
    }
    const records = await openBoundedFileStore({
        dir: options.dir,
        limit: options.limit,
        entriesDir: RECORDS_DIR,
        indexFile: INDEX_FILE,
        what: 'record',
    });
    const payloads = await openBoundedFileStore({
        dir: options.dir,
        limit: options.limit,
        entriesDir: PAYLOADS_DIR,
        indexFile: PAYLOAD_INDEX_FILE,
        what: 'payload',
    });

    /**
     * Parse one stored entry, treating a file that is not JSON as a miss.
     *
     * A truncated entry — a crash between the `writeFile` and the flush that
     * settles it — must answer `undefined` rather than throw out of a lookup,
     * exactly as an absent file does. `undefined` never leaves here for a file
     * that exists: JSON's own `null` parses to `null`, so a stored `null` is a
     * resolved payload rather than a miss.
     */
    function parseStored<T>(raw: string | undefined): T | undefined {
        try {
            return raw === undefined ? undefined : (JSON.parse(raw) as T);
        } catch {
            return undefined;
        }
    }

    return {
        // `async` for the same reason the store's `write` is: a record that
        // cannot even be serialised is reported to the caller as a rejection
        // rather than thrown out of a `put` that promised a promise.
        put: async (record: LogRecord): Promise<void> =>
            records.write(record.id, record.time, JSON.stringify(record)),
        putSync: (record: LogRecord): void => {
            try {
                records.writeSync(record.id, record.time, JSON.stringify(record));
            } catch {
                // Swallowed by contract — see `putSync` in the interface. This
                // runs inside a process-failure handler, so an escaping throw
                // would abort the process the record is reporting.
            }
        },
        get: async (id: string): Promise<LogRecord | undefined> => parseStored<LogRecord>(await records.read(id)),
        putPayload: async (id: string, time: number, json: string): Promise<void> => payloads.write(id, time, json),
        putPayloadSync: (id: string, time: number, json: string): void => {
            try {
                payloads.writeSync(id, time, json);
            } catch {
                // Swallowed by contract, exactly as `putSync` is: the reference is
                // then a dead link, which is a failure a `fatal` already is, and
                // throwing here would abort the process reporting it.
            }
        },
        getPayload: async (id: string): Promise<unknown | undefined> => parseStored<unknown>(await payloads.read(id)),
        stats: () => ({size: records.size(), dropped: records.dropped()}),
        payloadStats: () => ({size: payloads.size(), dropped: payloads.dropped()}),
        close: async (): Promise<void> => {
            // Both queues, so `close` means "nothing is still in flight" rather
            // than "the records are done".
            await records.idle();
            await payloads.idle();
        },
    };
}

/**
 * The ids of the records present in the cache at `dir`.
 *
 * This is the module's only directory enumeration and it exists for diagnostics
 * (the inspect CLI reporting what a cache holds). It is deliberately *not* part
 * of the lookup path: resolving one reference must not read the store, so no
 * lookup may call this.
 */
export async function cacheRecordIds(dir: string): Promise<string[]> {
    const files = await readdir(join(dir, RECORDS_DIR)).catch(() => [] as string[]);
    return files.filter(file => file.endsWith(ENTRY_SUFFIX)).map(file => file.slice(0, -ENTRY_SUFFIX.length));
}

/** Canonical backing-file names and paths, for callers that must not guess them. */
export const cachePaths = {
    index: INDEX_FILE,
    records: RECORDS_DIR,
    payloadIndex: PAYLOAD_INDEX_FILE,
    payloads: PAYLOADS_DIR,
    indexFile: (dir: string): string => join(dir, INDEX_FILE),
    recordsDir: (dir: string): string => join(dir, RECORDS_DIR),
    payloadIndexFile: (dir: string): string => join(dir, PAYLOAD_INDEX_FILE),
    payloadsDir: (dir: string): string => join(dir, PAYLOADS_DIR),
};
