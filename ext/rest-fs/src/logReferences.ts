import * as cacache from 'cacache';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * The reference group a lukaot line prints, and what each member resolves against.
 *
 * A line ends with `[<member> <member> …]`, and every member is one of five things:
 * `lukaot://r/<id>` (one emitted record), `lukaot://t/<shape>` (the newest record of a shape),
 * `lukaot://x/<trace>` (the records of one trace), `lukaot://p/<id>` (a retained payload), and
 * `p=<id>` (the record that caused this one).
 *
 * The record, the shape and the payload are read out of the local `cacache` store — one key lookup
 * each, which is why a click is instant. A trace and a parent are not keys: the store keeps one entry
 * per shape plus the per-emit records whose fold would hide something, so a trace is answered by
 * scanning what is retained and a parent by looking for a record that may not have been kept at all.
 * The listing a trace opens says so in as many words, and names the command that prints the same rows
 * (@@D-1041).
 */

/** The reference kinds, spelled the way `core/lukaot/src/refs.ts` spells them. */
export type ReferenceKind = 'record' | 'template' | 'trace' | 'payload';

/**
 * Every path segment a reference may carry, long or short.
 *
 * The writer uses the single letters (`refs.ts`'s `KIND_SEGMENT`); the long names are accepted
 * because a hand-written note or a doc page writes what the segment means.
 */
export const KIND_BY_SEGMENT: Readonly<Record<string, ReferenceKind>> = {
    r: 'record',
    record: 'record',
    t: 'template',
    template: 'template',
    x: 'trace',
    trace: 'trace',
    p: 'payload',
    payload: 'payload',
};

/**
 * A `lukaot://` reference anywhere in a line or a document.
 *
 * Not anchored to the end of the line: the group carries several members, so the terminal provider
 * has to find each of them, and a document may quote a reference in the middle of a sentence.
 */
export const LOG_REFERENCE_RE =
    /\blukaot:\/\/(r|record|t|template|x|trace|p|payload)\/([A-Za-z0-9\-._~%]+)/g;

/**
 * The parent member of the group: `p=<id>`.
 *
 * Deliberately not a URI, and deliberately still linked here: it names the record that caused this
 * one, which is the step a reader takes when walking a chain root-first. The renderer keeps the bare
 * label because an id alone has no store of its own to name — but a *record* id is exactly what it
 * is, so the editor opens it as one and says when the store no longer holds it.
 */
export const PARENT_REFERENCE_RE = /\bp=([A-Za-z0-9\-._~%]+)/g;

/** The default store, as the CLI and the transport assume it. */
export const DEFAULT_CACHE_PATH = '~/.blong/log-cache';

/** Expand a leading `~` against the home directory. */
export function cachePathOf(configured: string | undefined): string {
    const raw = configured && configured.trim() ? configured.trim() : DEFAULT_CACHE_PATH;
    return raw.startsWith('~') ? path.join(os.homedir(), raw.slice(1)) : raw;
}

/** The URI a reference kind and id are opened through. */
export function referenceUri(kind: ReferenceKind, id: string): string {
    const segment =
        kind === 'record' ? 'r' : kind === 'template' ? 't' : kind === 'trace' ? 'x' : 'p';
    return `lukaot://${segment}/${encodeURIComponent(id)}`;
}

/** One entry read back from the store. */
export interface IStoredEntry {
    /** The cacache key, which is the reference's id. */
    id: string;
    /** The entry's timestamp: the pino `time`, from the entry metadata. */
    time: number;
    /** The parsed record or payload. */
    value: unknown;
}

/** Read one entry by its id, or `undefined` when the store no longer holds it. */
export async function readEntry(cachePath: string, id: string): Promise<IStoredEntry | undefined> {
    try {
        const result = await cacache.get(cachePath, id);
        const metadata = result.metadata as {timestamp?: number} | undefined;
        return {
            id,
            time: typeof metadata?.timestamp === 'number' ? metadata.timestamp : 0,
            value: JSON.parse(result.data.toString()) as unknown,
        };
    } catch {
        // Absent, pruned, or unreadable: all three mean "not retained", which is a normal
        // answer for a cache and must not be reported as a failure of the click.
        return undefined;
    }
}

/** One row of the store, as the trace scan needs it. */
export interface IStoredRow {
    id: string;
    time: number;
    value: Record<string, unknown>;
}

/** How many entries the store is read with at once — the CLI uses the same number. */
const SCAN_CONCURRENCY = 32;

/** The retention marker this store shares with the framework's pino transport. */
const RETENTION_STATE_KEY = '__blong_retention_state__';

/**
 * Every entry the store holds, read at most once a minute.
 *
 * The scan answers a trace, which no key carries. It is remembered because a trace link is followed
 * in runs — several lines of one request print the same trace — and the store's bound keeps the row
 * list small enough to hold. The lifetime is short on purpose: a log store is written to while a
 * reader watches it, and a listing that quietly stopped at the moment of the first click would be
 * worse than the second of scanning (@@D-1041).
 */
const scanned = new Map<string, {at: number; rows: Promise<IStoredRow[]>}>();

/** How long a scan is trusted for, in milliseconds. */
const SCAN_TTL_MS = 60_000;

/** Every entry the store holds, newest last. Rejects only if the directory cannot be listed. */
export async function scanStore(cachePath: string): Promise<IStoredRow[]> {
    const remembered = scanned.get(cachePath);
    if (remembered && Date.now() - remembered.at < SCAN_TTL_MS) {
        return remembered.rows;
    }
    const scan = (async (): Promise<IStoredRow[]> => {
        const index = await cacache.ls(cachePath);
        const keys = Object.keys(index).filter(key => key !== RETENTION_STATE_KEY);
        const rows: IStoredRow[] = [];
        let cursor = 0;
        const workers = Array.from({length: Math.min(SCAN_CONCURRENCY, keys.length)}, async () => {
            while (cursor < keys.length) {
                const key = keys[cursor++];
                const info = index[key];
                const metadata = info?.metadata as {kind?: string; timestamp?: number} | undefined;
                if (metadata?.kind === 'payload') {
                    continue;
                }
                try {
                    const result = await cacache.get(cachePath, key);
                    const parsed = JSON.parse(result.data.toString()) as unknown;
                    if (typeof parsed !== 'object' || parsed === null) {
                        continue;
                    }
                    const stamp = (result.metadata as {timestamp?: number} | undefined)?.timestamp;
                    rows.push({
                        id: key,
                        time: typeof stamp === 'number' ? stamp : (info?.time ?? 0),
                        value: parsed as Record<string, unknown>,
                    });
                } catch {
                    // A pruned or unreadable entry is not part of what the store holds.
                }
            }
        });
        await Promise.all(workers);
        return rows.sort(
            (left, right) => left.time - right.time || left.id.localeCompare(right.id),
        );
    })();
    scanned.set(cachePath, {at: Date.now(), rows: scan});
    try {
        return await scan;
    } catch (error) {
        scanned.delete(cachePath);
        throw error;
    }
}

/** Drop the cached scan, so the next click sees what the store holds now. */
export function invalidateStoreScan(cachePath?: string): void {
    if (cachePath === undefined) {
        scanned.clear();
        return;
    }
    scanned.delete(cachePath);
}

/** The trace an entry belongs to, whichever writer's shape it was stored in. */
function traceOf(row: IStoredRow): string | undefined {
    const refs = row.value['refs'] as {trace?: unknown} | undefined;
    if (refs && typeof refs.trace === 'string') {
        return refs.trace;
    }
    // The framework's pino transport writes a pino entry, which spells the same fact `traceId`.
    const traceId = row.value['traceId'];
    return typeof traceId === 'string' ? traceId : undefined;
}

/** The service or component that wrote an entry. */
function serviceOf(row: IStoredRow): string {
    for (const key of ['service', 'context', 'name']) {
        const value = row.value[key];
        if (typeof value === 'string' && value) {
            return value;
        }
    }
    return '?';
}

/** The level of an entry, as a name. */
function levelOf(row: IStoredRow): string {
    const named = row.value['levelName'];
    if (typeof named === 'string') {
        return named;
    }
    const numeric = row.value['level'];
    if (typeof numeric === 'string') {
        return numeric;
    }
    if (typeof numeric === 'number') {
        const names: Record<number, string> = {
            10: 'trace',
            20: 'debug',
            30: 'info',
            40: 'warn',
            50: 'error',
            60: 'fatal',
        };
        return names[numeric] ?? String(numeric);
    }
    return 'info';
}

/** The message of an entry, which both writers spell `msg`. */
function messageOf(row: IStoredRow): string {
    const msg = row.value['msg'];
    return typeof msg === 'string' ? msg : '';
}

/** The declared identifier the entry was written for, when it names one. */
function signalOf(row: IStoredRow): string {
    const signal = row.value['signal'];
    return typeof signal === 'string' ? signal : '';
}

/** One line for a row: time, level, service, signal and message. */
function rowLine(row: IStoredRow): string {
    const time = new Date(row.time).toISOString();
    const signal = signalOf(row);
    const parts = [
        time,
        levelOf(row).padEnd(5),
        serviceOf(row).padEnd(24),
        signal ? signal.padEnd(30) : ' '.repeat(30),
        messageOf(row).replace(/[\r\n]+/g, ' '),
    ];
    return parts.join(' ').trimEnd();
}

/**
 * The reference a row is followed by: the shape it stands for, or the record itself.
 *
 * The key an entry is stored under says which it is. A shape entry is keyed by the shape and holds
 * its newest occurrence, whose own id the store did **not** keep — so the row links to its shape. An
 * entry kept under the record's own id is that record, and links to it. Printing both would offer a
 * record link that resolves to a shape, which is the one thing a reference must never do.
 */
function rowRefs(row: IStoredRow): string {
    const ownId = typeof row.value['id'] === 'string' ? row.value['id'] : row.id;
    return row.id === ownId
        ? `[${referenceUri('record', ownId)}]`
        : `[${referenceUri('template', row.id)}]`;
}

/**
 * A trace, as the local store retained it.
 *
 * What this is *not*: a replay. The store keeps one entry per shape, so a trace that emitted the
 * same shape four times is one row here and four at the service. The header says so, and names the
 * CLI command that prints the same rows, because the alternative — a listing that looks complete and
 * is not — is worse than no listing (@@D-1041).
 */
export function traceListing(
    traceId: string,
    rows: readonly IStoredRow[],
    cachePath: string,
): string {
    const matched = rows.filter(row => traceOf(row) === traceId);
    const header = [
        `trace ${traceId}`,
        `${matched.length} record(s) retained locally in ${cachePath}`,
        '',
        'The local store keeps one entry per shape, so a shape emitted four times is one row here',
        'and four at the service. This is what was still on disk, not a replay of the request.',
        `Same rows on the command line: blong-dev log --trace-id ${traceId} --output pretty`,
        '',
    ];
    if (matched.length === 0) {
        header.push(
            'Nothing retained under this trace. The store is bounded, so a trace older than',
        );
        header.push('the bound is gone; the service keeps the lineage the bound drops.');
        return `${header.join('\n')}\n`;
    }
    const body = matched.flatMap(row => [`${rowLine(row)}`, `    ${rowRefs(row)}`]);
    return `${header.join('\n')}\n${body.join('\n')}\n`;
}

/** The text shown when a reference no longer resolves. */
export function missingEntry(kind: ReferenceKind, id: string, cachePath: string): string {
    const what =
        kind === 'payload'
            ? 'The payload was pruned, or the store never retained it.'
            : kind === 'record'
              ? 'A record is kept under its own id only when folding it into its shape would hide something — a withheld payload, or an error.'
              : 'The store keeps one entry per shape, and the retention bound has pruned this one.';
    return [
        `${kind} ${id} — not retained`,
        '',
        `Store: ${cachePath}`,
        '',
        what,
        '',
        `Retained entries, newest last: blong-dev log --cache-path ${cachePath} --limit 20`,
    ].join('\n');
}

/** The JSON a record or payload reference opens, pretty-printed. */
export function entryText(kind: ReferenceKind, entry: IStoredEntry): string {
    return JSON.stringify(
        kind === 'payload' ? {id: entry.id, payload: entry.value} : entry.value,
        null,
        2,
    );
}
