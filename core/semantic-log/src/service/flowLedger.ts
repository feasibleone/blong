// cspell:ignore kindless
/**
 * The flow ledger: what the service observed of each flow (PRD R22, R23).
 *
 * Two questions, two answers, deliberately kept apart from `FlowShapes`:
 *
 * - **`FlowShapes`** accumulates the *template-ref sequence* of an execution,
 *   because that is what drift compares. It holds an execution only while it is
 *   in flight and hands the sequence over once, at termination.
 * - **the ledger** retains what the *diagrams* need, and the two diagrams need
 *   different things: one execution's ordered calls; and, per flow **kind**, a
 *   running union of the calls ever observed under it — what was seen, not what
 *   was declared anywhere.
 *
 * Retaining per-execution state keyed by the caller's ULID is also what closes
 * R9's *partial* verdict: records are now indexed by flow id, so one execution's
 * chain is a lookup rather than a scan.
 *
 * ## A call is a declaration, not a deduction
 *
 * The caller names both ends: the leg id it mints begins with its own name
 * (`legIdFor`), and the receiver it expects is the `to` it declared (`legTo` on the
 * record). So an edge is known from **one** observation — the caller's — and a
 * receiver that never answers (missing, failing, or wired to the wrong address)
 * still appears in the observed shape. What its silence costs is the `observed`
 * count on the edge, which is a fact about the deployment instead of a line that
 * cannot be drawn.
 *
 * Whether that edge was *answered* is a separate question, answered by the
 * **declaration** rather than by the record that carries the receipt. A leg a caller
 * declared toward one target, and then observed from the receiving side, was
 * answered by that target — whatever name the process that wrote the record happens
 * to have. One process hosts many namespaces, and in development a whole suite, so a
 * credit that compared the writer's service to the callee would make an answered call
 * a property of how the deployment is split rather than of what happened (D-210).
 *
 * ## Position, not time
 *
 * Calls are ordered by the **counter path** the caller assigned (`1`, `1.2`), not
 * by any timestamp. Two records emitted inside one millisecond cannot be ordered by
 * a millisecond-resolution clock; measured on the inter-scheme fixture, 7 of its 14
 * legs tied, and a direction resting on arrival order is a coin flip that looks
 * like a measurement. The counter is assigned without a coordinator — the receiver
 * numbers its own calls as children of the position it was handed — so the paths
 * form a depth-first order of the execution, which is what a sequence diagram is
 * drawn in.
 *
 * The union is a running aggregate, like the drift history: it is fed as events
 * arrive rather than when an execution ends, so a *stalled* flow still contributes
 * the calls it was seen to make, and evicting an execution's detail does not
 * un-observe it. Retention has two bounds, and neither loss is silent — an execution
 * dropped by the cap is reported by {@link FlowLedger.evictions} and a step dropped
 * by the per-execution cap by {@link FlowLedger.truncations}.
 */

import {isUlid} from '../ulid.ts';
import {legOf, refFromFingerprint, type IngestEvent} from './registry.ts';

/** Executions whose detail is retained for the instance view. */
const DEFAULT_EXECUTION_LIMIT = 1000;

/** Steps one execution retains. The shape it is drawn from is far shorter. */
const DEFAULT_STEP_LIMIT = 256;

/** One observed traversal of one call, as one event reported it. */
export interface LegObservation {
    leg: string;
    /** The service that emitted the record — the caller, or the receiver. */
    service: string;
    /** The receiver the **caller** declared; absent on a receiver's own records. */
    to?: string;
    /** The call's position in the execution, as the caller assigned it. */
    seq?: string;
    /** The step the record sat in, when the emitter reported one. */
    step?: string;
    /** The flow position the emitter reported, when it reported one. */
    index?: number;
    time: number;
    /** The record the observation came from, so a diagram can name its evidence. */
    ref: string;
}

/** One declared call, and how much of it was seen. */
export interface LegEnd {
    caller: string;
    callee: string;
    /** Declarations observed for this pair — one per execution, however many records it logged. */
    count: number;
    /** Of those, the attempts whose receiver was also observed. */
    observed: number;
}

/** A call as the union knows it. */
export interface ObservedLeg {
    leg: string;
    /** Declarations observed for it, over every caller. */
    count: number;
    first: number;
    last: number;
    /** The step it was observed in, most often — the phase it belongs to. */
    step?: string;
    /** The position its declarations carried, first seen. Orders the union. */
    seq?: string;
    /** Services seen logging it, in first-observation order. */
    services: string[];
    /** Ends observed, most frequently declared first. */
    ends: LegEnd[];
}

/** What was observed of one flow kind. */
export interface FlowUnion {
    kind: string;
    /** Executions observed under this kind. */
    executions: number;
    /** Every service seen in one of them, in first-observation order. */
    services: string[];
    /** Calls observed, in the order their positions give them. */
    legs: ObservedLeg[];
}

/** What was observed of one execution, without its per-record detail. */
export interface FlowSummary {
    id: string;
    kind?: string;
    /** Every service seen emitting a record of it, in first-observation order. */
    services: string[];
    /** Template refs traversed, in observation order — the shape drift compares. */
    refs: string[];
    /** Calls traversed, ordered by their positions. */
    legs: string[];
    /** Has the emitter reported a terminal status for it? */
    closed: boolean;
}

/** What was observed of one execution. */
export interface FlowExecution extends FlowSummary {
    observations: LegObservation[];
}

/** One declaration this execution made, and what has been counted for it. */
interface Declaration {
    caller: string;
    callee: string;
    /** Has it been counted in the aggregate? */
    counted: boolean;
    /** Has a receipt been credited to it? */
    credited: boolean;
}

/** What one execution has declared and seen answered for one call. */
interface LegSeen {
    /** Declarations made for the call, by pair. */
    declared: Map<string, Declaration>;
    /**
     * Services observed carrying the call without declaring it — the receiving side.
     * Who wrote a receipt is **information**, for the reader of a diagram: the credit
     * below rests on the declaration, never on these names.
     */
    answered: Set<string>;
}

/**
 * Whether a receipt seen for a leg can be attributed to a declaration.
 *
 * A record with no declared target says *that* the leg was answered, and not which target
 * answered it. That is enough when the leg was declared toward one callee in this
 * execution — and not when it was declared toward two, which is one call id reused toward
 * two receivers, i.e. the caller misuse the id exists to make impossible. Contradictory
 * data gets the conservative reading: neither edge is credited, so both are drawn
 * unanswered, instead of a coin flip deciding which of them claims to have been answered.
 *
 * Exported so the diagram and the ledger reach the same verdict about an arrow
 * from this rule, and a second copy of it is how the two views drifted once already.
 */
export function attributable(declaredTargets: number, receipts: number): boolean {
    return declaredTargets === 1 && receipts > 0;
}

/** Per-execution state. */
interface ExecutionState {
    kind?: string;
    /**
     * The kind's aggregate, once the kind is known. Held here rather than looked up
     * per observation because a kindless execution has none — which is the one
     * reachable case the aggregation has to pass over, and it cannot be expressed as
     * a lookup that is allowed to fail.
     */
    union?: KindState;
    /** Every service seen emitting a record of this execution — a record needs no leg to count. */
    services: Set<string>;
    observations: LegObservation[];
    /** Event ids already observed, so a redelivery is not a second attempt. */
    seen: Set<string>;
    /**
     * What this execution declared and saw answered, per call.
     *
     * Kept per execution because both counters are **per execution**: a receiver that
     * logs three records about one call answered it once, and credit has to be given
     * when the two halves arrive in either order — a receipt can reach the service
     * before the declaration that aimed at it, since two processes flush their sinks
     * independently.
     */
    legs: Map<string, LegSeen>;
    refs: string[];
    closed: boolean;
    /** Monotonic recency, for eviction. */
    touched: number;
}

interface LegAggregate {
    count: number;
    first: number;
    last: number;
    /** Step name to the declarations observed in it. */
    steps: Map<string, number>;
    /** Services seen logging this call, in first-observation order. */
    services: Set<string>;
    seq?: string;
    ends: Map<string, LegEnd>;
}

interface KindState {
    executions: number;
    services: Set<string>;
    legs: Map<string, LegAggregate>;
    touched: number;
}

/** The key one declared pair is aggregated under. */
function pairKey(caller: string, callee: string): string {
    return `${caller}\u0000${callee}`;
}

/**
 * A path of counters, zero-padded per component so a plain string compare orders
 * paths numerically: `1` < `1.1` < `2`. Six digits is more siblings than an
 * execution can have records.
 */
function seqKey(seq: string): string {
    return seq
        .split('.')
        .map(part => part.padStart(6, '0'))
        .join('.');
}

/** Order two calls by the position they were given, a tie by id. */
export function comparePosition(
    a: {id: string; seq?: string},
    b: {id: string; seq?: string},
): number {
    if (a.seq !== undefined && b.seq !== undefined) {
        return seqKey(a.seq).localeCompare(seqKey(b.seq)) || a.id.localeCompare(b.id);
    }
    // A call observed without a position (an emitter that sent none) sorts last, and
    // two of those are ordered by id: the order stays total and deterministic.
    if (a.seq === b.seq) {
        return a.id.localeCompare(b.id);
    }
    return a.seq === undefined ? 1 : -1;
}

/** The most frequent key of a count map, ties settled by first sight. */
function mostFrequent(counts: Map<string, number>): string | undefined {
    let best: string | undefined;
    let bestCount = 0;
    for (const [key, count] of counts) {
        if (count > bestCount) {
            best = key;
            bestCount = count;
        }
    }
    return best;
}

/**
 * The flow ledger. Fed from the ingest's accepted-event seam, beside the lineage
 * index, so both views are built from one stream of events in one order.
 */
export class FlowLedger {
    private readonly executionLimit: number;

    private readonly stepLimit: number;

    private readonly byExecution = new Map<string, ExecutionState>();

    private readonly byKind = new Map<string, KindState>();

    private sequence = 0;

    private evictionCount = 0;

    private truncationCount = 0;

    constructor(
        executionLimit: number = DEFAULT_EXECUTION_LIMIT,
        stepLimit: number = DEFAULT_STEP_LIMIT,
    ) {
        this.executionLimit = executionLimit;
        this.stepLimit = stepLimit;
    }

    /**
     * Record one accepted event.
     *
     * An event with no flow, a flow id that is not a ULID, or no call is not an
     * error. The first two are already reported by `FlowShapes` (which counts a flow
     * id it cannot place as a straggler) and are declined here rather than counted
     * twice; the third simply means the record belongs to no observed call. Nothing
     * on this path throws: it runs on the ingest, where a peer's malformed value must
     * not break a batch (D3).
     *
     * A record naming an execution whose terminal status was already reported is
     * **still observed**, and that is deliberate: between two processes arrival order is
     * not emission order. Measured on the single-scheme fixture, the payer's sink is
     * flushed first, so its `transfer complete` reached the service before the hub's
     * last four records — and refusing them lost the hub's own declaration of
     * `hub.transfer.deliver`, i.e. a whole edge of the flow, plus three receipts. The
     * execution's end is a fact about the emitter's report (`closed`), not a claim about
     * what other participants have yet to deliver.
     */
    observe(event: IngestEvent): void {
        const flow = event.flow;
        if (flow === undefined || !isUlid(flow.id)) {
            return;
        }
        const state = this.byExecution.get(flow.id) ?? this.open(flow.id);
        if (state.kind === undefined && typeof flow.kind === 'string' && flow.kind.length > 0) {
            state.kind = flow.kind;
            state.union = this.countKind(flow.kind);
        }
        state.touched = ++this.sequence;
        // A record needs no call to prove its service took part: the entry records that
        // sit between hops belong to the flow, and a diagram that omitted their service
        // would be missing a participant the reader can see in the records.
        state.services.add(event.service);
        const leg = legOf(event);
        if (leg !== undefined && !state.seen.has(event.id)) {
            state.seen.add(event.id);
            if (state.observations.length < this.stepLimit) {
                const observation: LegObservation = {
                    leg: leg.id,
                    service: event.service,
                    to: leg.to,
                    seq: leg.seq,
                    step: flow.step,
                    index: flow.index,
                    time: event.time,
                    ref: event.id,
                };
                state.observations.push(observation);
                this.aggregate(state, observation);
            } else {
                this.truncationCount++;
            }
        }
        if (state.refs.length < this.stepLimit) {
            state.refs.push(refFromFingerprint(event.fingerprint));
        }
        if (flow.status === 'completed' || flow.status === 'failed') {
            state.closed = true;
        }
        this.enforceLimit();
    }

    /** The retained detail of one execution, or `undefined` when it is not held. */
    executionOf(flowId: string): FlowExecution | undefined {
        const state = this.byExecution.get(flowId);
        if (state === undefined) {
            return undefined;
        }
        return {
            ...this.summaryOf(flowId, state),
            observations: state.observations.map(o => ({...o})),
        };
    }

    /**
     * Every retained execution, most recently observed first, without its per-record
     * detail. Bounded by the retention cap, like the detail itself.
     *
     * The recency counter is bumped by every accepted event and never reset, so two
     * retained executions cannot hold the same one and the order needs no tie-break.
     */
    executions(): FlowSummary[] {
        return [...this.byExecution.entries()]
            .sort((a, b) => b[1].touched - a[1].touched)
            .map(([flowId, state]) => this.summaryOf(flowId, state));
    }

    /** The summary view of one execution's state. */
    private summaryOf(flowId: string, state: ExecutionState): FlowSummary {
        return {
            id: flowId,
            kind: state.kind,
            services: [...state.services],
            refs: [...state.refs],
            legs: callsOf(state.observations),
            closed: state.closed,
        };
    }

    /** The union observed for one kind, or `undefined` when it has none. */
    unionOf(kind: string): FlowUnion | undefined {
        const state = this.byKind.get(kind);
        if (state === undefined) {
            return undefined;
        }
        return {
            kind,
            executions: state.executions,
            services: [...state.services],
            legs: [...state.legs.entries()]
                .map(([leg, aggregate]) => ({
                    leg,
                    count: aggregate.count,
                    first: aggregate.first,
                    last: aggregate.last,
                    step: mostFrequent(aggregate.steps),
                    seq: aggregate.seq,
                    services: [...aggregate.services],
                    ends: [...aggregate.ends.values()]
                        .map(end => ({...end}))
                        .sort(
                            (a, b) =>
                                b.count - a.count ||
                                a.caller.localeCompare(b.caller) ||
                                a.callee.localeCompare(b.callee),
                        ),
                }))
                .sort((a, b) => comparePosition({id: a.leg, seq: a.seq}, {id: b.leg, seq: b.seq})),
        };
    }

    /** The kinds observed, most recently touched first. */
    kinds(): string[] {
        return [...this.byKind.entries()]
            .sort((a, b) => b[1].touched - a[1].touched || a[0].localeCompare(b[0]))
            .map(([kind]) => kind);
    }

    /** How many executions are retained in detail. */
    size(): number {
        return this.byExecution.size;
    }

    /** Executions dropped by the retention cap. */
    evictions(): number {
        return this.evictionCount;
    }

    /** Steps dropped by the per-execution cap. */
    truncations(): number {
        return this.truncationCount;
    }

    /** Every union, for the snapshot. */
    unions(): FlowUnion[] {
        return this.kinds().map(kind => this.unionOf(kind) as FlowUnion);
    }

    /**
     * Replace the unions with those read from a snapshot.
     *
     * Only the unions are restored: the per-execution detail is a process-lifetime
     * surface, like the lineage index, the incident store and the drift history. What
     * should outlive a restart is what a restart cannot re-derive — the calls observed
     * under a kind — while one execution's steps are of interest only while it is
     * recent. The loader validates the shape before this runs (`persistence.ts`), so a
     * malformed union is reported there rather than half-restored here.
     */
    restore(unions: readonly FlowUnion[]): void {
        this.byKind.clear();
        for (const union of unions) {
            const legs = new Map<string, LegAggregate>();
            for (const leg of union.legs) {
                legs.set(leg.leg, {
                    count: leg.count,
                    first: leg.first,
                    last: leg.last,
                    steps: new Map(leg.step === undefined ? [] : [[leg.step, leg.count]]),
                    services: new Set(leg.services),
                    seq: leg.seq,
                    ends: new Map(leg.ends.map(end => [pairKey(end.caller, end.callee), {...end}])),
                });
            }
            this.byKind.set(union.kind, {
                executions: union.executions,
                services: new Set(union.services),
                legs,
                touched: ++this.sequence,
            });
        }
    }

    /** Open a fresh execution. The kind is adopted (and counted) by the observer. */
    private open(flowId: string): ExecutionState {
        const state: ExecutionState = {
            services: new Set<string>(),
            observations: [],
            seen: new Set<string>(),
            legs: new Map<string, LegSeen>(),
            refs: [],
            closed: false,
            touched: 0,
        };
        this.byExecution.set(flowId, state);
        return state;
    }

    /** Count one execution toward a kind, creating the kind's aggregate if needed. */
    private countKind(kind: string): KindState {
        const state = this.byKind.get(kind) ?? {
            executions: 0,
            services: new Set<string>(),
            legs: new Map<string, LegAggregate>(),
            touched: 0,
        };
        state.executions++;
        this.byKind.set(kind, state);
        return state;
    }

    /**
     * Add one observation to its kind's aggregate.
     *
     * Both counters are **per execution, not per record**: a receiver that logs three
     * records about one call answered it once, and one call declared once cannot be
     * answered twice. A record that **declares** a receiver states the edge; a record
     * that merely carries the call — the receiver's own — records who answered it.
     *
     * The declaration's bookkeeping is therefore *re-applied* after either half
     * arrives, and the flags make that idempotent: a receipt can reach the service
     * before the declaration that aimed at it, since two processes flush their sinks
     * independently, and crediting on arrival order would have made the answer depend
     * on which of them happened to flush first.
     *
     * A call seen only from the receiver's side appears with **no end at all**, which is
     * the honest shape of it: nobody said who called, and the union reports that rather
     * than inventing a caller from whichever service it happened to see first.
     *
     * A receipt is credited to the declaration, and attributed through it (see
     * {@link attributable}): the receiving side's own name is on the observation and in
     * the union's `services`, but it is never the condition.
     */
    private aggregate(state: ExecutionState, observation: LegObservation): void {
        const kindState = state.union;
        if (kindState === undefined) {
            // A flow with no stable name has no union to be observed under. Its calls
            // are still retained for the instance view, and the loss is the same one
            // `FlowShapes` counts as kindless — counted there, not twice.
            return;
        }
        kindState.touched = this.sequence;
        kindState.services.add(observation.service);
        const aggregate = kindState.legs.get(observation.leg) ?? {
            count: 0,
            first: observation.time,
            last: observation.time,
            steps: new Map<string, number>(),
            services: new Set<string>(),
            seq: observation.seq,
            ends: new Map<string, LegEnd>(),
        };
        kindState.legs.set(observation.leg, aggregate);
        aggregate.first = Math.min(aggregate.first, observation.time);
        aggregate.last = Math.max(aggregate.last, observation.time);
        aggregate.services.add(observation.service);
        if (observation.step !== undefined) {
            aggregate.steps.set(observation.step, (aggregate.steps.get(observation.step) ?? 0) + 1);
        }
        const seen = state.legs.get(observation.leg) ?? {
            declared: new Map<string, Declaration>(),
            answered: new Set<string>(),
        };
        state.legs.set(observation.leg, seen);
        if (observation.to === undefined) {
            // A record with no declared target is the receiving side of this leg. Which
            // service wrote it is information, not a condition: one service can host many
            // realms, adapters and orchestrators, so requiring its name to equal the callee
            // would make an answered call a property of how the deployment is split rather
            // than of what happened.
            seen.answered.add(observation.service);
        } else {
            // Created **once** per pair: a call site that logs several records about the
            // one call it made (a request and its answer, a preparation and its commit)
            // is one attempt, and re-creating the entry would reset the flags below and
            // count the same attempt again — which is how the payer's discovery, logged
            // twice inside one leg, came to be reported as two calls.
            // The caller is the service that wrote the record: the participant that made the
            // call. Reading it off the leg id instead names the caller's *namespace*, which
            // is wrong the moment a module is mounted under another name - the receiving
            // scheme runs `flow/hub.ts` as `hubB`, so the id's head drew a `hub` nothing
            // deployed, beside it, and the two schemes' hubs as one participant. What the leg
            // is worth here is the *relationship*, and the two views of it have to agree: the
            // ledger counts the ends and the diagram draws them.
            const caller = observation.service;
            const key = pairKey(caller, observation.to);
            if (!seen.declared.has(key)) {
                seen.declared.set(key, {
                    caller,
                    callee: observation.to,
                    counted: false,
                    credited: false,
                });
            }
        }
        for (const [key, declared] of seen.declared) {
            const end = aggregate.ends.get(key) ?? {
                caller: declared.caller,
                callee: declared.callee,
                count: 0,
                observed: 0,
            };
            aggregate.ends.set(key, end);
            if (!declared.counted) {
                declared.counted = true;
                aggregate.count++;
                end.count++;
            }
            if (!declared.credited && attributable(seen.declared.size, seen.answered.size)) {
                declared.credited = true;
                end.observed++;
            }
        }
    }

    /** Evict the least-recently-observed execution when the cap is exceeded. */
    private enforceLimit(): void {
        if (this.byExecution.size <= this.executionLimit) {
            return;
        }
        // The same shape `FlowShapes` uses, down to the sentinel: the map is never
        // empty here (its size exceeds the cap), so the loop always finds a victim,
        // and a guard for "no victim" would be a branch nothing can take.
        let victim = '';
        let oldest = Number.POSITIVE_INFINITY;
        for (const [flowId, state] of this.byExecution) {
            if (state.touched < oldest) {
                oldest = state.touched;
                victim = flowId;
            }
        }
        this.byExecution.delete(victim);
        this.evictionCount++;
    }
}

/** The calls one execution made or answered, deduplicated, in position order. */
function callsOf(observations: readonly LegObservation[]): string[] {
    const seen = new Map<string, string | undefined>();
    for (const observation of observations) {
        if (!seen.has(observation.leg)) {
            seen.set(observation.leg, observation.seq);
        }
    }
    return [...seen.entries()]
        .map(([leg, seq]) => ({id: leg, seq}))
        .sort(comparePosition)
        .map(leg => leg.id);
}
