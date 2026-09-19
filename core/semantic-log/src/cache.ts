/**
 * Bounded local record store (PRD R21; §5.1 parity row "Dereferenceable
 * reference in the terminal").
 *
 * Every emitted record is retained here, whether or not the cluster service
 * received it, so `semantic-log://record/<id>` still resolves after the emitting
 * process has exited and with no service running (PRD R19/R21). Storage is
 * `cacache`, keyed by the record's own id, in the same directory and key space
 * the framework's log cache uses — so a reference resolves with one lookup, and
 * an entry retained by any writer in that directory resolves through the same
 * path.
 *
 * ## Why cacache
 *
 * `cacache` is content-addressed and index-based, so two writers may share one
 * directory. The one-file-per-entry store this replaced could not say that: its
 * index rewrite assumed a single writer, which is exactly why it was retired
 * once the framework's pino transport turned out to be writing the same
 * directory.
 *
 * ## Two surfaces, one directory
 *
 * The records and the inline payloads of PRD R19/R20 share one directory and are
 * bounded independently: an entry's `metadata.kind` says which surface it
 * belongs to, and retention prunes each to its own bound. An entry carrying no
 * `kind` — one written by a transport that predates the field — is treated as a
 * record, so a mixed directory keeps working.
 *
 * ## Lookup reads one entry, never the store
 *
 * R21's acceptance criterion is that resolving one reference does not read the
 * whole store. `cacache.get` is a direct key lookup, and the module's only
 * enumeration (`cacheRecordIds`) is a separate diagnostic helper that no lookup
 * path calls. The synchronous sidecar is a *single* file rather than the store,
 * and it is consulted through an in-memory index rather than re-read per lookup.
 *
 * ## The synchronous path, and its sidecar
 *
 * `fatal` needs a write that has landed by the time it returns, because
 * `process.exit` drains no I/O — and `cacache` has no synchronous API. The
 * synchronous writes therefore append to a sidecar file (`fatal.jsonl`), which a
 * later `openCache` replays into the cache and removes: the one record worth
 * keeping must not be the one that is lost. The sidecar is bounded like
 * everything else — a write past the bound compacts the file — and a failed
 * replay keeps it, because the durable copy is the whole point of having it.
 *
 * ## Retention
 *
 * The order the bound prunes by is held in memory, loaded from the index once at
 * open: `cacache.ls` reads the whole index, and the bound is crossed by every
 * write once the store is full, so consulting it per write would make a log line
 * cost the store's size. A write therefore pays one `put` and, at most, one `rm`.
 * The pass at open is also the only one that garbage-collects content, and it runs
 * at most once per `sweepIntervalMs`, guarded by the `__blong_retention_state__`
 * marker this store shares with the framework's pino transport — so a shared
 * directory is swept once per interval rather than once per writer.
 *
 * A `readOnly` open — how the inspector opens a cache — prunes nothing and
 * writes nothing: an inspection must not be the thing that evicts the entry it
 * was asked about.
 */

import * as cacache from 'cacache';
import {appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {mkdir, rm} from 'node:fs/promises';
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
    /**
     * How long a retention sweep is trusted for, in milliseconds. Injectable so
     * a test does not have to wait a day to observe one.
     */
    sweepIntervalMs?: number;
    /** Injectable clock for tests, as the logger's own `now` is. */
    now?: () => number;
    /**
     * Open for reading only: no sweep, no marker write, no replay. The inspector
     * opens this way, so that resolving a reference cannot prune the entry it is
     * resolving, nor write to a directory it was only asked to describe.
     */
    readOnly?: boolean;
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
     * one record worth keeping would be the one that is lost.
     *
     * It shares `put`'s bound and its read path but not its backing file: the
     * write lands in the sidecar (see the module comment), which the next open
     * replays into the cache proper. Reads consult the sidecar first, so a record
     * written this way resolves immediately in the process that wrote it and in
     * the next one to open the cache.
     *
     * It never throws. The caller is a process-failure handler, where an escaping
     * throw aborts the very process the record exists to report, so a failed
     * retention (unwritable directory, full disk) is swallowed exactly as a
     * rejected `put` is. A retention that failed is not counted — but an entry
     * removed from the store is, whether or not deleting its content succeeded,
     * because the sweep counts as it removes; that is the meaning of `dropped` on
     * this path and on the asynchronous one alike.
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
     * surfaces are bounded separately, and one that drained only the records
     * would let `close()` return while a payload write was still landing. What is
     * awaited is the *serialisation chain*, not a data buffer: each write is
     * awaited by its own caller, and this only guarantees that no write started
     * before it is still running.
     */
    close(): Promise<void>;
}

/**
 * The write side of a payload store (PRD R19/R20) — the half a *logger* needs to
 * retain an inline payload, and the half the inspect-side reader does not.
 *
 * `RecordCache` is the union of `RecordStore` and this; `openCache` backs both
 * over one directory. Stating the halves separately is what keeps each caller's
 * dependency honest: a resolver reads payloads (`PayloadReader`), a logger that
 * mints payload references writes them (`PayloadStore`), and a caller that only
 * retains records depends on `RecordStore` alone.
 */
export interface PayloadStore extends PayloadReader {
    /**
     * Retain a payload under `id`, keyed exactly as the reference names it (PRD
     * R19). `json` is the value's JSON text, produced at emit time so the payload
     * is a snapshot of the value as it was rendered rather than a live reference
     * the caller can still mutate.
     *
     * Bounded by the same `limit` as the records, and dropped oldest-first by the
     * same rule. Rejects if it cannot be written, as `put` does.
     */
    putPayload(id: string, time: number, json: string): Promise<void>;
    /**
     * `putPayload` for the `fatal` path, and for the same reason as `putSync`:
     * the exit that follows drains nothing, so a queued payload write would never
     * run and the fatal record's reference would be a dead link. Never throws,
     * swallowing a failure exactly as `putSync` does.
     */
    putPayloadSync(id: string, time: number, json: string): void;
    /** Payloads currently retained, and payloads pruned since this cache opened. */
    payloadStats(): {size: number; dropped: number};
}

/** A store holding both halves: what `openCache` returns and the CLI reads. */
export interface RecordCache extends RecordStore, PayloadStore {}

/** The two halves of the store, as they appear in an entry's metadata. */
type EntryKind = 'record' | 'payload';

const KIND_RECORD: EntryKind = 'record';
const KIND_PAYLOAD: EntryKind = 'payload';

/**
 * The sweep marker, deliberately the same key the framework's pino transport
 * writes, so that a directory shared by both sweeps at most once per interval
 * rather than once per writer. Only the *marker* is shared: each writer prunes by
 * the bound it was opened with.
 */
const RETENTION_STATE_KEY = '__blong_retention_state__';

/** The sidecar holding writes that had to land synchronously. */
const SIDECAR_FILE = 'fatal.jsonl';

/** The sidecar's rewrite temporary; distinct so a leftover is recognisable. */
const SIDECAR_TEMPORARY_SUFFIX = '.tmp';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** One line of the synchronous sidecar. */
interface SidecarEntry {
    id: string;
    time: number;
    kind: EntryKind;
    /** The stored text, exactly as the asynchronous path would have written it. */
    json: string;
}

/** The metadata a stored entry carries; `cacache` types it as `unknown`. */
interface EntryMetadata {
    timestamp?: number;
    kind?: string;
}

/** An entry as `cacache.ls` reports it, narrowed to the two fields used here. */
interface ListedEntry {
    key: string;
    metadata?: EntryMetadata | null;
}

/**
 * Which surface an entry belongs to. An entry with no `kind` predates the field
 * — the framework's pino transport writes none — and is a record, so mixing the
 * two writers in one directory cannot make either invisible to retention.
 */
function kindOf(entry: ListedEntry): EntryKind {
    return entry.metadata?.kind === KIND_PAYLOAD ? KIND_PAYLOAD : KIND_RECORD;
}

/** The timestamp retention sorts by; a missing one sorts oldest. */
function timeOf(entry: ListedEntry): number {
    const timestamp = entry.metadata?.timestamp;
    return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Parse one stored entry, treating text that is not JSON as a miss.
 *
 * A truncated entry — a crash between the `put` and the flush that settles it —
 * must answer `undefined` rather than throw out of a lookup, exactly as an
 * absent entry does. `undefined` never leaves here for an entry that exists:
 * JSON's own `null` parses to `null`, so a stored `null` is a resolved payload
 * rather than a miss.
 */
function parseStored<T>(raw: string | undefined): T | undefined {
    try {
        return raw === undefined ? undefined : (JSON.parse(raw) as T);
    } catch {
        return undefined;
    }
}

/**
 * Reject ids that could name something other than one entry. `cacache` keys are
 * not paths, so this cannot escape a directory the way a file store's guard
 * would — it is kept because the id grammar is a contract of the reference scheme
 * (`refs.ts`) and because it keeps the sweep marker from ever colliding with a
 * record id.
 */
function requireSafeId(id: string, what: string): string {
    if (!/^[0-9A-Za-z_-]+$/.test(id)) {
        throw new Error(`semantic-log cache: unsafe ${what} id ${JSON.stringify(id)}`);
    }
    return id;
}

/** Read the sidecar, skipping a torn tail line exactly as the index reader did. */
function readSidecar(path: string): SidecarEntry[] {
    let raw: string;
    try {
        raw = readFileSync(path, 'utf8');
    } catch {
        return [];
    }
    const entries: SidecarEntry[] = [];
    for (const line of raw.split('\n')) {
        if (!line.trim()) {
            continue;
        }
        try {
            const entry = JSON.parse(line) as SidecarEntry;
            if (entry && typeof entry.id === 'string' && typeof entry.json === 'string') {
                entries.push(entry);
            }
        } catch {
            // A crash between the append and its flush. Losing one line is losing
            // one fatal record, which is the best that can be done for a line that
            // never finished being written.
        }
    }
    return entries;
}

/** Open (creating if needed) the cache in `options.dir`. */
export async function openCache(options: CacheOptions): Promise<RecordCache> {
    if (!options.dir) {
        throw new Error('openCache: a cache directory is required');
    }
    if (!Number.isInteger(options.limit) || options.limit < 1) {
        throw new Error('openCache: limit must be a positive integer');
    }

    const dir = options.dir;
    const limit = options.limit;
    const sweepIntervalMs = options.sweepIntervalMs ?? ONE_DAY_MS;
    const now = options.now ?? Date.now;
    const readOnly = options.readOnly === true;
    const sidecarPath = join(dir, SIDECAR_FILE);

    await mkdir(dir, {recursive: true});

    // Retained counts, as this process knows them. Exact while this process is the
    // only writer, and corrected from `cacache.ls` on every sweep.
    let records = 0;
    let payloads = 0;
    let droppedRecords = 0;
    let droppedPayloads = 0;

    // The synchronous entries this process may have written, by id: the read
    // path's first stop, so a fatal's own reference resolves without touching the
    // store at all.
    const sidecar = new Map<string, SidecarEntry>();
    for (const entry of readSidecar(sidecarPath)) {
        sidecar.set(entry.id, entry);
    }

    // Mutations run one at a time. `cacache` itself tolerates concurrency, but the
    // counters above do not: two sweeps interleaving would each adopt the store's
    // size and then both subtract, and the bound would report itself as holding
    // fewer entries than it does.
    let tail: Promise<void> = Promise.resolve();
    function enqueue<T>(action: () => Promise<T>): Promise<T> {
        const result = tail.then(action);
        // The chain itself never rejects: one failed write must not poison every
        // later write, nor turn `close` into a rejection. `result` still carries
        // the failure to the caller of `put`.
        tail = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }

    /**
     * Which entries this process is retaining, per surface, oldest first.
     *
     * Held in memory because the alternative is `cacache.ls` — a read of the
     * whole index — and the bound is crossed by *every* write once the store is
     * full. Reading the index per write made one log line cost about a second on
     * a cache holding ten thousand records, which is what turned a shutdown into
     * a timeout the first time this store met real traffic. The lists are loaded
     * once at open and maintained on write and eviction, so the write path pays
     * one `put` and, at most, one `rm`.
     *
     * The cost of that is stated rather than hidden: an entry written by another
     * process in the same directory is not in these lists, so this process will
     * neither count nor prune it. A shared directory is therefore bounded by the
     * writer that swept, against the index *it* read at open — the same trade the
     * retired file store made, and the reason the pino transport's own sweep is
     * left in place beside this one.
     */
    const retained: Record<EntryKind, Array<{id: string; time: number}>> = {record: [], payload: []};

    /** Load the retention lists from an index, oldest first. */
    function loadIndexes(index: Record<string, ListedEntry>): void {
        for (const kind of [KIND_RECORD, KIND_PAYLOAD] as EntryKind[]) {
            retained[kind] = Object.values(index)
                .filter(entry => entry.key !== RETENTION_STATE_KEY && kindOf(entry) === kind)
                .map(entry => ({id: entry.key, time: timeOf(entry)}))
                .sort((left, right) => left.time - right.time);
        }
        records = retained[KIND_RECORD].length;
        payloads = retained[KIND_PAYLOAD].length;
    }

    /**
     * Drop the oldest entries past one surface's bound, counting them. The removal
     * is what makes the bound an LRU-by-time, and it needs no index read: the list
     * is already in that order.
     */
    async function pruneKind(kind: EntryKind): Promise<number> {
        const list = retained[kind];
        const oldest = list.splice(0, Math.max(0, list.length - limit));
        for (const entry of oldest) {
            await cacache.rm.entry(dir, entry.id);
            if (kind === KIND_RECORD) {
                droppedRecords += 1;
            } else {
                droppedPayloads += 1;
            }
        }
        return oldest.length;
    }

    /** Adopt the retained counts after a removal. */
    function recount(): void {
        records = retained[KIND_RECORD].length;
        payloads = retained[KIND_PAYLOAD].length;
    }

    /**
     * Run the retention pass over both surfaces and publish the marker the pass
     * exists to date. `compact` additionally collects the content nothing
     * references any more, which is why it is reserved for the pass at open: it
     * rewrites the whole index, and a write that crossed the bound by one must not
     * pay for it.
     */
    async function sweep(compact: boolean): Promise<void> {
        const removed = (await pruneKind(KIND_RECORD)) + (await pruneKind(KIND_PAYLOAD));
        recount();
        if (removed > 0 && compact) {
            await cacache.verify(dir).catch(() => undefined);
        }
        await cacache.put(dir, RETENTION_STATE_KEY, Buffer.from(JSON.stringify({lastCleanup: now()})));
    }

    /**
     * The pass an open performs: read the index once, then prune only when the
     * interval has elapsed. Reading the marker is a `cacache.get`, and an absent one
     * means "never swept", which is `lastCleanup = 0` rather than an error.
     *
     * A read-only open loads the lists and stops: an inspection must not be the
     * thing that evicts an entry, nor write to a directory it was only asked to
     * describe.
     */
    async function maintainOnOpen(): Promise<void> {
        let lastCleanup = 0;
        try {
            const state = JSON.parse((await cacache.get(dir, RETENTION_STATE_KEY)).data.toString()) as {
                lastCleanup?: number;
            };
            if (typeof state.lastCleanup === 'number' && Number.isFinite(state.lastCleanup)) {
                lastCleanup = state.lastCleanup;
            }
        } catch {
            // No marker yet — a fresh store, or one written by a transport that
            // predates the sweep.
        }
        loadIndexes(await cacache.ls(dir));
        if (now() - lastCleanup >= sweepIntervalMs && !readOnly) {
            await sweep(true);
        }
    }

    /**
     * Replay the sidecar into the cache and remove it.
     *
     * A failure leaves both the sidecar and the in-memory index alone: the read
     * path still resolves through them and the next open retries, which is the
     * only behaviour that cannot lose the record the sidecar exists to keep.
     */
    async function replaySidecar(): Promise<void> {
        if (readOnly || sidecar.size === 0) {
            return;
        }
        try {
            for (const entry of sidecar.values()) {
                await cacache.put(dir, entry.id, entry.json, {
                    metadata: {timestamp: entry.time, kind: entry.kind},
                });
            }
            await rm(sidecarPath, {force: true});
            sidecar.clear();
        } catch {
            // See above: keep the durable copy rather than half a replay.
        }
    }

    /**
     * Append one synchronous entry, compacting the file when it would exceed the
     * bound. The append comes first, so a death between the two leaves the earlier
     * entries intact and only the compaction unfinished.
     */
    function appendSidecar(entry: SidecarEntry): void {
        mkdirSync(dir, {recursive: true});
        appendFileSync(sidecarPath, `${JSON.stringify(entry)}\n`);
        sidecar.set(entry.id, entry);
        if (sidecar.size <= limit) {
            return;
        }
        // The file is compacted to the same bound the in-memory index is held to,
        // so a read cannot resolve an entry that the next process to open the cache
        // would not find.
        for (const evicted of [...sidecar.values()].slice(0, sidecar.size - limit)) {
            sidecar.delete(evicted.id);
        }
        const temporary = `${sidecarPath}${SIDECAR_TEMPORARY_SUFFIX}`;
        try {
            writeFileSync(
                temporary,
                [...sidecar.values()].map(item => `${JSON.stringify(item)}\n`).join(''),
            );
            renameSync(temporary, sidecarPath);
        } finally {
            // A no-op after a successful rename, because the file no longer exists
            // there; the cleanup after a failed write or a failed publish.
            rmSync(temporary, {force: true});
        }
    }

    /**
     * Queue one write and keep the bound.
     *
     * The bound is hard rather than approximate: the moment a surface is over it,
     * the sweep runs, so the store never holds more than `limit` records plus the
     * one that just crossed. That is the same amortisation the retired store had —
     * it rewrote its index on every write at capacity — with the index scan
     * instead of the rewrite.
     */
    async function write(kind: EntryKind, id: string, time: number, json: string): Promise<void> {
        const safe = requireSafeId(id, kind);
        return enqueue(async () => {
            await cacache.put(dir, safe, json, {metadata: {timestamp: time, kind}});
            retained[kind].push({id: safe, time});
            recount();
            if (retained[kind].length > limit) {
                // Evict rather than sweep: the bound belongs to the write path, and
                // the daily marker belongs to the interval pass.
                await pruneKind(kind);
                recount();
            }
        });
    }

    /** Read one entry's stored text: the sidecar first, then the store. */
    async function read(id: string): Promise<string | undefined> {
        const synchronous = sidecar.get(id);
        if (synchronous) {
            return synchronous.json;
        }
        try {
            return (await cacache.get(dir, id)).data.toString();
        } catch {
            // Absent, pruned, or never written: all of them mean "not retained",
            // which is a normal answer for a cache and must never fail a lookup.
            return undefined;
        }
    }

    // The replay comes first: a replayed record is in the store, so the counts
    // adopted below include it and a sweep that is due prunes with it in view.
    await replaySidecar();
    await maintainOnOpen();

    return {
        // `async` so that an unsafe id is reported as a rejection rather than a
        // synchronous throw: the interface promises a promise, and a caller that
        // logs must never have to guard the call itself.
        put: (record: LogRecord): Promise<void> =>
            write(KIND_RECORD, record.id, record.time, JSON.stringify(record)),
        putSync: (record: LogRecord): void => {
            try {
                appendSidecar({
                    id: requireSafeId(record.id, KIND_RECORD),
                    time: record.time,
                    kind: KIND_RECORD,
                    json: JSON.stringify(record),
                });
            } catch {
                // Swallowed by contract — see `RecordStore.putSync`.
            }
        },
        get: async (id: string): Promise<LogRecord | undefined> => parseStored<LogRecord>(await read(id)),
        putPayload: (id: string, time: number, json: string): Promise<void> =>
            write(KIND_PAYLOAD, id, time, json),
        putPayloadSync: (id: string, time: number, json: string): void => {
            try {
                appendSidecar({id: requireSafeId(id, KIND_PAYLOAD), time, kind: KIND_PAYLOAD, json});
            } catch {
                // Swallowed by contract, exactly as `putSync` is: the reference is
                // then a dead link, which a failure to write it in the first place
                // already is.
            }
        },
        getPayload: async (id: string): Promise<unknown | undefined> => parseStored<unknown>(await read(id)),
        stats: () => ({size: records, dropped: droppedRecords}),
        payloadStats: () => ({size: payloads, dropped: droppedPayloads}),
        close: async (): Promise<void> => {
            await tail;
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
    let index: Record<string, ListedEntry>;
    try {
        index = (await cacache.ls(dir)) as Record<string, ListedEntry>;
    } catch {
        // Not a cache (no index yet, or a plain directory): no records.
        return [];
    }
    return Object.values(index)
        .filter(entry => entry.key !== RETENTION_STATE_KEY && kindOf(entry) === KIND_RECORD)
        .map(entry => entry.key);
}

/** Canonical backing-file names and paths, for callers that must not guess them. */
export const cachePaths = {
    /** The sweep marker's key, which a test may need to write deliberately. */
    marker: RETENTION_STATE_KEY,
    /** The one backing file this store owns: the synchronous sidecar. */
    sidecar: SIDECAR_FILE,
    sidecarFile: (dir: string): string => join(dir, SIDECAR_FILE),
};
