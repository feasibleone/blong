/**
 * Allure trend history, persisted in the repository instead of a gist.
 *
 * The committed file is `.github/history.jsonl` at the repository root: one
 * JSON record per test result, each tagged with the `package` it came from.
 * Runners never touch it directly — before generating a report a runner copies
 * *its own* tagged slice into `<pkg>/.ci-report/history.jsonl` (with the tag
 * stripped, so Allure sees its native format), lets `allure awesome` append the
 * current run to that slice, and `blong-dev ci-report` later rebuilds the
 * committed file as "other packages unchanged + our slice as it now stands".
 *
 * Rebuilding rather than appending keeps the file anchored to `main`: repeated
 * runs of the same pull request produce the same content instead of piling up.
 */

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

import {reportPath} from './reportPaths.ts';

/** Repository-relative path of the committed history file. */
export const HISTORY_FILE = join('.github', 'history.jsonl');

/** Field used to attribute a record to a package. */
export const HISTORY_TAG = 'package';

/** File holding one package's slice of the history, next to its other reports. */
export const HISTORY_SLICE = 'history.jsonl';

/**
 * Runs kept per package in the committed history.
 *
 * Allure writes one record per run, and each record carries every test result of
 * that run, so the file grows by tens of kilobytes per run per package. The trend
 * charts only look at recent runs, so a small bound keeps the committed file
 * (which everyone's checkout pays for) in the low hundreds of kilobytes.
 */
export const DEFAULT_HISTORY_LIMIT = 20;

export type HistoryRecord = Record<string, unknown>;

/** Parse a JSONL file, ignoring blank lines and content that is not valid JSON. */
export function parseHistory(content: string): HistoryRecord[] {
    const records: HistoryRecord[] = [];
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        try {
            const parsed = JSON.parse(trimmed) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                records.push(parsed as HistoryRecord);
            }
        } catch {
            // A corrupt line must not invalidate the whole history.
        }
    }
    return records;
}

/** Read a history file, returning an empty list when it does not exist yet. */
export function readHistory(file: string): HistoryRecord[] {
    return existsSync(file) ? parseHistory(readFileSync(file, 'utf8')) : [];
}

/** Absolute path of the committed history file for a repository root. */
export function historyFile(root: string): string {
    return join(root, HISTORY_FILE);
}

/** Records attributed to `pkg`, with the attribution tag removed. */
export function sliceForPackage(records: readonly HistoryRecord[], pkg: string): HistoryRecord[] {
    const slice: HistoryRecord[] = [];
    for (const record of records) {
        if (record[HISTORY_TAG] !== pkg) continue;
        const {[HISTORY_TAG]: _ignored, ...rest} = record;
        slice.push(rest);
    }
    return slice;
}

/** Write this package's slice, ready for `allure awesome --history-path`. */
export function writeSlice(cwd: string, records: readonly HistoryRecord[]): string {
    const file = reportPath(cwd, HISTORY_SLICE, true);
    writeFileSync(
        file,
        records.map(record => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''),
    );
    return file;
}

export interface IRebuildHistoryOptions {
    /** Packages whose slices are being replaced, mapped to their new records. */
    slices: Map<string, readonly HistoryRecord[]>;
    /** Maximum number of records kept per package (newest last). */
    limit?: number;
}

/**
 * Rebuild the committed history: every record that does not belong to one of
 * the rebuilt packages is preserved verbatim, and each rebuilt package's slice
 * is (re)tagged and appended with its newest `limit` records.
 */
export function rebuildHistory(
    base: readonly HistoryRecord[],
    options: IRebuildHistoryOptions,
): string {
    const {slices, limit = DEFAULT_HISTORY_LIMIT} = options;
    const kept = base.filter(record => {
        const tag = record[HISTORY_TAG];
        return typeof tag !== 'string' || !slices.has(tag);
    });

    const rebuilt: HistoryRecord[] = [];
    for (const [pkg, records] of slices) {
        const bounded = records.slice(-limit);
        for (const record of bounded) rebuilt.push({...record, [HISTORY_TAG]: pkg});
    }

    const all = [...kept, ...rebuilt];
    // One line per record. Sorting by package tag — the tag the `.gitattributes`
    // merge driver unions on — keeps the file stable when a package is added or
    // moved, so the committed diff shows only the records that actually changed.
    // Sort is stable, so a package's own records keep their run order.
    const tagOf = (record: HistoryRecord) =>
        typeof record[HISTORY_TAG] === 'string' ? (record[HISTORY_TAG] as string) : '';
    all.sort((left, right) => tagOf(left).localeCompare(tagOf(right)));
    return all.length > 0 ? all.map(record => JSON.stringify(record)).join('\n') + '\n' : '';
}

/** Ensure the parent directory of a file exists before writing it. */
export function ensureParent(file: string): void {
    mkdirSync(dirname(file), {recursive: true});
}
