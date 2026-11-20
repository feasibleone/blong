/**
 * The service sink (PRD §4; §5.1 "Multiple sinks in parallel"; PRD R18).
 *
 * The emitter's *remote* destination: a `Writer` that forwards the record it is handed to the
 * service's ingest route (`POST /events` — a batch of `IngestEvent`s, answered `202`, with
 * per-event skip-versus-fail). It is meant to be given to the transport as a sink *beside* the
 * local writer, never instead of it: the local file is the record of what happened, and the service
 * is the aggregate view of it.
 *
 * Two properties are load-bearing:
 *
 * - **Non-blocking (R18).** `write` only queues: it returns nothing, never a promise, and never
 *   touches the socket on the caller's stack. `flush` is how a caller — a test, or a shutdown path
 *   — waits for the queue.
 * - **A delivery failure is reported, never thrown (ruling D3).** A rejected `fetch`, a non-2xx
 *   answer, and any later queued failure are all absorbed: they are counted (`failed()`), offered
 *   to `onError` when one is configured, and otherwise cost nothing but the record. Nothing here can
 *   reach the caller of a signal, which is what makes a dead service sink leave the process intact.
 * - **The queue is bounded (R18 backpressure).** A service that never answers must cost bounded
 *   memory: sends are queued, so a hung `fetch` — there is no default timeout — would otherwise
 *   retain every record for the life of the process. The queue drops oldest-first at `sendLimit`
 *   and every drop is counted (`dropped()`) rather than silent.
 *
 * The record comes from the `Writer`'s second argument rather than being parsed back out of the
 * rendered line. `human` is the emitter's default format and a human line cannot be turned back into
 * a record; a sink that required `json` would silently send nothing under the default
 * configuration — a mechanism that can never fire.
 *
 * ## Which record, and why the identifier is the only new field
 *
 * A record reaches this sink already carrying everything an arrival needs: its own `id`, the
 * `service` it came from, the time and the level. The one thing `semantic-log` also required — a
 * `fingerprint` computed from the message — is gone, and a `signal` naming the declaration that
 * produced the record takes its place (`@@D-889`). So the sink is a `Writer` like any other and
 * refuses only the records that predate that field: a record with no identifier cannot be counted
 * against anything, and sending it would put an entry on the ledger keyed by nothing.
 */

import type {LogRecord} from '../record.ts';
import type {Writer} from '../writer.ts';
import type {IngestEvent} from './ledger.ts';

/**
 * The record this sink accepts: a record that names the signal it was emitted for.
 *
 * Modelled as a widening of `LogRecord` rather than of the emitter's summary record, because this is
 * the shape the `Writer` contract hands over — the full record, with its `refs`, its flow position
 * and its progress marks. T-710 is where the emitter starts filling `signal` on every record it
 * writes; until then a caller that wants its records counted forwards them with the field set.
 */
export interface IServiceRecord extends LogRecord {
    /**
     * The declared identifier — the record's identity (`@@D-889`).
     *
     * Absent when the emitter reached no declaration, which is the ordinary case for a realm's own
     * log line: what makes such a record shippable is its **flow**, an identity the service indexes
     * on its own. A record outside any flow that names no declaration is still refused — it has
     * nothing to be counted against (@@D-940).
     */
    signal?: string;
}

export interface ServiceTransportOptions {
    /** Base URL of the cluster service, e.g. `http://127.0.0.1:9455`. */
    url: string;
    /** Injected so a test never opens a socket; defaults to the global `fetch`. */
    fetch?: typeof fetch;
    /**
     * Called once per undelivered record, with the error and the event that could not be sent. A
     * reporter that throws is itself absorbed, so it cannot poison the queue it reports on. Never
     * called on success.
     */
    onError?: (error: unknown, events: readonly IngestEvent[]) => void;
    /**
     * How many sends may be queued before the oldest is dropped (R18 backpressure). A value below
     * one (or `NaN`) is rejected at construction: zero cannot be honoured — a send has to be held
     * until it runs — so it would either retain one anyway or silently mean something other than
     * what the caller asked for.
     */
    sendLimit?: number;
}

export interface ServiceWriter extends Writer {
    /** Resolve once every queued send has settled. Never rejects. */
    flush(): Promise<void>;
    /** How many records could not be delivered, cumulatively. */
    failed(): number;
    /**
     * How many records were discarded un-attempted, because the send queue was full. Cumulative,
     * and disjoint from `failed()`: a drop is a policy decision, not a delivery failure.
     */
    dropped(): number;
}

/**
 * The event the ingest route understands, built from a record.
 *
 * The message travels twice on purpose: `msg` is the rendered message the record carries, and
 * `message` is the same sentence under the name the service searches and shows. Two names for one
 * value is cheaper than making every reader of the wire know which package spelled it which way.
 */
export function toEvent(record: IServiceRecord): IngestEvent {
    return {
        id: record.id,
        time: record.time,
        ...(record.signal === undefined ? {} : {signal: record.signal}),
        message: record.msg,
        service: record.service,
        level: record.level,
        levelName: record.levelName,
        msg: record.msg,
        ...(record.operation === undefined ? {} : {operation: record.operation}),
        // `parent` is carried only when present, exactly as `flow` and `operation` are: the wire
        // stays absent-tolerant, so a service that predates the field still ingests a record that
        // omits it. It is this function — the only `IngestEvent` constructor in the package — that
        // connects the emitter's `refs.parent` to the lineage index, which reads
        // `event.refs.parent`. Dropping it makes every record its own root, so the causal chain
        // cannot be reconstructed over the shipped path.
        ...(record.refs === undefined
            ? {}
            : {
                  refs: {
                      record: record.refs.record,
                      ...(record.refs.trace === undefined ? {} : {trace: record.refs.trace}),
                      ...(record.refs.parent === undefined ? {} : {parent: record.refs.parent}),
                  },
              }),
        // Progress points travel as names only (PRD R26): a checkpoint's `data` and a decision's
        // evaluated `values` are payload and stay in the local record and cache, where the
        // inspector can show them (R1, R10). `regions` is carried whole because every field of a
        // mark is a name the code declares.
        ...(record.progress === undefined
            ? {}
            : {
                  progress: {
                      ...(record.progress.regions === undefined
                          ? {}
                          : {regions: record.progress.regions}),
                      ...(record.progress.points === undefined
                          ? {}
                          : {
                                points: record.progress.points
                                    .filter(
                                        (item): item is {name: string} =>
                                            item !== null &&
                                            typeof item === 'object' &&
                                            typeof item.name === 'string',
                                    )
                                    .map(item => item.name),
                            }),
                  },
              }),
        ...(record.intent === undefined ? {} : {intent: record.intent}),
        ...(record.flow === undefined ? {} : {flow: record.flow}),
    };
}

/**
 * Bound the queued sends (R18 backpressure; §5.1 "Backpressure and drop policy").
 *
 * The bound counts sends still *queued* — the one in flight is held by the socket, not by this
 * queue — so a hung `fetch` retains at most this many unsent records beside the one it is stuck on.
 * Oldest-first matches the ring buffer's and the write queue's drop policy.
 */
const DEFAULT_SEND_LIMIT = 1000;

export function createServiceWriter(options: ServiceTransportOptions): ServiceWriter {
    const limit = options.sendLimit ?? DEFAULT_SEND_LIMIT;
    if (!(limit >= 1)) {
        throw new RangeError(
            `sendLimit must be a positive number of sends, received ${String(limit)}`,
        );
    }
    // `fetch(` is written out literally so the offline audit can see this module for what it is:
    // the second network caller on this side. Keep the call spelled out.
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
            throw new Error(`lukaot: the service sink answered ${response.status}`);
        }
    }

    async function drain(): Promise<void> {
        while (queue.length > 0) {
            const events = queue.shift() as readonly IngestEvent[];
            try {
                await send(events);
            } catch (error: unknown) {
                // Absorbed: a failure must not surface to the caller, must not poison a later send,
                // and must leave `flush` resolvable. The record is still lost; the process is not.
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
            // A record is shipped when it can be attributed: it names a declared signal, or it
            // belongs to a flow, which the service indexes in its own right. The second case is
            // what a served request is made of — a realm logs, dispatches and answers inside the
            // flow its route minted, and none of those records names a declaration, so refusing
            // them left the flow ledger with nothing to draw and every diagram empty (@@D-940).
            // What stays refused is a record that names neither: `refs` is required by
            // `LogRecord`, so only an untyped caller can omit it, and `toEvent` dereferences it.
            const candidate = record as IServiceRecord | undefined;
            if (candidate === undefined) return;
            const named = typeof candidate.signal === 'string' && candidate.signal.length > 0;
            const flowId = candidate.flow?.id;
            const attributed = typeof flowId === 'string' && flowId.length > 0;
            if (!named && !attributed) {
                return;
            }
            const events: readonly IngestEvent[] = [toEvent(candidate)];
            // Bounded, oldest-first: a service that never answers must cost a bounded amount of
            // memory, and every drop is counted rather than silent. A drop is not a delivery
            // failure, so it is kept disjoint from `failed()`.
            if (queue.length >= limit) {
                const discarded = queue.shift() as readonly IngestEvent[];
                dropped += discarded.length;
            }
            queue.push(events);
            if (!running) {
                running = true;
                // Started from a microtask, never on the caller's stack: `write` must not touch the
                // socket, and `flush` returns the drain tail, so it always covers what is queued.
                idle = Promise.resolve().then(drain);
            }
        },
        flush: () => idle,
        failed: () => failed,
        dropped: () => dropped,
    };
}
