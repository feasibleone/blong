/**
 * The cluster-service sink (PRD §4; §5.1 "Multiple sinks in parallel"; PRD R18).
 *
 * The emitter's *remote* destination: a `Writer` that forwards the record it is
 * handed to the service's existing event ingest route (`POST /events` — a batch
 * of `IngestEvent`s, answered `202`, with per-event skip-vs-fail; unchanged
 * here). It is meant to be given to the logger as a sink *beside* stdout, never
 * instead of it (see `logger.ts`).
 *
 * Two properties are load-bearing:
 *
 * - **Non-blocking (R18).** `write` only queues: it returns nothing, never a
 *   promise, and never touches the socket on the caller's stack. `flush` is how
 *   a caller — a test, or a shutdown path — waits for the queue.
 * - **A delivery failure is reported, never thrown (ruling D3).** A rejected
 *   `fetch`, a non-2xx answer, and any later queued failure are all absorbed:
 *   they are counted (`failed()`), offered to `onError` when one is configured,
 *   and otherwise cost nothing but the record. Nothing here can reach the
 *   logger's caller, which is what makes a dead service sink leave stdout, and
 *   the process, intact.
 * - **The queue is bounded (R18 backpressure).** A service that never answers
 *   must cost bounded memory: sends are queued, so a hung `fetch` — there is no
 *   default timeout — would otherwise retain every record for the life of the
 *   process. The queue drops oldest-first at `sendLimit` and every drop is
 *   counted (`dropped()`) rather than silent. Same policy, and same honesty, as
 *   the emitter's own write queue (see `createWriteTracker` in `logger.ts`).
 *
 * The record comes from the `Writer`'s second argument rather than being parsed
 * back out of the rendered line. `human` is the emitter's default format and a
 * human line cannot be turned back into a record; a sink that required `json`
 * would silently send nothing under the default configuration — a mechanism
 * that can never fire. A record with no fingerprint cannot be ingested and is
 * skipped; the logger's own records always carry one (`withIdentity` mints it).
 */

import type {LogRecord} from '../record.ts';
import type {Writer} from '../writer.ts';
import type {IngestEvent} from './registry.ts';

export interface ServiceTransportOptions {
    /** Base URL of the cluster service, e.g. `http://127.0.0.1:9455`. */
    url: string;
    /** Injected so a test never opens a socket; defaults to the global `fetch`. */
    fetch?: typeof fetch;
    /**
     * Called once per undelivered record, with the error and the event that
     * could not be sent. A reporter that throws is itself absorbed, so it cannot
     * poison the queue it reports on. Never called on success.
     */
    onError?: (error: unknown, events: readonly IngestEvent[]) => void;
    /**
     * How many sends may be queued before the oldest is dropped (R18
     * backpressure). Default 1000. A value below one (or `NaN`) is rejected at
     * construction: zero cannot be honoured — a send has to be held until it
     * runs — so it would either retain one anyway or silently mean something
     * other than what the caller asked for, exactly as `writeLimit` is treated.
     */
    sendLimit?: number;
}

export interface ServiceWriter extends Writer {
    /** Resolve once every queued send has settled. Never rejects. */
    flush(): Promise<void>;
    /** How many records could not be delivered, cumulatively. */
    failed(): number;
    /**
     * How many records were discarded un-attempted, because the send queue was
     * full. Cumulative, and disjoint from `failed()`: a drop is a policy
     * decision, not a delivery failure.
     */
    dropped(): number;
}

/** The event the ingest route already understands, built from a log record. */
function toEvent(record: LogRecord, fingerprint: string): IngestEvent {
    return {
        id: record.id,
        time: record.time,
        fingerprint,
        template: record.template,
        service: record.service,
        level: record.level,
        levelName: record.levelName,
        msg: record.msg,
        operation: record.operation,
        // `parent` is carried only when present, exactly as `flow` and
        // `operation` were added: the wire stays absent-tolerant, so a service
        // that predates the field still ingests a record that omits it. It is
        // this event — the only `IngestEvent` constructor in the package — that
        // connects the emitter's `refs.parent` (`logger.ts`) to Plan 2's
        // `LineageIndex.add`, which reads `event.refs.parent`. Dropping it (as
        // this line once did) makes every record its own root, so R7's causal
        // chain cannot be reconstructed over the shipped path.
        refs: {
            record: record.refs.record,
            trace: record.refs.trace,
            ...(record.refs.parent ? {parent: record.refs.parent} : {}),
        },
        // Progress points travel as names only (PRD R26): a checkpoint's `data` and
        // a decision's evaluated `values` are payload and stay in the local record
        // and cache, where the inspector can show them (R1, R10). `regions` is
        // carried whole because every field of a mark is a name the code declares.
        ...(record.progress
            ? {
                  progress: {
                      ...(record.progress.regions ? {regions: record.progress.regions} : {}),
                      ...(record.progress.points
                          ? {
                                points: record.progress.points
                                    .filter(
                                        item =>
                                            item &&
                                            typeof item === 'object' &&
                                            typeof item.name === 'string',
                                    )
                                    .map(item => item.name),
                            }
                          : {}),
                  },
              }
            : {}),
        intent: record.intent,
        flow: record.flow,
    };
}

/**
 * Bound the queued sends (R18 backpressure; §5.1 "Backpressure and drop
 * policy").
 *
 * The same reasoning as the emitter's `DEFAULT_WRITE_LIMIT`: a destination that
 * never answers must cost a bounded amount of memory, and the loss must be
 * observable rather than silent. The bound counts sends still *queued* — the one
 * in flight is held by the socket, not by this queue — so a hung `fetch` retains
 * at most this many unsent records beside the one it is stuck on. Oldest-first
 * matches the ring buffer's and the write queue's drop policy.
 */
const DEFAULT_SEND_LIMIT = 1000;

export function createServiceWriter(options: ServiceTransportOptions): ServiceWriter {
    const limit = options.sendLimit ?? DEFAULT_SEND_LIMIT;
    if (!(limit >= 1)) {
        throw new RangeError(
            `sendLimit must be a positive number of sends, received ${String(limit)}`,
        );
    }
    // `fetch(` is written out literally so the offline audit can see this module
    // for what it is: the service side's second network caller, declared beside
    // `provider.ts` in `test/offline.test.ts`. Keep the call spelled out.
    const doFetch: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
    const endpoint = `${options.url.replace(/\/+$/, '')}/events`;
    const queue: Array<readonly IngestEvent[]> = [];
    let running = false;
    let idle: Promise<void> = Promise.resolve();
    let failed = 0;
    let dropped = 0;

    async function send(events: readonly IngestEvent[]): Promise<void> {
        const response = await doFetch(endpoint, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({events}),
        });
        if (!response.ok) {
            throw new Error(`semantic-log: the service sink answered ${response.status}`);
        }
    }

    async function drain(): Promise<void> {
        while (queue.length > 0) {
            const events = queue.shift() as readonly IngestEvent[];
            try {
                await send(events);
            } catch (error: unknown) {
                // Absorbed, exactly as the promise chain absorbed it: a failure
                // must not surface to the caller, must not poison a later send,
                // and must leave `flush` resolvable. The record is still lost;
                // the process is not.
                failed += events.length;
                try {
                    options.onError?.(error, events);
                } catch {
                    // A reporter must not break the chain it reports on.
                }
            }
        }
        running = false;
    }

    return {
        write(_line: string, record?: LogRecord): void {
            if (!record) {
                return;
            }
            const {fingerprint} = record;
            if (!fingerprint) {
                return;
            }
            // `refs` is required by `LogRecord`, so only an untyped caller can omit
            // it — and `toEvent` dereferences it on the caller's stack. Skipping keeps
            // `write` total for that caller rather than letting the throw escape.
            if (!record.refs) {
                return;
            }
            const events: readonly IngestEvent[] = [toEvent(record, fingerprint)];
            // Bounded, oldest-first: a service that never answers must cost a
            // bounded amount of memory, and every drop is counted rather than
            // silent. A drop is not a delivery failure, so it is kept disjoint
            // from `failed()`.
            if (queue.length >= limit) {
                const discarded = queue.shift() as readonly IngestEvent[];
                dropped += discarded.length;
            }
            queue.push(events);
            if (!running) {
                running = true;
                // Started from a microtask, never on the caller's stack: `write`
                // must not touch the socket, and `flush` returns the drain tail,
                // so it always covers what is queued.
                idle = Promise.resolve().then(drain);
            }
        },
        flush: () => idle,
        failed: () => failed,
        dropped: () => dropped,
    };
}
