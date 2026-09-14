/**
 * Participant runtime for the flow fixtures.
 *
 * Deliberately thin: it wires a logger and a fastify app, propagates the two
 * identity headers, and gets out of the way. Each participant file then contains
 * only its protocol steps and the logging calls those steps make — which is what
 * lets the fixtures double as documentation of how to use the library (PRD
 * R17/R20).
 *
 * Two identities travel between participants, and they answer different
 * questions (PRD R9, ruled 2026-09-13):
 *
 * - the **trace** (`TRACE_HEADER`) is causal correlation. One trace may span more
 *   than one flow, so a value minted here is only a fallback for a participant
 *   that received none — the entry point.
 * - the **flow execution id** (`FLOW_HEADER`) is a ULID naming exactly one
 *   execution of a flow, minted by the caller at the entry point and propagated
 *   unchanged. It is *not* the trace id.
 *
 * The flow **kind** (which recurring process this is, e.g. `transfer.single`) is
 * a deployment property, not a request one, so it is configured once per
 * participant and bound on every request. It is the key drift is observed under
 * (R6c), which is why it outlives any single execution and is required.
 *
 * The library carries what it is handed and mints nothing implicitly: the id a
 * request arrives with is the id the step is run under, and caller misuse fails
 * loudly in `run` rather than producing a fabricated identity. Deriving either
 * value implicitly (async context tracking, OpenTelemetry) is a future
 * extension that this shape does not preclude.
 */

import Fastify, {type FastifyInstance} from 'fastify';
import {ulid} from 'ulidx';
import {openCache, type RecordCache} from '../src/cache.ts';
import {bindTrace, step, withFlow, withIntent} from '../src/context.ts';
import type {LevelName} from '../src/level.ts';
import {createLogger, type Logger} from '../src/logger.ts';
import {createServiceWriter} from '../src/service/transport.ts';

/** Header carrying the causal trace id between participants. */
export const TRACE_HEADER = 'x-semantic-trace';

/**
 * Header carrying the flow **execution** id — a caller-minted ULID — between
 * participants. Kept apart from {@link TRACE_HEADER} because a trace may span
 * more than one flow and the flow id names one execution (PRD R9).
 */
export const FLOW_HEADER = 'x-semantic-flow';

/** The business intent a participant acts under (PRD R7). */
export interface ParticipantIntent {
    name: string;
    actor?: string;
    tenant?: string;
}

export interface ParticipantOptions {
    name: string;
    /**
     * The stable name of the flow **as a process** this participant runs
     * (e.g. `transfer.single`) — a deployment property, not a request one. It
     * outlives any single run and is the key drift is observed under (PRD
     * R9/R6c). Required: `withFlow` rejects an empty kind, and no default is
     * applied because inventing one (the participant's own name, say) would
     * fabricate the very drift key this value exists to be honest about.
     */
    kind: string;
    /** Requested port; 0 asks the OS for a free one. */
    port: number;
    cacheDir: string;
    level?: LevelName;
    /** Set at an entry participant only (PRD R7). */
    intent?: ParticipantIntent;
    /**
     * A running cluster service to ship this participant's records to as a
     * **second** destination, or undefined to stay entirely offline (PRD R18).
     *
     * A second destination, never a replacement: the records are retained in
     * `cacheDir` either way, which is what keeps a run complete with no service
     * anywhere.
     */
    serviceUrl?: string;
}

export interface Participant {
    readonly name: string;
    /** The bound port (valid after `listen`). */
    readonly port: number;
    /**
     * The directory this participant's records are retained in — the same value
     * the cache was opened at, so a caller can read back what the participant
     * produced instead of reconstructing the path from the topology.
     */
    readonly cacheDir: string;
    readonly app: FastifyInstance;
    readonly logger: Logger;
    readonly cache: RecordCache;
    /** Bind the port and return this participant's base URL. */
    listen(): Promise<string>;
    close(): Promise<void>;
    /** Read the trace id from a request, or mint one. */
    traceFrom(request: {headers: Record<string, unknown>}): string;
    /** Read the flow execution id from a request, or mint a ULID at the entry point. */
    flowFrom(request: {headers: Record<string, unknown>}): string;
    /** Run `fn` with the trace, the flow execution and (optionally) the intent bound. */
    run<T>(traceId: string, flowId: string, fn: () => T): T;
    /** Run one named protocol step under the bound flow. */
    phase<T>(name: string, fn: () => Promise<T> | T): Promise<T>;
}

/**
 * A propagated identity header, or `undefined` when the request carries none.
 *
 * An identity is a **single token**. Anything else is not one, so the caller falls
 * back or mints rather than carrying a value the sender did not choose:
 *
 * - **absent** — no header at all;
 * - **blank** — `''`, which the sender chose as little as leaving it out;
 * - **repeated** — which does **not** arrive as an array. Node's HTTP parser joins
 *   duplicate header lines into one comma-separated string before any handler sees
 *   them, so the array this once guarded against is unreachable from a real
 *   request. A joined value is not an identity and is *worse* than absent: carried
 *   into `refs.trace` it is a corrupt trace that still looks like one, and carried
 *   as a flow id it is rejected by `withFlow` as malformed, turning a caller's
 *   duplicate header into a 500. Rejecting the joined form is what makes the rule
 *   real.
 */
function identityHeader(request: {headers: Record<string, unknown>}, name: string): string | undefined {
    const value = request.headers[name];
    if (typeof value !== 'string' || value.length === 0) {
        return undefined;
    }
    // A comma is how the parser joins repeated header lines, and no identity this
    // runtime mints or documents contains one — so a comma means the sender sent
    // more than one, or sent something that is not a token. Same rule as the
    // ingest's unusable-kind counter and `LineageIndex`'s trace key.
    return value.includes(',') ? undefined : value;
}

let traceCounter = 0;

export async function createParticipant(options: ParticipantOptions): Promise<Participant> {
    const cache = await openCache({dir: options.cacheDir, limit: 5000});
    const sink = options.serviceUrl === undefined ? undefined : createServiceWriter({url: options.serviceUrl});
    const logger = createLogger({
        service: options.name,
        level: options.level ?? 'info',
        cache,
        ...(sink === undefined ? {} : {sinks: [sink]}),
    });
    const app = Fastify({logger: false});
    let port = options.port;
    let bound = false;

    return {
        name: options.name,
        get port() {
            return port;
        },
        cacheDir: options.cacheDir,
        app,
        logger,
        cache,
        async listen(): Promise<string> {
            if (!bound) {
                const address = await app.listen({port: options.port, host: '127.0.0.1'});
                port = Number(new URL(address).port);
                bound = true;
            }
            return `http://127.0.0.1:${port}`;
        },
        async close(): Promise<void> {
            // A record's write is queued a tick behind the call that emitted it, and
            // the *sinks* are drained separately from the write tracker — so without
            // these two flushes a record emitted just before `close` can land after it
            // returned, or never reach a configured service at all. `flows.ts` flushes
            // for the same reason; doing it here too means a direct caller cannot lose
            // the last record either.
            await logger.flush();
            await sink?.flush();
            await app.close();
            await cache.close();
        },
        traceFrom(request): string {
            return identityHeader(request, TRACE_HEADER) ?? `tr-${++traceCounter}`;
        },
        flowFrom(request): string {
            return identityHeader(request, FLOW_HEADER) ?? ulid();
        },
        run<T>(traceId: string, flowId: string, fn: () => T): T {
            // A transfer IS a multi-step flow (PRD R9), so declare one per request.
            // The flow id is NOT the trace id (amended 2026-09-13): the caller mints a
            // ULID naming one execution and propagates it separately, so a trace may
            // span several flows. The kind is the deployment's stable process name.
            const body = (): T => bindTrace(traceId, () => withFlow({id: flowId, kind: options.kind}, fn));
            return options.intent ? withIntent(options.intent, body) : body();
        },
        phase<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
            return step(name, fn);
        },
    };
}

export interface HopResult {
    status: number;
    body: unknown;
}

/**
 * Call a downstream participant, carrying both identities.
 *
 * `from` is the calling participant. It is not read here today — a participant
 * file owns its own protocol logging — but it is part of the call shape so a
 * per-participant hop (rate limiting, outbound logging) can be added without
 * rewriting every call site.
 */
export async function hop(
    from: Participant,
    targetUrl: string,
    path: string,
    body: unknown,
    traceId: string,
    flowId: string,
): Promise<HopResult> {
    const response = await fetch(`${targetUrl}${path}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            [TRACE_HEADER]: traceId,
            [FLOW_HEADER]: flowId,
        },
        body: JSON.stringify(body),
    });
    return {status: response.status, body: await response.json().catch(() => undefined)};
}
