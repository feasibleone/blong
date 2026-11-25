import type {IAgentTelemetryEvent} from '@feasibleone/blong';
import {library} from '@feasibleone/blong';

/**
 * `telemetryRing` — the memory source of a session's feed (`@@D-988`).
 *
 * It exists because a Playwright run and a machine with no broker must still watch a session: the
 * same events a topic would carry are kept in a ring per session, capped rather than retried, and a
 * reader subscribes to it exactly as it would to a partition. `source: memory` is chosen
 * deliberately, never fallen back to — a broker that fails is reported, not papered over.
 *
 * The ring is the realm's own rather than a framework adapter because no second realm publishes a
 * feed yet; when one does, the ring moves beside the Kafka adapter and both become sources of one
 * contract (`@@D-1001`).
 */
const RING_SIZE = 5000;

const rings = new Map<string, IAgentTelemetryEvent[]>();
const watchers = new Map<string, Set<(event: IAgentTelemetryEvent) => void>>();

/** Keep a batch, dropping the oldest past the cap. */
export const telemetryRingAppend = (sessionId: string, events: IAgentTelemetryEvent[]): void => {
    const ring = rings.get(sessionId) ?? [];
    ring.push(...events);
    if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
    rings.set(sessionId, ring);
    for (const event of events) {
        for (const watcher of watchers.get(sessionId) ?? []) watcher(event);
    }
};

/**
 * What a reader is owed when it opens: the tail of the ring.
 *
 * `after` is the sequence number the reader last rendered, mirroring the offset a Kafka reader
 * resumes from — a page that reconnects asks for what it has not seen rather than for everything.
 */
export const telemetryRingRead = (
    sessionId: string,
    options: {tail?: number; after?: number} = {},
): IAgentTelemetryEvent[] => {
    const ring = rings.get(sessionId) ?? [];
    const from = options.after === undefined ? Math.max(0, ring.length - (options.tail ?? 500)) : 0;
    return ring
        .slice(from)
        .filter(event => options.after === undefined || event.seq > options.after);
};

/** Live events, after the tail the caller already read. Ends when the reader's signal says so. */
export async function* telemetryRingWatch(
    sessionId: string,
    options: {after?: number; signal?: AbortSignal} = {},
): AsyncIterable<IAgentTelemetryEvent> {
    const queue: IAgentTelemetryEvent[] = [];
    let wake: (() => void) | null = null;
    const push = (event: IAgentTelemetryEvent): void => {
        if (options.after !== undefined && event.seq <= options.after) return;
        queue.push(event);
        const waiting = wake;
        wake = null;
        waiting?.();
    };
    const listeners = watchers.get(sessionId) ?? new Set();
    listeners.add(push);
    watchers.set(sessionId, listeners);
    const abort = (): void => {
        const waiting = wake;
        wake = null;
        waiting?.();
    };
    options.signal?.addEventListener('abort', abort, {once: true});
    try {
        while (!options.signal?.aborted) {
            const next = queue.shift();
            if (next) {
                yield next;
                continue;
            }
            await new Promise<void>(resolve => {
                wake = resolve;
            });
        }
    } finally {
        options.signal?.removeEventListener('abort', abort);
        listeners.delete(push);
        if (listeners.size === 0) watchers.delete(sessionId);
    }
}

/**
 * How many events the ring holds.
 *
 * A watch asks because the ring's own start is what `reachedStart` means here: a tail that read the
 * whole ring reached it, and one that read the last 500 of 5,000 did not.
 */
export const telemetryRingSize = (sessionId: string): number => (rings.get(sessionId) ?? []).length;

/** Forget a session's ring, for a test that starts the same conversation twice. */
export const telemetryRingReset = (sessionId?: string): void => {
    if (sessionId === undefined) rings.clear();
    else rings.delete(sessionId);
    if (sessionId === undefined) watchers.clear();
    else watchers.delete(sessionId);
};

export default library(() => ({
    telemetryRingAppend,
    telemetryRingRead,
    telemetryRingSize,
    telemetryRingWatch,
    telemetryRingReset,
}));
