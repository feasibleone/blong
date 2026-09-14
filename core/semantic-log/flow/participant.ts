/**
 * Participant runtime for the flow fixtures.
 *
 * Deliberately thin: it wires a logger and a fastify app, propagates the two
 * identity headers, and gets out of the way. Each participant file then contains
 * only its protocol steps and the logging calls those steps make — which is what
 * lets the fixtures double as documentation of how to use the library (PRD
 * R17/R20).
 *
 * Three identities travel between participants — the **trace**, the flow
 * **execution id** and the **leg** — and they ride one header, described in
 * `src/propagation.ts` (PRD R9/R22, ruled 2026-09-13 and 2026-09-14):
 *
 * - the trace is causal correlation. One trace may span more than one flow, so a
 *   value minted here is only a fallback for a participant that received none —
 *   the entry point.
 * - the flow execution id is a ULID naming exactly one execution of a flow,
 *   minted by the caller at the entry point and propagated unchanged. It is *not*
 *   the trace id.
 * - the leg names the one call a hop makes, and carries the participant the caller
 *   expected to answer plus the call's position in the execution, so the records at
 *   both ends name one call and are ordered together.
 *
 * All of it is the **library's** contract rather than this fixture's: the header,
 * the field names, `identityHeaders()` and `readIdentities()` live in
 * `src/propagation.ts`, and this file consumes them. A fixture is one caller of the
 * mechanism, never its owner — which is why the propagation rule is not written
 * here.
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
import {
    bindInboundLeg,
    bindTrace,
    currentLeg,
    isLegId,
    isLegSeq,
    isServiceName,
    step,
    withFlow,
    withIntent,
    type LegIdentity,
} from '../src/context.ts';
import type {LevelName} from '../src/level.ts';
import {createLogger, type Logger} from '../src/logger.ts';
import {identityHeaders, readIdentities} from '../src/propagation.ts';
import {createServiceWriter} from '../src/service/transport.ts';
import {isUlid} from '../src/ulid.ts';

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
    /**
     * The leg the inbound request arrived with, or `undefined` when it carries none
     * or carries one that is not lawful (PRD R22). Nothing is minted: a caller that
     * declared no leg for this call is simply not cross-referenced, and inventing an
     * id here would name a call site that does not exist — the same lie as a
     * fabricated flow id.
     */
    legFrom(request: {headers: Record<string, unknown>}): LegIdentity | undefined;
    /** Run `fn` with the trace, the flow execution, the inbound leg and (optionally) the intent bound. */
    run<T>(traceId: string, flowId: string, leg: LegIdentity | undefined, fn: () => T): T;
    /** Run one named protocol step under the bound flow. */
    phase<T>(name: string, fn: () => Promise<T> | T): Promise<T>;
}

// The inbound half of the propagation contract lives in the library: a request's
// identities are read with `readIdentities()`, which owns the rule that a value
// naming a field twice is what a duplicated header line produces and is therefore
// not an identity. It is there rather than here because every application that
// receives these identities has to apply the same rule, and one tested
// implementation beats one per application.

/**
 * What a request carries: the fields that are lawful, and nothing else.
 *
 * Each field is validated for the thing it claims to be, and a value that is not
 * that thing is read as **absent** rather than throwing: an identity arriving on
 * the wire is another process's value, and an unbalanced peer must not be able to
 * turn a bad field into a 500 (D3, `docs/decisions.md`). A flow id that is not a
 * ULID is treated exactly as an absent one, so the entry-point rule applies and a
 * fresh ULID is minted — the loss is visible as a stray execution in the observed
 * shape rather than as a broken request.
 */
function identitiesOf(request: {headers: Record<string, unknown>}): {
    trace?: string;
    flow?: string;
    leg?: LegIdentity;
} {
    const identities = readIdentities(request.headers);
    const {leg, to, seq} = identities;
    return {
        trace: identities.trace,
        flow:
            identities.flow !== undefined && isUlid(identities.flow) ? identities.flow : undefined,
        leg:
            leg !== undefined && isLegId(leg)
                ? {
                      id: leg,
                      to: to !== undefined && isServiceName(to) ? to : undefined,
                      seq: seq !== undefined && isLegSeq(seq) ? seq : undefined,
                  }
                : undefined,
    };
}

let traceCounter = 0;

export async function createParticipant(options: ParticipantOptions): Promise<Participant> {
    const cache = await openCache({dir: options.cacheDir, limit: 5000});
    const sink =
        options.serviceUrl === undefined
            ? undefined
            : createServiceWriter({url: options.serviceUrl});
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
            return identitiesOf(request).trace ?? `tr-${++traceCounter}`;
        },
        flowFrom(request): string {
            return identitiesOf(request).flow ?? ulid();
        },
        legFrom(request): LegIdentity | undefined {
            return identitiesOf(request).leg;
        },
        run<T>(traceId: string, flowId: string, leg: LegIdentity | undefined, fn: () => T): T {
            // A transfer IS a multi-step flow (PRD R9), so declare one per request.
            // The flow id is NOT the trace id (amended 2026-09-13): the caller mints a
            // ULID naming one execution and propagates it separately, so a trace may
            // span several flows. The kind is the deployment's stable process name.
            //
            // The inbound leg (PRD R22) is adopted *inside* the flow, because a leg is
            // a flow's call: an absent one is not an error — the caller simply
            // declared none — while `hop` below refuses to make the next call without
            // a declaration.
            if (leg?.to !== undefined && leg.to !== options.name) {
                // The caller declared who it expected to answer, and this is not that
                // participant: a routing defect, and the declaration on the record is
                // what makes it visible. Recorded rather than thrown — the peer that
                // reached the wrong service must still be answered — and deliberately
                // at `warn` on the *shared* logger: an `error` record escalates withheld
                // detail (R10), and a shared logger would then release one execution's
                // detail onto another's record (see the note in `hub.ts`).
                logger.warn('leg declared for another participant', {
                    leg: leg.id,
                    declared: leg.to,
                    service: options.name,
                });
            }
            const body = (): T =>
                bindTrace(traceId, () =>
                    withFlow({id: flowId, kind: options.kind}, () =>
                        leg === undefined ? fn() : bindInboundLeg({id: leg.id, seq: leg.seq}, fn),
                    ),
                );
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
 * Call a downstream participant, carrying every identity bound in this scope.
 *
 * `from` is the calling participant. It is not read here today — a participant
 * file owns its own protocol logging — but it is part of the call shape so a
 * per-participant hop (rate limiting, outbound logging) can be added without
 * rewriting every call site.
 *
 * The leg is **required**, and is taken from the ambient scope rather than passed
 * in (PRD R22): the caller declares it with `bindLeg`, so its own
 * request-describing records carry the same id as the callee's receipt. That
 * declaration also names the participant the caller expects to answer, which is
 * what puts an *attempt* on the record even when nothing answers — the receiver may
 * be missing, failing or wired to the wrong address, and the edge is still known.
 * A hop with no declaration is refused here rather than recorded as an anonymous
 * call that nothing can pair.
 *
 * The header comes from the library's `identityHeaders()`, which *is* the
 * propagation contract: this fixture consumes the decision about where an identity
 * is written, it does not make it (`src/propagation.ts`).
 */
export async function hop(
    from: Participant,
    targetUrl: string,
    path: string,
    body: unknown,
): Promise<HopResult> {
    if (currentLeg()?.to === undefined) {
        throw new TypeError(
            `hop to ${targetUrl}${path} must declare the participant it calls; use bindLeg({id, to}, …)`,
        );
    }
    const response = await fetch(`${targetUrl}${path}`, {
        method: 'POST',
        headers: {'content-type': 'application/json', ...identityHeaders()},
        body: JSON.stringify(body),
    });
    return {status: response.status, body: await response.json().catch(() => undefined)};
}
