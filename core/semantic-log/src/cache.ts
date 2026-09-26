/**
 * Bounded local record store (PRD R21; §5.1 parity row "Dereferenceable
 * reference in the terminal").
 *
 * Every emitted record is retained here, whether or not the cluster service
 * received it, so `semlog://t/<shape>` and `semlog://r/<id>` still resolve after the emitting
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
 * directory. That retirement cost something, and the secondary index below buys
 * it back without the assumption: an append is safe between writers, a rewrite
 * is not.
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
 * ## Retention, and the secondary index
 *
 * The order the bound prunes by is held in memory, because the bound is crossed
 * by every write once the store is full: consulting the store per write would
 * make one log line cost the store's size. A write therefore pays one `put`, one
 * append to the secondary index and, at most, one removal.
 *
 * That order used to be loaded from `cacache.ls`, which reads `cacache`'s own
 * index — one file per live entry, each in a directory of its own, so ten
 * thousand entries meant ten thousand directories and half a second before a
 * process printed its first line. It is now taken from `order.jsonl`, an
 * append-only file beside the sidecar that says the same thing in one read: a
 * line per write, a line per removal, last line for an id wins. Appending is what
 * makes it safe for several processes at once — a small append lands whole, so
 * writers interleave lines rather than overwrite each other.
 *
 * `cacache` remains the truth and the file is an index over it. The interval
 * sweep reads the truth, re-applies the bound to what is really there and
 * rewrites the file from that, so an index that has drifted costs a store time,
 * never correctness; a directory with no index at all — one written before this
 * index existed, or by a writer that does not keep one — is read the expensive
 * way once and given one. The rewrite happens only in that pass, which runs at
 * most once per `sweepIntervalMs`, guarded by the `__blong_retention_state__`
 * marker this store shares with the framework's pino transport.
 *
 * A removal deletes the entry's index file rather than appending a deletion to
 * it, which matters more than it sounds: a `cacache` key is hashed into an index
 * file of its own, so a store keyed by unique ids that only tombstoned its
 * pruned entries would grow one file per entry ever written, whatever its bound
 * did, and every `cacache.ls` — the expensive read — would read all of them. That
 * is exactly what happened, and a directory that carries the files of entries
 * pruned that way is repaired when it is opened: a slow index scan is reported at
 * warn level and the files it read but could not use are removed (see
 * `reclaimDeadIndexFiles`). A reclaim that removed something arms the next one, a
 * reclaim that found nothing buys the directory `RECLAIM_INTERVAL_MS` of quiet, and
 * what it did is recorded in a small file of its own — so a directory heals over as
 * many opens as it takes, and a healthy one is not read twice.
 *
 * ## Slow steps are reported
 *
 * The store reports the steps that turn out to be slow — reading the truth, the
 * expensive read above all — through an optional logger, at warn level, because
 * the delay is paid before the first line the logger itself can write. A caller
 * that supplies none gets a silent store.
 *
 * A `readOnly` open — how the inspector opens a cache — prunes nothing, reclaims
 * nothing and writes nothing: an inspection must not be the thing that evicts the
 * entry it was asked about.
 */

import * as cacache from 'cacache';
import {appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {
    appendFile,
    mkdir,
    readdir,
    readFile,
    rename,
    rm,
    unlink,
    writeFile,
} from 'node:fs/promises';
import {join} from 'node:path';
import type {LogRecord} from './record.ts';
import {denoiseHidesDetails, shapeKeyOf} from './retention.ts';

export interface CacheOptions {
    /** Directory holding the cache. Created if it does not exist. */
    dir: string;
    /**
     * Maximum number of shapes retained, and — independently — the maximum
     * number of payloads. Pruning removes the oldest past it.
     *
     * The *primary* tenant is a shape: the store holds one entry per kind of
     * record, not one per record, which is what lets a shape that every run emits
     * keep its place while the one-off records written after it age out. The
     * bound therefore counts shapes.
     */
    limit: number;
    /**
     * Maximum number of per-emit entries retained: the records kept under their own
     * id beside the shape they belong to.
     *
     * A record earns one when folding it into its shape would hide something — it
     * withheld a payload, or it carries an error — and a record that has no shape
     * (one written by a transport, or by an older writer) earns one always, because
     * that is the only place it can be kept. Defaults to `limit`.
     */
    recordLimit?: number;
    /**
     * How long a retention sweep is trusted for, in milliseconds. Injectable so
     * a test does not have to wait a day to observe one.
     */
    sweepIntervalMs?: number;
    /** Injectable clock for tests, as the logger's own `now` is. */
    now?: () => number;
    /**
     * Open for reading only: no sweep, no marker write, no replay, no reclaim.
     * The inspector opens this way, so that resolving a reference cannot prune
     * the entry it was resolving, nor write to a directory it was only asked to
     * describe.
     */
    readOnly?: boolean;
    /**
     * How long the index scan at open may take before it is reported at warn
     * level and the directory is reclaimed. `0` disables both. Defaults to the
     * framework's `SLOW_STEP_MS`.
     */
    slowMs?: number;
    /** Where the store reports its own slow steps. Silent when absent. */
    log?: CacheLogger;
}

/**
 * Where the store reports its own slow steps.
 *
 * Message first, the details second, which is the order the emitter's own logger
 * takes — this module is a dependency of the emitter, so its only real caller is
 * the logger that is opening it, and requiring an adapter between the two would
 * be the adapter's own bug waiting to happen. The framework's *public* log face
 * is pino-shaped and translates into this order.
 */
export interface CacheLogger {
    warn?: (message: string, details?: Record<string, unknown>) => void;
    info?: (message: string, details?: Record<string, unknown>) => void;
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
     * Retain `record`, pruning the oldest entries past each tenant's bound.
     * Rejects if the record cannot be written; the caller decides whether that
     * is worth reporting.
     *
     * The record is written to its **shape's** entry, replacing the newest
     * occurrence of that shape and counting it. It is *also* written under its own
     * id when folding it into that entry would hide something — it withheld a
     * payload, or it carries an error — and always when it has no shape to fold
     * into (`retention.ts` holds both questions).
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
    /**
     * Shapes currently retained, and shapes pruned since this cache opened.
     *
     * The primary tenant, and the one a caller means by "how much is retained": a
     * shape's entry stands for every occurrence of it, and its metadata carries the
     * count. `recordStats` reports the per-emit entries beside it.
     */
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

/** A store holding every half: what `openCache` returns and the CLI reads. */
export interface RecordCache extends RecordStore, PayloadStore {
    /**
     * Per-emit records currently retained, and those pruned since this cache
     * opened: the secondary tenant, holding the records kept under their own id
     * because folding them into their shape would hide something.
     *
     * Reported apart from `stats()` because the two are not comparable: a shape's
     * entry stands for every occurrence of it, and a per-emit entry for one.
     */
    recordStats(): {size: number; dropped: number};
}

/** The three halves of the store, as they appear in an entry's metadata. */
type EntryKind = 'template' | 'record' | 'payload';

const KIND_TEMPLATE: EntryKind = 'template';
const KIND_RECORD: EntryKind = 'record';
const KIND_PAYLOAD: EntryKind = 'payload';

/** The tenants, in the order an order is written: primary first. */
const ENTRY_KINDS: readonly EntryKind[] = [KIND_TEMPLATE, KIND_RECORD, KIND_PAYLOAD];

/**
 * The sweep marker, deliberately the same key the framework's pino transport
 * writes, so that a directory shared by both sweeps at most once per interval
 * rather than once per writer. Only the *marker* is shared: each writer prunes by
 * the bound it was opened with.
 */
const RETENTION_STATE_KEY = '__blong_retention_state__';

/** The sidecar holding writes that had to land synchronously. */
const SIDECAR_FILE = 'fatal.jsonl';

/**
 * The secondary index: the prune order, one line per write, beside the sidecar.
 *
 * It exists because `cacache` gives every key an index file of its own — a
 * directory of its own, in fact — so loading the order from `cacache.ls` reads
 * one file per live entry, and on this machine that was ten thousand files and
 * half a second before a process printed its first line. One append-only file
 * says the same thing in one read.
 */
const ORDER_FILE = 'order.jsonl';

/** The file recording a directory's last reclaim, beside the sidecar it owns. */
const RECLAIM_STATE_FILE = 'reclaim-state.json';

/**
 * How long a reclaim that found nothing to remove is trusted for.
 *
 * A scan is slow because the directory is large, and the directory is large
 * because it still holds the files of pruned entries — so once a reclaim has
 * found nothing left to remove, there is nothing for the next one to do. Without
 * this, every process to open the directory would read the whole of it again,
 * which on a directory large enough to trigger a reclaim is the delay the reclaim
 * exists to remove. A pass that *did* remove something arms the next one, so a
 * directory heals over as many opens as it takes.
 */
const RECLAIM_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * How many lines the secondary index may hold per retained entry before the pass
 * that rewrites it is due.
 *
 * Between passes the file gains a line per write and a line per removal, and a
 * process that logs at all logs far faster than it is swept: a development run
 * appends about eighty lines a second, so waiting for the daily pass would leave
 * a file of hundreds of megabytes to read at every open — the delay the index
 * exists to remove, put back. The threshold is generous enough that a pass costs
 * a rounding error against the traffic that earned it, and small enough that the
 * file stays a couple of megabytes.
 */
const ORDER_LINES_PER_ENTRY = 4;

/** What a directory's reclaim state file records. */
interface ReclaimState {
    /** When the last reclaim of the directory finished. */
    reclaimedAt?: number;
    /** How many index files it removed. */
    removed?: number;
}

/** Read a directory's reclaim state; an absent or unreadable file is "never". */
function readReclaimState(path: string): ReclaimState {
    try {
        return JSON.parse(readFileSync(path, 'utf8')) as ReclaimState;
    } catch {
        return {};
    }
}

/** Record a directory's reclaim, so the next open does not repeat it blindly. */
function writeReclaimState(path: string, state: ReclaimState): void {
    try {
        writeFileSync(path, JSON.stringify(state));
    } catch {
        // A directory that cannot be written is not something retention may fail
        // over; the cost is that the next open reclaims again.
    }
}

/** The sidecar's rewrite temporary; distinct so a leftover is recognisable. */
const SIDECAR_TEMPORARY_SUFFIX = '.tmp';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long opening the store may take before it counts as slow, matching the
 * framework's own margin for a step (`SLOW_STEP_MS` in `blong-lib`). This module
 * is a dependency of the emitter and takes no dependency of its own, so the value
 * is restated rather than imported.
 */
const DEFAULT_SLOW_MS = 1_000;

/** Reclaims already running in this process, by directory, so two opens do not race. */
const reclaiming = new Set<string>();

/**
 * How many index files are touched at once when removing or reclaiming them.
 *
 * Both passes are pure I/O over one small file per entry, so they are
 * latency-bound: reading the 450 000 files of a directory that had been growing
 * since before the fix one at a time took minutes, while the same reads
 * overlapped are bound by the filesystem. Kept well under what a filesystem will
 * queue.
 */
const INDEX_IO_CONCURRENCY = 32;

/** Run `task` over `items`, at most `limit` at a time. */
async function concurrent<T>(
    items: T[],
    limit: number,
    task: (item: T) => Promise<void>,
): Promise<void> {
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const item = items[next++];
            await task(item);
        }
    };
    await Promise.all(Array.from({length: Math.min(limit, items.length)}, () => worker()));
}

/** One line of the synchronous sidecar. */
interface SidecarEntry {
    id: string;
    time: number;
    kind: EntryKind;
    /** The shape the entry repeats, for the surface that has one. */
    shape?: string;
    /** The stored text, exactly as the asynchronous path would have written it. */
    json: string;
}

/** The metadata a stored entry carries; `cacache` types it as `unknown`. */
interface EntryMetadata {
    timestamp?: number;
    kind?: string;
    shape?: string;
    count?: number;
}

/** An entry as `cacache.ls` reports it, narrowed to the two fields used here. */
interface ListedEntry {
    key: string;
    metadata?: EntryMetadata | null;
}

/**
 * Which tenant an entry belongs to. An entry with no `kind` predates the field
 * — the framework's pino transport writes none — and is a per-emit record, so
 * mixing the two writers in one directory cannot make either invisible to
 * retention.
 */
function kindOf(entry: ListedEntry): EntryKind {
    const kind = entry.metadata?.kind;
    if (kind === KIND_PAYLOAD) {
        return KIND_PAYLOAD;
    }
    return kind === KIND_TEMPLATE ? KIND_TEMPLATE : KIND_RECORD;
}

/** The timestamp retention sorts by; a missing one sorts oldest. */
function timeOf(entry: ListedEntry): number {
    const timestamp = entry.metadata?.timestamp;
    return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : 0;
}

/** The shape an entry shares with its repeats, when it was stored with one. */
function shapeOf(entry: ListedEntry): string | undefined {
    const shape = entry.metadata?.shape;
    return typeof shape === 'string' && shape.length > 0 ? shape : undefined;
}

/** How many occurrences an entry stands for, when it says. */
function countOf(entry: ListedEntry): number | undefined {
    const count = entry.metadata?.count;
    return typeof count === 'number' && Number.isFinite(count) && count > 1 ? count : undefined;
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

/**
 * `cacache.rm.entry` with its third argument, which the published types do not
 * declare.
 *
 * `removeFully` is real: `cacache`'s own `lib/rm.js` hands the options to
 * `index.delete`, which removes the key's index file rather than appending a
 * deletion to it, and that is the whole point of this call. The types shipped for
 * `cacache` 20 model only the two-argument form, so the option is declared here
 * once instead of being cast at every use.
 */
const removeEntryFully = cacache.rm.entry as unknown as (
    cachePath: string,
    key: string,
    opts: {removeFully?: boolean},
) => Promise<unknown>;

/**
 * Remove one entry of the store, and the index file that held it.
 *
 * Without `removeFully`, `cacache.rm.entry` appends a deletion to the entry's
 * index file and leaves the file in place: it is the tombstone that makes the key
 * unreadable, not the file's absence. Since a cache key is hashed into an index
 * file of its own, a store keyed by unique ids would grow one file per entry ever
 * written, whatever its bound did, and every `cacache.ls` would read all of them.
 * Deleting the file is what makes a pruned entry stop costing anything.
 */
function removeEntry(dir: string, id: string): Promise<unknown> {
    return removeEntryFully(dir, id, {removeFully: true});
}

/**
 * One line of the secondary index.
 *
 * A write appends `{id, k}` — the entry and which of the three tenants it belongs
 * to — plus `s`, the shape a per-emit record belongs to, and `n`, the number of
 * occurrences a shape's entry stands for. A removal appends `{id, d}`: the id
 * alone, which is all it takes to drop it. Every field is optional so a line that
 * lost its tail to a crash is skipped rather than fatal, exactly as a torn
 * sidecar line is.
 */
interface OrderLine {
    /** The entry's id: a shape reference, a record id or a payload reference. */
    id?: string;
    /** The tenant: `template`, `record` or `payload`. */
    k?: string;
    /** The shape a per-emit record belongs to. */
    s?: string;
    /** How many occurrences the entry stands for. */
    n?: number;
    /** Present on a removal. */
    d?: number;
}

/**
 * One entry of the retention order.
 *
 * The order *is* the list: an entry's place in it is when it was last written,
 * which is why a line of the index carries no timestamp. The varying fields a log
 * line already prints — the time above all — have no business being duplicated
 * into the cache, and the order does not need them: appending a line puts the
 * entry last, appending it again when it is written again puts it last again.
 */
interface Retained {
    id: string;
    kind: EntryKind;
    /**
     * The shape a per-emit record belongs to, when it has one. Only the record
     * tenant carries it: for a shape's own entry the id is the shape.
     */
    shape?: string;
    /** How many occurrences the entry stands for. Only a shape has more than one. */
    count?: number;
    /**
     * Only a read of the truth reports one, and only to sort by: `cacache`'s
     * index records when each entry was written, and the sweep needs it to order
     * what it found before writing an order that is positional from then on.
     */
    time?: number;
}

/**
 * Read the secondary index, or `undefined` when there is none.
 *
 * The order the entries come back in is the order they were last written: a line
 * puts its entry last, and a line for an id that is already in the map moves it
 * there — which is what makes a repeated write a *refresh* of its place rather
 * than a second place. A removal drops the id.
 *
 * The file may be read while another process is appending to it: a line that is
 * half-written is skipped, and the lines that are complete say what they said
 * before.
 *
 * An absent file is *not* an empty store: it means the directory was written by
 * someone who does not keep this index — an older version, or the pino transport
 * — and the caller has to read `cacache`'s own index to find out what is there.
 * An empty file, which is what a store that was written to and pruned back to
 * nothing leaves, is the empty order and needs no scan.
 */
async function readOrder(path: string): Promise<{entries: Retained[]; lines: number} | undefined> {
    const raw = await readFile(path, 'utf8').catch(() => undefined);
    if (raw === undefined) {
        return undefined;
    }
    const latest = new Map<string, OrderLine>();
    let lines = 0;
    for (const line of raw.split('\n')) {
        if (!line) {
            continue;
        }
        lines += 1;
        let parsed: OrderLine;
        try {
            parsed = JSON.parse(line) as OrderLine;
        } catch {
            // A line that a crash cut in half. Losing it is losing one entry's
            // place in the order, which the next scan of the truth restores.
            continue;
        }
        if (parsed && typeof parsed.id === 'string') {
            // Deleted first so that the map's order is the order of *last*
            // occurrence: `set` on a key it already holds keeps the old position.
            latest.delete(parsed.id);
            latest.set(parsed.id, parsed);
        }
    }
    const entries: Retained[] = [];
    for (const [id, line] of latest) {
        if (line.d) {
            continue;
        }
        const kind =
            line.k === KIND_PAYLOAD
                ? KIND_PAYLOAD
                : line.k === KIND_TEMPLATE
                  ? KIND_TEMPLATE
                  : KIND_RECORD;
        entries.push({
            id,
            kind,
            shape: typeof line.s === 'string' && line.s.length > 0 ? line.s : undefined,
            count: typeof line.n === 'number' && line.n > 1 ? line.n : undefined,
        });
    }
    // The line count is what says whether the file is due a rewrite: it holds one
    // line per write and per removal since the last one, which is traffic, while
    // `entries` is what the store actually retains.
    return {entries, lines};
}

/**
 * Append one line to the secondary index.
 *
 * The append is what makes this file safe for several processes at once: a small
 * write to a file opened in append mode lands whole, so two writers interleave
 * lines rather than overwrite each other. That is the property the per-entry
 * store this module replaced did not have — it rewrote its index on every write,
 * which is a single-writer assumption, and it is why it was retired.
 *
 * A failure is swallowed: retention must never fail a log line, and an entry the
 * index never heard of is one the next scan of the truth finds anyway.
 */
async function appendOrder(path: string, line: OrderLine): Promise<void> {
    try {
        await appendFile(path, `${JSON.stringify(line)}\n`);
    } catch {
        // See above: the index is an optimisation over the truth, never the truth.
    }
}

/**
 * Rewrite the secondary index so that it holds only what is retained, oldest
 * first.
 *
 * This is the one write that is not an append, and it never happens on the write
 * path: only the pass that has just read the truth and pruned to the bound does
 * it, which is what keeps one process from competing with another over the file.
 * The new text is written beside the old one and renamed over it, so a reader
 * sees either the whole old file or the whole new one.
 */
async function compactOrder(path: string, retained: Retained[]): Promise<void> {
    const temporary = `${path}.tmp`;
    const text = retained.map(entry => `${JSON.stringify(orderLine(entry))}\n`).join('');
    try {
        await writeFile(temporary, text);
        await rename(temporary, path);
    } catch {
        await rm(temporary, {force: true}).catch(() => undefined);
    }
}

/**
 * Create the secondary index from an order that was just read from `cacache`.
 *
 * Only a process that has just scanned the truth does this, and only when there
 * is no index to adopt: a directory that predates the index, or one another
 * writer created entries in. Creating it is not the same as compacting it — the
 * file did not exist a moment ago, so there is nothing to lose by writing it —
 * and the exclusive flag makes the second of two processes racing here give way
 * rather than replace the first one's file, which says the same thing.
 */
async function createOrder(path: string, retained: Retained[]): Promise<void> {
    const text = retained.map(entry => `${JSON.stringify(orderLine(entry))}\n`).join('');
    try {
        await writeFile(path, text, {flag: 'wx'});
    } catch {
        // Already there: another process got here first, and its file is as good.
    }
}

/**
 * One retained entry as a line of the secondary index.
 *
 * Shared by the two writers — the pass that compacts the file and the pass that
 * creates it — so that a line written by one is read by the other identically.
 * The shape is written only for a per-emit record (for a shape's own entry the id
 * *is* the shape), and the count only where it says something: a line with no `n`
 * is one occurrence.
 */
function orderLine(entry: Retained): OrderLine {
    return {
        id: entry.id,
        k: entry.kind,
        ...(entry.shape ? {s: entry.shape} : {}),
        ...(entry.count && entry.count > 1 ? {n: entry.count} : {}),
    };
}

/**
 * Whether an index file holds no entry that is still readable.
 *
 * The line format is `cacache`'s: a hash, a tab, and the entry's JSON. A line
 * that does not parse is ignored rather than fatal — the same tolerance the
 * reader has — and the last entry for a key wins, because a deletion shadows
 * everything appended before it.
 */
async function isDeadIndexFile(path: string): Promise<boolean> {
    const raw = await readFile(path, 'utf8').catch(() => undefined);
    if (raw === undefined) {
        return false;
    }
    const latest = new Map<string, {integrity?: unknown}>();
    for (const line of raw.split('\n')) {
        const tab = line.indexOf('\t');
        if (tab < 0) {
            continue;
        }
        let entry: {key?: unknown; integrity?: unknown};
        try {
            entry = JSON.parse(line.slice(tab + 1)) as {key?: unknown; integrity?: unknown};
        } catch {
            continue;
        }
        if (entry && typeof entry.key === 'string') {
            latest.set(entry.key, entry);
        }
    }
    for (const entry of latest.values()) {
        if (entry.integrity) {
            return false;
        }
    }
    return true;
}

/**
 * Delete every index file of the store that holds nothing but deletions.
 *
 * A `put` appends an entry to the key's index file and a removal appends a
 * deletion that shadows it, so a file whose last surviving entry is a deletion
 * contributes nothing to the cache while still being read and parsed by every
 * `cacache.ls`. `cacache.verify` does not remove them: it rebuilds the index from
 * the entries it can still read, which means it walks entries and never the files
 * that no longer hold one.
 *
 * This pass walks the files, which is the only way to give back the space a
 * directory that predates the `removeFully` prune has accumulated. It judges a
 * file by what it holds rather than by where the index layout put it, so a
 * directory written by a different index version is still handled.
 */
export async function reclaimDeadIndexFiles(dir: string): Promise<number> {
    let removed = 0;
    const walk = async (path: string): Promise<void> => {
        const entries = await readdir(path, {withFileTypes: true}).catch(() => []);
        await concurrent(
            entries.filter(entry => entry.isFile()).map(entry => join(path, entry.name)),
            INDEX_IO_CONCURRENCY,
            async file => {
                if (await isDeadIndexFile(file)) {
                    await unlink(file).catch(() => undefined);
                    removed += 1;
                }
            },
        );
        for (const entry of entries) {
            if (entry.isDirectory()) {
                await walk(join(path, entry.name));
            }
        }
    };
    for (const entry of await readdir(dir, {withFileTypes: true}).catch(() => [])) {
        if (entry.isDirectory() && /^index-v\d+$/.test(entry.name)) {
            await walk(join(dir, entry.name));
        }
    }
    return removed;
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
    if (
        options.recordLimit !== undefined &&
        (!Number.isInteger(options.recordLimit) || options.recordLimit < 1)
    ) {
        throw new Error('openCache: recordLimit must be a positive integer');
    }

    const dir = options.dir;
    const limit = options.limit;
    const recordLimit = options.recordLimit ?? options.limit;
    const sweepIntervalMs = options.sweepIntervalMs ?? ONE_DAY_MS;
    const now = options.now ?? Date.now;
    const readOnly = options.readOnly === true;
    const slowMs = options.slowMs ?? DEFAULT_SLOW_MS;
    const log = options.log;
    const sidecarPath = join(dir, SIDECAR_FILE);
    const statePath = join(dir, RECLAIM_STATE_FILE);
    const orderPath = join(dir, ORDER_FILE);

    await mkdir(dir, {recursive: true});

    /** The bound one tenant is pruned to. The per-emit tenant has its own. */
    function limitOf(kind: EntryKind): number {
        return kind === KIND_RECORD ? recordLimit : limit;
    }

    // Retained counts, as this process knows them. Exact while this process is the
    // only writer, and corrected from `cacache.ls` on every sweep.
    let shapes = 0;
    let records = 0;
    let payloads = 0;
    let droppedShapes = 0;
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
     * Which entries this process is retaining, per tenant, in write order.
     *
     * Ids rather than objects, because the order is the *position*: an entry's
     * place in the list is when it was last written, which is all the prune needs
     * and the only thing the index stores. Held in memory because the alternative
     * is `cacache.ls` — a read of the whole index — and the bound is crossed by
     * *every* write once the store is full. Reading the index per write made one
     * log line cost about a second on a cache holding ten thousand records, which
     * is what turned a shutdown into a timeout the first time this store met real
     * traffic. The lists are loaded once at open and maintained on write and
     * eviction, so the write path pays one `put` and, at most, one `rm`.
     *
     * The cost of that is stated rather than hidden: an entry written by another
     * process in the same directory is not in these lists, so this process will
     * neither count nor prune it. A shared directory is therefore bounded by the
     * writer that swept, against the index *it* read at open — the same trade the
     * retired file store made, and the reason the pino transport's own sweep is
     * left in place beside this one.
     */
    const retained: Record<EntryKind, string[]> = {
        template: [],
        record: [],
        payload: [],
    };

    /**
     * Which ids each list holds, so a repeated write can be recognised without
     * scanning the list.
     *
     * A repeat is the ordinary case for a shape — every occurrence of an event
     * writes the same key — and it is a *real* write either way: a record replayed
     * from the sidecar, a store whose caller writes the same entry twice, a retry.
     * Counted as a second entry it would take the bound over by one and evict an
     * entry that should have stayed, which for a store whose promise is that a
     * reference still resolves is the worst kind of eviction. So the id is checked
     * here and, when it is already retained, moved to the newest place in the order
     * — a write is a write.
     */
    const membership: Record<EntryKind, Set<string>> = {
        template: new Set(),
        record: new Set(),
        payload: new Set(),
    };

    /**
     * How many occurrences each retained shape stands for, by shape reference.
     *
     * The primary tenant holds one entry per shape, so the entry is *not* the log
     * line: the count is what says whether a shape happened once or forty-one
     * times, and it is carried on the entry itself (in its metadata, and in the
     * index line) because a count that lived only in this process would be lost
     * with it. Kept in memory as well because the write path increments it once per
     * occurrence and may not read the store to do it.
     */
    const counts = new Map<string, number>();

    /**
     * The shape each retained per-emit record belongs to, by record id.
     *
     * Only the secondary tenant needs the direction: for the primary one the id
     * *is* the shape. A per-emit record carries it so that a reader — the inspector,
     * a drill-down — can say which shape a kept record came from, and so that the
     * index line says the same thing after a restart.
     */
    const shapesOf = new Map<string, string>();

    /**
     * The order an index read off `cacache` describes, oldest first.
     *
     * This is the truth, and the only place it is read: the secondary index is
     * built from this result and reconciled against it, never the other way
     * round. Only this reading reports times — `cacache` records when each entry
     * was written and the index does not — so the sort into the order belongs here
     * and nowhere else.
     */
    function orderOfIndex(index: Record<string, ListedEntry>): Retained[] {
        return Object.values(index)
            .filter(entry => entry.key !== RETENTION_STATE_KEY)
            .map(entry => ({
                id: entry.key,
                time: timeOf(entry),
                kind: kindOf(entry),
                shape: shapeOf(entry),
                count: countOf(entry),
            }))
            .sort((left, right) => (left.time ?? 0) - (right.time ?? 0));
    }

    /** Adopt an order as the retention lists, oldest first, and recount. */
    function adopt(entries: Retained[]): void {
        for (const kind of ENTRY_KINDS) {
            retained[kind] = entries.filter(entry => entry.kind === kind).map(entry => entry.id);
            membership[kind] = new Set(retained[kind]);
        }
        shapesOf.clear();
        counts.clear();
        for (const entry of entries) {
            if (entry.shape) {
                shapesOf.set(entry.id, entry.shape);
            }
            if (entry.kind === KIND_TEMPLATE) {
                counts.set(entry.id, entry.count ?? 1);
            }
        }
        recount();
    }

    /** The retained order, as the entries the secondary index holds. */
    function liveOrder(): Retained[] {
        return [
            ...retained[KIND_TEMPLATE].map(id => ({
                id,
                kind: KIND_TEMPLATE,
                count: counts.get(id) ?? 1,
            })),
            ...retained[KIND_RECORD].map(id => ({id, kind: KIND_RECORD, shape: shapesOf.get(id)})),
            ...retained[KIND_PAYLOAD].map(id => ({id, kind: KIND_PAYLOAD})),
        ];
    }

    /**
     * Append to the secondary index, unless this open was asked to write nothing.
     *
     * The three tenants and the prunes all go through here so that a `readOnly`
     * open — how the inspector opens a cache — cannot write the index by any
     * path, exactly as it cannot write the store.
     */
    const journal = (line: OrderLine): Promise<void> =>
        readOnly ? Promise.resolve() : appendOrder(orderPath, line);

    /**
     * Drop the oldest entries past one surface's bound, counting them. The removal
     * is what makes the bound an LRU-by-time, and it needs no index read: the list
     * is already in that order.
     *
     * The removals are overlapped because a directory shared by several writers can
     * hand one process a bound to enforce that is far larger than its own writes
     * left — the whole height of the shared store, tens of thousands of entries —
     * and this is the step an open waits for when it does. Each removal is one
     * unlink of one small file, so the cost is latency, which overlapping hides.
     */
    async function pruneKind(kind: EntryKind): Promise<number> {
        const bound = limitOf(kind);
        const list = retained[kind];
        const oldest = list.splice(0, Math.max(0, list.length - bound));
        for (const id of oldest) {
            membership[kind].delete(id);
            shapesOf.delete(id);
            counts.delete(id);
        }
        await concurrent(oldest, INDEX_IO_CONCURRENCY, async id => {
            await removeEntry(dir, id);
            // The index records what just happened, so that the next open knows
            // the entry is gone without reading `cacache` to find out.
            await journal({id, d: 1});
            if (kind === KIND_PAYLOAD) {
                droppedPayloads += 1;
            } else if (kind === KIND_RECORD) {
                droppedRecords += 1;
            } else {
                droppedShapes += 1;
            }
        });
        return oldest.length;
    }

    /** Adopt the retained counts after a removal. */
    function recount(): void {
        shapes = retained[KIND_TEMPLATE].length;
        records = retained[KIND_RECORD].length;
        payloads = retained[KIND_PAYLOAD].length;
    }

    /**
     * Run the retention pass over every tenant and rewrite the index.
     *
     * `daily` marks the pass the interval asks for, which is the one that also
     * collects the content nothing references any more and publishes the marker
     * that dates it: content collection reads every stored blob, so it belongs to
     * the pass that happens once a day rather than to one a busy process earns by
     * writing a few thousand lines.
     */
    async function sweep(daily: boolean): Promise<void> {
        let removed = 0;
        for (const kind of ENTRY_KINDS) {
            removed += await pruneKind(kind);
        }
        recount();
        if (removed > 0 && daily) {
            await cacache.verify(dir).catch(() => undefined);
        }
        // The pass that has just read the truth and pruned to the bound is the
        // only one that rewrites the secondary index. Between passes the file
        // accumulates the lines of everything written and pruned, and this is what
        // gives that back. Rewriting it here rather than on the write path is what
        // keeps two processes from overwriting each other's file: two writers may
        // append to one file, they cannot both rewrite it.
        if (!readOnly) {
            await compactOrder(orderPath, liveOrder());
        }
        if (daily) {
            await cacache.put(
                dir,
                RETENTION_STATE_KEY,
                Buffer.from(JSON.stringify({lastCleanup: now()})),
            );
        }
    }

    /**
     * Read `cacache`'s own index — the truth — adopt it, build the secondary index
     * from it, and report the pass if it was slow.
     *
     * This is the expensive way to learn the order, one file per live entry, and
     * it is now only what a directory that has no secondary index pays: a
     * directory written by this store is opened by reading one file.
     */
    async function scanIndex(): Promise<void> {
        const started = now();
        const index = (await cacache.ls(dir)) as Record<string, ListedEntry>;
        const scanMs = now() - started;
        const order = orderOfIndex(index);
        adopt(order);
        await createOrder(orderPath, order);
        if (!readOnly && slowMs > 0 && scanMs >= slowMs) {
            const entries = order.length;
            const state = readReclaimState(statePath);
            const due =
                typeof state.reclaimedAt !== 'number' ||
                now() - state.reclaimedAt >= RECLAIM_INTERVAL_MS ||
                (state.removed ?? 0) > 0;
            log?.warn?.(
                `reading the log cache index took ${scanMs}ms for ${entries} entries` +
                    (due ? '; reclaiming the files of pruned entries' : ''),
                {dir, entries, elapsedMs: scanMs},
            );
            if (due) {
                void reclaim();
            }
        }
    }

    /**
     * Delete the index files of entries that were pruned before this store
     * deleted them, then collect the content they orphaned.
     *
     * The pass is the repair for a directory that predates the `removeFully`
     * prune: those entries are unreadable but their files are still there, and
     * there are as many of them as entries ever written — which is what made
     * reading the index take seconds. It runs when the index scan at open turned
     * out to be slow, in the background so that the delay it repairs is not paid
     * twice, and only once per directory per process.
     *
     * The content pass is conditional because it is the expensive half: it reads
     * every stored blob. A directory with no dead index files has no orphaned
     * content worth that, so `removed === 0` stops there.
     */
    async function reclaim(): Promise<void> {
        if (reclaiming.has(dir)) {
            return;
        }
        reclaiming.add(dir);
        try {
            const started = now();
            const removed = await reclaimDeadIndexFiles(dir);
            if (removed > 0) {
                log?.warn?.(
                    `the log cache held ${removed} index file(s) left by pruned entries; removing` +
                        ' them and collecting the content they orphaned',
                    {dir, removed, elapsedMs: now() - started},
                );
                await cacache.verify(dir).catch(() => undefined);
            }
            writeReclaimState(statePath, {reclaimedAt: now(), removed});
            if (removed > 0) {
                log?.info?.('the log cache was reclaimed', {
                    dir,
                    removed,
                    elapsedMs: now() - started,
                });
            }
        } catch (error) {
            // A reclaim is housekeeping: a directory that cannot be walked, or a
            // content pass that fails, must not fail the logger that triggered it.
            log?.warn?.('the log cache could not be reclaimed', {dir, error: String(error)});
        } finally {
            reclaiming.delete(dir);
        }
    }

    /**
     * The pass an open performs: take the order from the secondary index, and
     * reconcile with the truth only when the interval has elapsed.
     *
     * The index is what makes an open cheap: reading it is one file, while
     * reading the truth is one file per live entry — ten thousand of them here,
     * and half a second before a process printed its first line. So it is read
     * first, and `cacache` is read only when it cannot answer: no index yet (a
     * directory written before this index existed, or by a writer that does not
     * keep one), or an interval that has come round.
     *
     * That second read is the reconciliation, and it is what keeps the index
     * honest: whatever it says, the truth wins, the bound is re-applied to what
     * is really there, and the index is rewritten from that. A stale index can
     * therefore only ever make the store *slower to notice* entries it does not
     * know about, never wrong about the ones it does.
     *
     * The scan is measured, and a slow one is both reported and repaired: the
     * time it takes is the number of index files, so a scan that took a second
     * and more is a directory holding the files of entries that were pruned long
     * ago (see `reclaim`). That measurement is also the gate for the repair — a
     * directory that has been reclaimed scans quickly and is left alone, which is
     * why no marker has to record that it happened.
     *
     * A read-only open loads the lists from the truth and stops: an inspection
     * must not be the thing that evicts an entry, nor create an index in a
     * directory it was only asked to describe.
     */
    async function maintainOnOpen(): Promise<void> {
        let lastCleanup = 0;
        try {
            const state = JSON.parse(
                (await cacache.get(dir, RETENTION_STATE_KEY)).data.toString(),
            ) as {
                lastCleanup?: number;
            };
            if (typeof state.lastCleanup === 'number' && Number.isFinite(state.lastCleanup)) {
                lastCleanup = state.lastCleanup;
            }
        } catch {
            // No marker yet — a fresh store, or one written by a transport that
            // predates the sweep.
        }
        if (readOnly) {
            adopt(orderOfIndex((await cacache.ls(dir)) as Record<string, ListedEntry>));
            return;
        }
        const order = await readOrder(orderPath);
        if (order) {
            adopt(order.entries);
        } else {
            // No secondary index: learn the order the expensive way and write one.
            await scanIndex();
        }
        // A pass is due when the interval has elapsed, and also when the index has
        // grown well past what it holds. Either way the truth is read first: that
        // is what makes the rewrite complete rather than one process's view of a
        // store other processes are writing to.
        const overdue = now() - lastCleanup >= sweepIntervalMs;
        const oversized =
            order !== undefined && order.lines > ORDER_LINES_PER_ENTRY * (order.entries.length + 1);
        if (overdue || oversized) {
            await scanIndex();
            await sweep(overdue);
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
                // Through the same path a live write takes, so a replayed record of a
                // shape that is already retained folds into it rather than sitting
                // beside it.
                await write(entry.kind, entry.id, entry.time, entry.json, entry.shape);
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
     * Queue one write and keep the tenant's bound.
     *
     * The bound is hard rather than approximate: the moment a tenant is over it,
     * the prune runs, so the store never holds more than the bound plus the one
     * that just crossed. That is the same amortisation the retired store had — it
     * rewrote its index on every write at capacity — with the index scan instead of
     * the rewrite.
     *
     * A shape entry is the ordinary case, and it is written once per occurrence
     * under the *shape's* key: the content is replaced by the newest occurrence, the
     * count goes up, and the entry moves to the newest place. So a shape that every
     * run emits keeps a place at the bound while the one-off records written after
     * it age out, and a reference to the shape always resolves to the most recent
     * time it happened. That is what the count is for: the entry is not the log
     * line, and the count is what says whether the shape happened once or
     * forty-one times.
     */
    async function write(
        kind: EntryKind,
        id: string,
        time: number,
        json: string,
        shape?: string,
    ): Promise<void> {
        const safe = requireSafeId(id, kind);
        return enqueue(async () => {
            const counted = kind === KIND_TEMPLATE ? (counts.get(safe) ?? 0) + 1 : undefined;
            await cacache.put(dir, safe, json, {
                metadata: {
                    timestamp: time,
                    kind,
                    ...(kind === KIND_RECORD && shape ? {shape} : {}),
                    ...(counted !== undefined && counted > 1 ? {count: counted} : {}),
                },
            });
            // The entry's place in the order, recorded where the next open will
            // find it in one read. Appended after the `put`: an index that names an
            // entry the store does not have costs a pointless removal, while an
            // entry the index never heard of is one the store will not count.
            await journal({
                id: safe,
                k: kind,
                ...(kind === KIND_RECORD && shape ? {s: shape} : {}),
                ...(counted !== undefined && counted > 1 ? {n: counted} : {}),
            });
            if (counted !== undefined) {
                counts.set(safe, counted);
            }
            if (kind === KIND_RECORD && shape) {
                shapesOf.set(safe, shape);
            }
            if (membership[kind].has(safe)) {
                // A repeat write of one id is a refresh: the entry moves to the
                // newest place rather than appearing twice. Only the position is
                // dropped — the content was just written, and the index line above
                // already puts the id last.
                const at = retained[kind].indexOf(safe);
                if (at >= 0) {
                    retained[kind].splice(at, 1);
                }
            } else {
                membership[kind].add(safe);
            }
            retained[kind].push(safe);
            recount();
            if (retained[kind].length > limitOf(kind)) {
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

    // The order comes first: a replayed entry is added to lists that have already
    // been adopted, and a shape's count is only right if the count it continues was
    // read before the replay appended to it.
    await maintainOnOpen();
    await replaySidecar();

    /**
     * Append one entry to the sidecar, swallowing a failure as the path promises.
     *
     * The id is resolved *inside* the guard: an unsafe one is refused by throwing,
     * and this is the `fatal` path, where an escaping throw aborts the process the
     * record exists to report.
     */
    function appendQuietly(entry: SidecarEntry): void {
        try {
            appendSidecar({...entry, id: requireSafeId(entry.id, entry.kind)});
        } catch {
            // Swallowed by contract — see `RecordStore.putSync`.
        }
    }

    return {
        // `async` so that an unsafe id is reported as a rejection rather than a
        // synchronous throw: the interface promises a promise, and a caller that
        // logs must never have to guard the call itself.
        put: async (record: LogRecord): Promise<void> => {
            const shape = shapeKeyOf(record);
            const json = JSON.stringify(record);
            const writes: Array<Promise<void>> = [];
            if (shape) {
                writes.push(write(KIND_TEMPLATE, shape, record.time, json));
            }
            if (!shape || denoiseHidesDetails(record)) {
                // One entry of its own, beside its shape. A record with no shape has
                // no shape entry to fold into, so this is the only place it can go.
                writes.push(write(KIND_RECORD, record.id, record.time, json, shape));
            }
            await Promise.all(writes);
        },
        putSync: (record: LogRecord): void => {
            const shape = shapeKeyOf(record);
            const json = JSON.stringify(record);
            if (shape) {
                appendQuietly({
                    id: shape,
                    time: record.time,
                    kind: KIND_TEMPLATE,
                    json,
                });
            }
            if (!shape || denoiseHidesDetails(record)) {
                appendQuietly({
                    id: record.id,
                    time: record.time,
                    kind: KIND_RECORD,
                    shape,
                    json,
                });
            }
        },
        get: async (id: string): Promise<LogRecord | undefined> =>
            parseStored<LogRecord>(await read(id)),
        putPayload: (id: string, time: number, json: string): Promise<void> =>
            write(KIND_PAYLOAD, id, time, json),
        putPayloadSync: (id: string, time: number, json: string): void => {
            try {
                appendSidecar({
                    id: requireSafeId(id, KIND_PAYLOAD),
                    time,
                    kind: KIND_PAYLOAD,
                    json,
                });
            } catch {
                // Swallowed by contract, exactly as `putSync` is: the reference is
                // then a dead link, which a failure to write it in the first place
                // already is.
            }
        },
        getPayload: async (id: string): Promise<unknown | undefined> =>
            parseStored<unknown>(await read(id)),
        stats: () => ({size: shapes, dropped: droppedShapes}),
        recordStats: () => ({size: records, dropped: droppedRecords}),
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
        .filter(entry => entry.key !== RETENTION_STATE_KEY && kindOf(entry) !== KIND_PAYLOAD)
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
