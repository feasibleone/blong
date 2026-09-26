/**
 * Pino transport that caches log entries to disk via cacache.
 *
 * Each log entry is stored using its ULID `id` as the cache key.
 * The log timestamp is stored in the entry's cacache metadata so that
 * a retention cleanup can sort and prune the oldest entries without
 * reading their full content.
 *
 * Usage in Pino configuration:
 * ```typescript
 * import pino from 'pino';
 *
 * const logger = pino({
 *     transport: {
 *         target: './pino-cacache.ts',
 *         options: {
 *             cachePath: '/tmp/blong-log-cache',
 *             stripKeys: ['id', 'time'],
 *             retentionCount: 10000,
 *         },
 *     },
 * });
 * ```
 */

import * as cacache from 'cacache';
import os from 'node:os';
import path from 'node:path';
import build from 'pino-abstract-transport';

function resolveHome(filepath: string): string {
    return filepath.startsWith('~/') ? path.join(os.homedir(), filepath.slice(2)) : filepath;
}

export interface CacacheTransportOptions {
    /** Directory where cacache stores log entries. */
    cachePath: string;
    /** Keys to strip from each stored log entry (default: ['id', 'time']). */
    stripKeys?: string[];
    /** Maximum number of log entries to retain (default: 10000). */
    retentionCount?: number;
}

const RETENTION_STATE_KEY = '__blong_retention_state__';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `cacache.rm.entry` with its third argument, which the published types do not
 * declare.
 *
 * `removeFully` is real: `cacache`'s own `lib/rm.js` hands the options to
 * `index.delete`, which removes the key's index file rather than appending a
 * deletion to it. The types shipped for `cacache` 20 model only the two-argument
 * form, so the option is declared here once instead of being cast at the call.
 */
const removeEntryFully = cacache.rm.entry as unknown as (
    cachePath: string,
    key: string,
    opts: {removeFully?: boolean},
) => Promise<unknown>;

/**
 * How long a retention step may take before it is reported.
 *
 * The transport runs in a pino worker thread with no logger of its own, so it
 * writes to stderr — which is where the loader's own messages go, and where a
 * reader of the process's output will see it. Matches the framework's margin for
 * a slow step: a retention pass that took longer is the kind of delay that has
 * cost a start its first seconds.
 */
const SLOW_STEP_MS = 1_000;

function reportSlow(step: string, started: number, details?: Record<string, unknown>): void {
    const elapsedMs = Date.now() - started;
    if (elapsedMs < SLOW_STEP_MS) {
        return;
    }
    process.stderr.write(
        `warn  pino-cacache ${step} took ${elapsedMs}ms` +
            (details ? ` ${JSON.stringify(details)}` : '') +
            '\n',
    );
}

async function pruneOldEntries(cachePath: string, retentionCount: number): Promise<void> {
    const scanStarted = Date.now();
    const index = await cacache.ls(cachePath);
    reportSlow('index scan', scanStarted, {entries: Object.keys(index).length});

    // Collect all real log entries (skip the retention-state entry itself)
    const entries = Object.values(index).filter(e => e.key !== RETENTION_STATE_KEY);

    if (entries.length <= retentionCount) {
        return;
    }

    // Sort ascending by stored timestamp so we delete the oldest first
    entries.sort((a, b) => {
        const ta: number = (a.metadata as {timestamp?: number} | null)?.timestamp ?? 0;
        const tb: number = (b.metadata as {timestamp?: number} | null)?.timestamp ?? 0;
        return ta - tb;
    });

    const pruneStarted = Date.now();
    const toDelete = entries.slice(0, entries.length - retentionCount);
    for (const entry of toDelete) {
        // `removeFully` deletes the entry's index file. Without it `cacache`
        // appends a deletion and keeps the file, so the index grows one file per
        // entry ever written — and `cacache.ls` above, which reads all of them,
        // becomes the slowest thing a process does. See
        // `core/semantic-log/src/cache.ts`, which shares this directory and makes
        // the same call.
        await removeEntryFully(cachePath, entry.key, {removeFully: true});
    }

    // Garbage-collect content that is no longer referenced by any index entry
    const verifyStarted = Date.now();
    await cacache.verify(cachePath);
    reportSlow('retention pass', pruneStarted, {
        pruned: toDelete.length,
        verifyMs: Date.now() - verifyStarted,
    });
}

async function retentionCheckRun(cachePath: string, retentionCount: number): Promise<void> {
    let lastCleanup = 0;

    try {
        const stateEntry = await cacache.get(cachePath, RETENTION_STATE_KEY);
        const state = JSON.parse(stateEntry.data.toString()) as {lastCleanup: number};
        lastCleanup = state.lastCleanup;
    } catch {
        // No state yet — treat as never cleaned up
    }

    if (Date.now() - lastCleanup < ONE_DAY_MS) {
        return;
    }

    await pruneOldEntries(cachePath, retentionCount);

    const state = JSON.stringify({lastCleanup: Date.now()});
    await cacache.put(cachePath, RETENTION_STATE_KEY, Buffer.from(state));
}

export default async function transport(options: CacacheTransportOptions) {
    const {
        cachePath: rawCachePath,
        stripKeys = ['id', 'time', 'pid'],
        retentionCount = 10000,
    } = options;
    const cachePath = resolveHome(rawCachePath);

    // Run retention check once on transport startup (at most once per day)
    retentionCheckRun(cachePath, retentionCount).catch((error: unknown) => {
        // Retention errors must not crash the transport — but a retention that
        // fails is why a cache grows without bound, so it is reported rather than
        // swallowed: silently skipping the pass is indistinguishable from running
        // it and finding nothing to do.
        process.stderr.write(`warn  pino-cacache retention failed: ${String(error)}\n`);
    });

    return build(async function (source) {
        for await (const obj of source) {
            const entry: Record<string, unknown> =
                typeof obj === 'string' ? (JSON.parse(obj) as Record<string, unknown>) : obj;

            const id = entry.id as string | undefined;
            const timestamp = entry.time as number | undefined;

            if (!id) {
                continue;
            }

            // Strip configured keys before storing
            const stripped: Record<string, unknown> = {...entry};
            for (const key of stripKeys) {
                delete stripped[key];
            }

            await cacache
                .put(cachePath, id, Buffer.from(JSON.stringify(stripped)), {
                    metadata: {timestamp},
                })
                .catch(() => {
                    // Storage errors must not crash the transport
                });
        }
    });
}
