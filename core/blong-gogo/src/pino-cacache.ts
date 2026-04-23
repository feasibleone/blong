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

import build from 'pino-abstract-transport';
import * as cacache from 'cacache';

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

async function pruneOldEntries(cachePath: string, retentionCount: number): Promise<void> {
    const index = await cacache.ls(cachePath);

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

    const toDelete = entries.slice(0, entries.length - retentionCount);
    for (const entry of toDelete) {
        await cacache.rm.entry(cachePath, entry.key);
    }

    // Garbage-collect content that is no longer referenced by any index entry
    await cacache.verify(cachePath);
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
    const {cachePath, stripKeys = ['id', 'time'], retentionCount = 10000} = options;

    // Run retention check once on transport startup (at most once per day)
    retentionCheckRun(cachePath, retentionCount).catch(() => {
        // Retention errors must not crash the transport
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
