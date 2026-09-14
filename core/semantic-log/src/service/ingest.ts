// cspell:ignore kindless
/**
 * Template-event ingestion (PRD R3, R4, R6, R13).
 *
 * Order matters and is the whole design: identity is a map lookup — the
 * registry key over the fingerprint the emitter minted (R4/R12), and the
 * embedding cache's key over the same fingerprint — and the provider is
 * consulted only for a fingerprint the cache has never answered. Embedding
 * before that lookup is what would make cost scale with volume, which is the
 * failure mode SC3 exists to prevent (R3).
 *
 * Drift is observed per **flow**, not per template (amendment 2026-09-13, R6c).
 * A template's vector is constant by construction — the embedding is keyed by
 * the very fingerprint that identifies the template — so a per-template
 * distance is always 0 and could never fire, however long the service ran. A
 * flow's *shape* genuinely changes (a step appears, disappears or reorders), so
 * the observation is made when the flow completes, because a partial flow is not
 * yet a shape: observing mid-flight would drive the average toward every prefix.
 * The drift key is `flow.kind`, the caller's **stable process name** (ruled
 * 2026-09-13, D4), not the execution ULID: the ULID names a single run, and
 * `FlowShapes` closes an execution at its terminal step, so keying drift by it
 * would leave every key with one observation — and `DriftTracker` reports only
 * on the second, so R6c could never fire. Drift compares runs of the same
 * recurring process, which is the only thing a stable key makes meaningful. The
 * flow's signature vector is derived from the sequence of template references it
 * traversed (`flowVectorOf`), never from the fingerprint-keyed cache, which
 * answers a different question — "what does this one template look like" rather
 * than "what shape did this flow take". A record that carries no flow simply
 * does not participate in drift, and that is normal: an un-updated emitter that
 * sends none keeps working. A flow that *does* participate — present, with a
 * usable ULID — but carries no usable `kind` (absent, empty, or not a string)
 * also does not participate, and there the loss is a configuration surprise
 * rather than a normal case: `kindless()` counts it, so an emitter rollout that
 * forgot the kind is visible instead of silently leaving R6c inert.
 * * The drift observation is also **recorded**, not only fed to the detector: R14's deploy diff must
 * answer "which flows changed shape since the last release?" over a window that is typically days,
 * and no other surface lives that long — the R8 digest is bounded at 1000 entries and in-memory (so
 * it would silently under-report), and `DriftTracker` keeps only the moving centroid, never the time
 * a shape moved. The recording is a bounded `flow.kind -> {count, ring of {at, distance}}` history
 * (`FlowDriftHistory`): bounded by the number of flow **kinds** — the processes the caller names, a
 * small number unlike executions or templates — times a small ring of each kind's most recent
 * drifts. It is kept per **kind** and not per execution: an execution is closed at its terminal step,
 * so a per-execution key would hold one observation and the detector could never fire. The ring
 * exists because one timestamp per kind would let a later drift hide an earlier one from the window
 * that earlier one belongs to; see `FlowDriftHistory.inWindow`. It is written **only when the
 * detector reports drift**: a kind whose shape did not move is not "drifted", and a bucket that
 * listed every kind that merely ran would distinguish nothing (see `.github/memory/decision.md`,
 * Task 9, Option B).
 * * A shape is ordered by the flow **position** the emitter reports
 * (`flow.index`, falling back to `event.time`) and only then encoded, not by
 * network arrival: the steps of one flow arrive as independent fire-and-forget
 * requests, so arrival order is an accident of the network and a shape derived
 * from it would make the drift signal depend on which request won a race. The
 * order is taken when the shape completes, from the steps that have arrived by
 * then.
 *
 * What counts as complete is an explicit set of terminal statuses
 * (`TERMINAL_STATUSES`), not "anything that is not one of two literals": a
 * status this version does not recognise is treated as in-flight, exactly like
 * `running` and `stalled`, because an unrecognised status is more likely to be
 * a new in-flight state than a termination this version forgot to list, and
 * freezing a shape that is still being built is worse than retaining it under
 * the bound below.
 *
 * Retention is bounded on both axes, because the emitter is fire-and-forget: a
 * flow whose terminal status never arrives — or never arrives in a form this
 * version recognises — must not accumulate steps forever. `FlowShapes` retains
 * at most `flowLimit` executions (the least-recently-seen evicted first) and at
 * most `flowStepLimit` steps per execution (its oldest steps dropped), so the
 * memory held is bounded independently of traffic and of how long the service
 * runs. Eviction prefers the execution that has not been seen for the longest,
 * so an active, legitimately long-running flow — re-touched by every step — is
 * the last candidate, not the first.
 *
 * The bound has a disclosed cost. A closed execution must be **retained** to
 * recognise a later duplicate of it, so the map holds closed entries alongside
 * open ones, and when the cap is reached the least-recently-seen entry is
 * evicted whether or not it was still open. An evicted **closed** execution is
 * forgotten, so a duplicate that arrives after the eviction is an unknown ULID
 * and opens a fresh execution instead of being counted as a straggler. That is
 * the trade-off the cap buys, and it is why the cap is a bound on *retained
 * executions* rather than on the logical flows a service defines.
 *
 * A step belongs to a flow **execution**, and an execution is identified on the
 * wire by the caller's ULID (`flow.id`): the ULID **is** the instance identity,
 * so the ingest looks the value up rather than guessing at it. An unknown ULID
 * opens a new execution; a ULID already retained and open appends to it — unless
 * the step is a redelivery of one it already holds (see below); a ULID retained
 * and **closed** — its terminal has been observed — is spent **for as long as it
 * is retained**, so the step is a late or duplicate delivery of that execution:
 * it is counted as a straggler and dropped, never reopened and never allowed to
 * fabricate a one-step shape out of a retransmitted terminal. The retention
 * qualifier is the cap above: once an evicted closed execution is forgotten, a
 * duplicate of it is an unknown ULID again and opens a fresh execution. A value
 * that is not a ULID identifies no execution at all, so it is counted as a
 * straggler too: it is an identity arriving on the wire that the service cannot
 * place, and such a surprise is reported rather than thrown (D3), so a malformed
 * identity cannot break ingestion. What is dropped is never dropped silently —
 * with the single exception of a redelivered step, which is ignored rather than
 * counted because nothing is lost by it (see below) — and every other drop is
 * counted in the unit it happens at: `stragglers()` counts each
 * *step* dropped as a late, duplicate or misplaced delivery, `truncations()`
 * each *step* dropped because its execution exceeded the per-execution cap, and
 * `evictions()` each *execution* dropped to stay within the execution cap — a
 * unit of its own, because evicting an execution discards whatever steps it
 * still held.
 *
 * A redelivered step is the one thing that is ignored rather than counted,
 * because nothing is lost by ignoring it: the step it repeats is already in the
 * shape. `FlowShapes` drops a repeat by the step's own `id`, because the
 * execution ULID names the run and not the step. Without that, an at-least-once
 * redelivery of a non-terminal step would append the same reference twice, and
 * the shape comparison could report drift on the redelivery alone. The
 * recognition reaches only as far as the execution's retained steps: a step
 * already dropped by `truncations()` is no longer there to be recognised, so its
 * redelivery is appended — the same retention qualifier that applies to a closed
 * execution's ULID.
 *
 * A terminal status closes the execution, and the terminal set is explicit
 * (`TERMINAL_STATUSES`): `completed` and `failed` are the emitter's terminal
 * outcomes, while `stalled` is **in flight**, because a stalled flow may still
 * resume — closing it there would truncate its shape and turn every resumed step
 * into a straggler. A status the wire omits or this version does not recognise
 * is in flight for the same reason (see `flowFinished`).
 *
 * A terminal that arrives before earlier steps still observes a partial shape —
 * ordering recovers the sequence of what arrived, not what never did — and
 * those earlier steps then arrive for a closed execution and are dropped; an
 * emitter that needs the whole shape observed must emit its steps, terminal
 * last, without racing them.
 *
 * Failure is scoped to this event's own data. A payload that is not a batch of
 * events is rejected whole and nothing is registered. Inside a batch, the try
 * covers exactly what can fail *because the data is unusable* — the embedding
 * lookup (`cache.vectorFor`) and the observation (`detectors.observe`) — and
 * nothing else. Registration, exemplar retention and anomaly publication happen
 * after that try, so a failure there cannot turn a registered event into a
 * reported skip: the event's template is already in the registry, and calling
 * it `skipped` would leave `accepted = events.length - skipped` arithmetically
 * true and semantically false. Such a failure is a defect in the service, not
 * in the data, so it propagates and the request fails loudly; retention
 * precedes publication, so a callback that throws still leaves the exemplar
 * behind. An event that *is* unusable is skipped and counted in `skipped`
 * rather than aborting the batch: the emitter is fire-and-forget (R18), so one
 * unusable event must not discard the good ones beside it and must not turn an
 * acknowledgement into a 500. Skipping is reported, never silent: the count is
 * in the result and `onSkipped` is offered so the service can log it.
 */

import type {Anomaly, DetectorSuite} from './detectors.ts';
import type {EmbeddingCache} from './embedding.ts';
import type {ExemplarStore} from './exemplars.ts';
import {hashEmbedding} from './provider.ts';
import {type IngestEvent, type TemplateEntry, type TemplateRegistry, refFromFingerprint} from './registry.ts';
import {isUlid} from '../ulid.ts';

export interface IngestDependencies {
    registry: TemplateRegistry;
    cache: EmbeddingCache;
    detectors: DetectorSuite;
    exemplars: ExemplarStore;
    /** Called for every anomaly so the digest can publish it (PRD R8). */
    onAnomaly?: (anomaly: Anomaly, entry: TemplateEntry) => void;
    /**
     * Called once per event the ingest has accepted, before any of that event's
     * deltas are published. The causal lineage index needs the raw event, which
     * `onAnomaly` cannot supply (it carries the detectors' output, not the
     * record), and it must hold the record *before* the record's anomaly is
     * published — otherwise correlation would attribute the anomaly to no trace.
     * A skipped event is deliberately not reported: it was never observed.
     */
    onAccepted?: (event: IngestEvent) => void;
    /**
     * Called once per template the registry has never held before, so the digest
     * can publish the delta (PRD R8). Deliberately *not* called for a repeat
     * occurrence: a count going up is not a change to the set of templates, and a
     * delta stream that re-announced a template on every event would be a record
     * stream with extra steps.
     */
    onTemplateAdded?: (entry: TemplateEntry) => void;
    /**
     * Called when a record is retained as an exemplar (PRD R8/R13), so the digest
     * can carry the pointer without the consumer reading the record. It fires
     * only when the store actually kept the record — once a template's exemplar
     * slots are full, later occurrences are counted and nothing else.
     */
    onExemplar?: (entry: TemplateEntry, recordId: string) => void;
    /** Called for every event that was skipped, with the reason (R3/R18). */
    onSkipped?: (error: unknown, event: IngestEvent) => void;
    /**
     * The flow-shape retention state, injected so a caller can share or observe
     * the bound. Omitted, a fresh store with the default caps is used.
     */
    shapes?: FlowShapes;
    /**
     * The per-flow-kind drift history the deploy diff reads (PRD R14), injected
     * so a caller can share or observe it. Omitted, a fresh history is used.
     */
    driftHistory?: FlowDriftHistory;
}

export interface IngestResult {
    /** Events that were ingested; `accepted + skipped` is the batch size. */
    accepted: number;
    /** Templates in the registry after this batch — not the batch's new ones. */
    templates: number;
    /** Anomalies this batch raised (PRD R6). */
    anomalies: number;
    /** Events processing skipped because they could not be ingested. */
    skipped: number;
}

/** The separator between template references in a flow's shape. A reference is hex, so it cannot appear inside one. */
const FLOW_SHAPE_SEPARATOR = '>';

/**
 * A flow's signature vector: the ordered sequence of template references the
 * flow traversed, encoded by the same deterministic hash that encodes a
 * template signature.
 *
 * The sequence *is* the shape, so the encoding must be order- and
 * length-sensitive: reordering two steps or dropping one has to produce a
 * different vector, while the same path always produces the same one (which is
 * what makes the moving average a baseline rather than noise). The caller
 * supplies the sequence already ordered by flow position (`FlowShapes.append`
 * does that when the shape completes), so the encoding never sees arrival
 * order. The width is the caller's — it must be a single constant across the
 * observations of one flow key, and it is taken from the vectors the provider
 * actually produced rather than from a declared dimension, because the declared
 * dimension is not authoritative (see `centroid.ts`).
 */
export function flowVectorOf(refs: readonly string[], dimension: number): number[] {
    return hashEmbedding(refs.join(FLOW_SHAPE_SEPARATOR), dimension);
}

/**
 * Has the flow finished, so its shape is final? The terminal statuses are the
 * explicit set below: `completed` and `failed` are the emitter's terminal
 * outcomes. `running` and `stalled` are in flight — a stalled flow may still
 * resume — and so is a status the wire omits or this version does not recognise
 * (see the module doc comment).
 */
function flowFinished(status: string | undefined): boolean {
    return status !== undefined && TERMINAL_STATUSES.has(status);
}

/** The flow statuses the wire declares as terminal; every other status is in flight. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['completed', 'failed']);

/**
 * Executions retained by default before the least-recently-seen is evicted.
 *
 * The unit changed with the flow-identity ruling: a key is now one **execution**
 * (a caller-minted ULID), not one logical flow name, so a cap tuned for the
 * handful of flows a service defines would turn over in seconds under real
 * throughput. The cap is raised so that a retransmission of a just-completed
 * execution is still recognised for a useful window, while remaining an absolute
 * memory bound: a closed execution costs a key, a recency counter and a flag
 * (its steps are released at the terminal), so ten thousand of them are a few
 * megabytes rather than a leak.
 */
const DEFAULT_FLOW_LIMIT = 10_000;
/**
 * Steps retained per execution by default before its oldest are dropped. The
 * meaning is unchanged by the ruling — it already bounded the steps of one
 * in-flight execution — and a legitimate flow is far shorter than this, so the
 * number stays.
 */
const DEFAULT_FLOW_STEP_LIMIT = 256;

interface FlowStep {
    ref: string;
    /**
     * The emitter's identity for this event, when it supplied one. It is what
     * makes a redelivery a duplicate: the execution ULID names the run, not the
     * step, so nothing else keys the step itself.
     */
    id: string | undefined;
    /** The flow position the emitter reported, when it reported one. */
    index: number | undefined;
    time: number;
    /** Arrival order, the tie-break when two steps share a position. */
    order: number;
}

/** One step as the caller supplies it: what to retain, and where it sat in the flow. */
interface StepInput {
    ref: string;
    /**
     * The event's identity, when the emitter has one; omitting it opts the step
     * out of duplicate detection (the ingest always supplies it).
     */
    id?: string;
    index: number | undefined;
    time: number;
}

interface FlowState {
    /** Steps of the execution being built; empty once it has terminated. */
    steps: FlowStep[];
    /** Monotonic recency for eviction: the greater, the more recently seen. */
    touched: number;
    /**
     * Has this execution's terminal status been observed? A closed execution is
     * **spent while it is retained**: a later step bearing its ULID is a late or
     * duplicate delivery and is dropped as a straggler, never reopened into a
     * fresh shape. The retention qualifier matters because the cap may evict a
     * closed execution: a forgotten ULID is unknown again, so a later step
     * re-opens it (see the module doc comment).
     */
    closed: boolean;
}

/**
 * The template references each retained execution has traversed, bounded on both
 * axes and ordered by flow position when a shape is taken.
 *
 * Executions are keyed by the caller's ULID (`flow.id`), which **is** the
 * instance identity: an unknown ULID opens an execution, an open one appends to
 * it, and a closed one is spent. See the module doc comment for the retention,
 * ordering and straggler policies.
 */
export class FlowShapes {
    private readonly byFlow = new Map<string, FlowState>();
    private readonly limit: number;
    private readonly stepLimit: number;
    private sequence = 0;
    private stragglerCount = 0;
    private truncationCount = 0;
    private evictionCount = 0;
    private kindlessCount = 0;

    constructor(limit: number = DEFAULT_FLOW_LIMIT, stepLimit: number = DEFAULT_FLOW_STEP_LIMIT) {
        this.limit = Math.max(1, limit);
        this.stepLimit = Math.max(1, stepLimit);
    }

    /**
     * Append one step to an execution's shape, returning the complete shape —
     * ordered by flow position — when `finished`, at which point the accumulated
     * steps are released and the execution is closed. Returns `undefined` while
     * the shape is still being built, and for any step that is not attributed to
     * the execution it names: a value that is not a ULID identifies no execution,
     * and a ULID already closed (while it is retained) is a spent execution —
     * both are counted as stragglers (see the module doc comment). A repeat of a
     * step the execution already holds — the same `id` — is also `undefined`, but
     * is deliberately *not* counted: it is a redelivery of a step already in the
     * shape, so nothing is lost and it is not a step without a home.
     */
    append(flowId: string, step: StepInput, finished: boolean): string[] | undefined {
        // A value that is not a ULID identifies no execution, so the step cannot
        // be placed. It arrived on the wire, so it is reported (counted) rather
        // than thrown (D3), and it must not open a shape under a fabricated key.
        if (!isUlid(flowId)) {
            this.stragglerCount++;
            return undefined;
        }
        let state = this.byFlow.get(flowId);
        if (state?.closed) {
            // The execution's terminal has been observed, so its ULID is spent
            // *while this entry is retained* — the cap may later evict it and make
            // the ULID unknown again (see the module doc comment). This is a
            // delayed step or a retransmission. Dropping it is what stops a
            // duplicate terminal from fabricating a one-step shape, and what
            // stops a late step from being attributed to a *different*
            // execution — under identity there is no second candidate.
            this.stragglerCount++;
            return undefined;
        }
        if (state === undefined) {
            state = {steps: [], touched: 0, closed: false};
            this.byFlow.set(flowId, state);
        }
        // A step the execution already holds is not a second step: the shape is
        // compared as a whole, so appending the reference again would let an
        // at-least-once redelivery of a non-terminal step raise drift by itself.
        // The step's own `id` is the key — the execution ULID names the run, not
        // the step — so the same id in a *different* execution is a different
        // shape entry and is kept.
        if (step.id !== undefined && state.steps.some(existing => existing.id === step.id)) {
            // Ignored rather than counted: the step it repeats is already in the
            // shape, so nothing is lost. It still refreshes the execution's
            // recency, because a redelivery is evidence the run is still being
            // processed and evicting it would discard the shape it is building.
            state.touched = ++this.sequence;
            return undefined;
        }
        state.steps.push({
            ref: step.ref,
            id: step.id,
            index: step.index,
            time: step.time,
            order: ++this.sequence,
        });
        state.touched = this.sequence;
        if (state.steps.length > this.stepLimit) {
            state.steps.shift();
            this.truncationCount++;
        }
        if (!finished) {
            this.enforceLimit();
            return undefined;
        }
        const shape = [...state.steps]
            .sort((a, b) => (a.index ?? a.time) - (b.index ?? b.time) || a.order - b.order)
            .map(current => current.ref);
        state.steps = [];
        state.closed = true;
        this.enforceLimit();
        return shape;
    }

    /** Retained executions — the bound on the map's size, open and closed together. */
    size(): number {
        return this.byFlow.size;
    }

    /** Retained executions whose shape is still being built. */
    pending(): number {
        let open = 0;
        for (const state of this.byFlow.values()) {
            if (state.steps.length > 0) {
                open++;
            }
        }
        return open;
    }

    /** Is this execution retained with a shape still being built? */
    open(flowId: string): boolean {
        const state = this.byFlow.get(flowId);
        return state !== undefined && !state.closed && state.steps.length > 0;
    }

    /** Steps dropped because they arrived for a closed execution or named no execution at all. */
    stragglers(): number {
        return this.stragglerCount;
    }

    /** Steps dropped because their execution exceeded the per-execution cap. */
    truncations(): number {
        return this.truncationCount;
    }

    /** Executions dropped to keep the retained count within the cap. */
    evictions(): number {
        return this.evictionCount;
    }

    /**
     * Completed executions whose flow carried no usable `kind`, so their shape
     * had no key to be observed under (R6c, D4). The unit is the **completed
     * execution** — the point at which a shape, and so a drift observation,
     * exists — not the step: a kindless execution of three steps forgoes one
     * observation, not three. A flow that never terminates is not counted,
     * because no shape was taken and so no observation was forgone, exactly as
     * for an execution that carries a usable kind and never terminates. A record
     * with no flow at all is not counted either: an emitter that sends none is
     * normal.
     */
    kindless(): number {
        return this.kindlessCount;
    }

    /**
     * Note that a completed execution's shape had no usable `kind` and so was
     * not offered to drift. The identity is re-checked: a value that is not a
     * ULID names no execution — it is already counted as a straggler by
     * `append` — and must not be counted here as well.
     */
    noteKindless(flowId: string): void {
        if (isUlid(flowId)) {
            this.kindlessCount++;
        }
    }

    /** Evict the least-recently-seen execution when the cap is exceeded. */
    private enforceLimit(): void {
        if (this.byFlow.size <= this.limit) {
            return;
        }
        let victim = '';
        let oldest = Number.POSITIVE_INFINITY;
        for (const [flowId, state] of this.byFlow) {
            if (state.touched < oldest) {
                oldest = state.touched;
                victim = flowId;
            }
        }
        this.byFlow.delete(victim);
        this.evictionCount++;
    }
}

/**
 * How many most-recent drifts per kind the history's ring retains. The history is
 * bounded by `flow kinds × DRIFT_RING_LIMIT`, not by the number of executions or
 * templates, so it grows with the processes the caller names and not with traffic.
 * One timestamp per kind is not enough: a retrospective window ("what changed in
 * release 3.2?", asked after 3.3) must still see a drift that happened *inside* it
 * even though a later drift has arrived since, and R14 explicitly covers "two time
 * ranges or two revisions". The ring is deliberately finite — unbounded retention
 * would make the map grow with traffic rather than with kinds — so a drift older
 * than the ring's tail is no longer reportable. That is the trade the bound buys.
 */
export const DRIFT_RING_LIMIT = 8;

/** One recorded drift: when the shape moved, and how far it moved then. */
interface DriftObservation {
    at: number;
    distance: number;
}

/** A kind's accumulated drift state: the cumulative count and the ring of recent drifts. */
interface KindDrifts {
    count: number;
    observations: DriftObservation[];
}

/**
 * One flow kind's drift history (PRD R14): the most recent drift inside the
 * window the entry was matched for, the distance measured then, and how many
 * times the kind has drifted in total since the process started.
 */
export interface FlowDrift {
    /** The stable process name the drift was keyed by (`flow.kind`, D4). */
    kind: string;
    /**
     * The time of the most recent drift **inside the window this entry was
     * matched for** (the caller's clock, R9); when read from `inWindow`, this is
     * an in-window time, not necessarily the kind's latest drift overall.
     */
    lastDriftedAt: number;
    /** The distance measured at that in-window drift. */
    lastDistance: number;
    /** Drifts recorded for this kind since the process started (cumulative, not in-window). */
    count: number;
}

/**
 * A per-flow-kind drift history, written by the ingest when a flow's shape
 * moves (PRD R6c, R14).
 *
 * The deploy diff needs this because it must answer "which flows changed shape
 * since the last release?" over a window that is typically days, and nothing
 * else in the service lives that long: the R8 digest is bounded at 1000 entries
 * and in-memory, so deriving the window from it would **silently under-report**,
 * and `DriftTracker` keeps only the moving centroid, never the time a shape
 * moved. This history is bounded instead by the number of flow **kinds** — the
 * processes the caller names, a small number unlike executions or templates —
 * times `DRIFT_RING_LIMIT` recent drifts each.
 *
 * **Assumption (recorded deliberately, see `.github/memory/todo.md`):** the kind
 * set is not capped. The map grows with the number of distinct `flow.kind`
 * values the caller names, so an emitter that varied the kind per execution —
 * embedding a ULID, say — would grow it without limit. This is accepted because
 * `kind` is the stable process name by contract (D4) and callers name few
 * processes, exactly the assumption `DriftTracker`'s centroid map already makes;
 * `FlowShapes` bounds its state with `flowLimit`/`flowStepLimit` and the digest
 * with 1000 entries, but neither is the right bound for a per-kind index. No cap
 * is added; the assumption is stated rather than silent.
 *
 * What is recorded is a **drift**, not an observation: a kind whose shape did
 * not move is not "drifted", so a bucket that listed every kind that merely ran
 * would distinguish nothing. `lastDistance` and `count` travel with the reported
 * drift so a consumer can tell one that barely crossed the threshold from one
 * that changed completely, without a second lookup.
 */
export class FlowDriftHistory {
    private readonly byKind = new Map<string, KindDrifts>();

    /** Record that `kind`'s shape moved at `time`, at `distance` from its baseline. */
    record(kind: string, time: number, distance: number): void {
        const existing = this.byKind.get(kind);
        if (existing === undefined) {
            this.byKind.set(kind, {count: 1, observations: [{at: time, distance}]});
            return;
        }
        existing.count++;
        existing.observations.push({at: time, distance});
        if (existing.observations.length > DRIFT_RING_LIMIT) {
            // Drop the oldest: the ring keeps the most recent drifts, which are the
            // ones a near-term window asks about. The cumulative `count` is not
            // affected — every drift still happened.
            existing.observations.shift();
        }
    }

    /**
     * The kinds with at least one drift inside `[from, to]`, ordered by when that
     * drift happened — earliest first, so a window reads in the order things
     * moved rather than in the order the kinds were first ever recorded (the
     * map's insertion order, which is unrelated to the window being asked about).
     * The bounds are inclusive, matching the deploy diff's `firstSeen`/`lastSeen`
     * comparisons: a drift exactly at `from` or `to` is inside the window.
     *
     * A kind that drifted inside the window **and again after it** is still
     * reported by the earlier window: every drift in the ring is matched against
     * the window, not only the latest, so a retrospective question about an
     * earlier release does not silently lose a kind that has since drifted again.
     * When a kind has several drifts inside the window, the entry reports the most
     * recent one inside it; `count` remains the cumulative total, not the
     * in-window count. The entries are fresh objects the caller owns — the same
     * copy-on-read contract the rest of the service keeps (see `centroid.ts`).
     */
    inWindow(from: number, to: number): FlowDrift[] {
        const found: FlowDrift[] = [];
        for (const [kind, entry] of this.byKind) {
            let latest: DriftObservation | undefined;
            for (const observation of entry.observations) {
                if (
                    observation.at >= from &&
                    observation.at <= to &&
                    (latest === undefined || observation.at > latest.at)
                ) {
                    latest = observation;
                }
            }
            if (latest !== undefined) {
                found.push({kind, lastDriftedAt: latest.at, lastDistance: latest.distance, count: entry.count});
            }
        }
        found.sort((a, b) => a.lastDriftedAt - b.lastDriftedAt);
        return found;
    }

    /** Distinct flow kinds the history holds — half the bound; the ring is the other half. */
    size(): number {
        return this.byKind.size;
    }
}

function isFlow(value: unknown): value is {id: string} {
    const candidate = value as {id?: unknown} | null | undefined;
    // Only the shape the pipeline dereferences is structural: a flow whose `id`
    // is not a string cannot be attributed at all, so the batch is malformed. A
    // string that is not a ULID is a *data* surprise instead — it reaches
    // `FlowShapes.append`, which counts it as a straggler rather than throwing,
    // because an unplaced identity arriving over the wire must not be able to
    // break ingestion (D3).
    return Boolean(candidate && typeof candidate.id === 'string');
}

/**
 * Is this a well-formed event? The guard covers the fields the pipeline needs
 * before it touches them; the optional flow is checked only for the identity it
 * would be attributed by, so a flow the pipeline cannot place at all is rejected
 * with the batch rather than silently mis-keyed. A flow identity that is a
 * string but not a ULID is deliberately not rejected here: it arrived on the
 * wire, so the ingest reports it (counted as a straggler) rather than throwing,
 * which is the same skip-versus-fail rule the rest of the batch follows (D3).
 */
function isEvent(value: unknown): value is IngestEvent {
    const candidate = value as Partial<IngestEvent> | undefined;
    return Boolean(
        candidate &&
            typeof candidate.id === 'string' &&
            typeof candidate.fingerprint === 'string' &&
            typeof candidate.service === 'string' &&
            (candidate.flow === undefined || isFlow(candidate.flow)),
    );
}

/** What one event yields once it has been looked up and observed. */
interface PreparedEvent {
    event: IngestEvent;
    ref: string;
    vector: number[];
    found: Anomaly[];
}

export function createIngest(
    dependencies: IngestDependencies,
): (body: unknown, collect?: Anomaly[]) => Promise<IngestResult> {
    const {registry, cache, detectors, exemplars} = dependencies;
    const shapes = dependencies.shapes ?? new FlowShapes();
    const driftHistory = dependencies.driftHistory ?? new FlowDriftHistory();

    /**
     * Everything that can fail because *this event's data* is unusable: the
     * embedding lookup and the detector observation. Nothing here writes to the
     * registry, so a throw leaves the registry untouched — it does not
     * un-traverse the flow step already added to the shape being accumulated
     * (see the module doc comment).
     */
    async function prepare(event: IngestEvent): Promise<PreparedEvent> {
        const ref = refFromFingerprint(event.fingerprint);
        const signature = event.template ?? event.msg ?? event.fingerprint;
        // A hit costs a map lookup and never reaches the provider, so the
        // provider is called at most once per distinct template (R3/SC3). The
        // same vector comes back every time, which is exactly why a template
        // cannot drift and a flow can.
        const vector = await cache.vectorFor(event.fingerprint, signature);

        let drift: {ref: string; vector: number[]} | null = null;
        const {flow} = event;
        if (flow) {
            // The execution is discriminated by the caller's ULID, and the shape
            // is closed at the terminal status whether or not a driving kind is
            // present — a kind-less flow still bounds its own retention and still
            // refuses to attribute a late step to an execution it does not own.
            const shape = shapes.append(
                flow.id,
                {ref, id: event.id, index: flow.index, time: event.time},
                flowFinished(flow.status),
            );
            if (shape) {
                // Drift is keyed by the stable process name, not by the execution
                // ULID (D4): a ULID names one run, and the execution is closed
                // here, so keying drift by it would leave every key with a single
                // observation and the detector could never fire.
                if (typeof flow.kind === 'string' && flow.kind.length > 0) {
                    drift = {ref: flow.kind, vector: flowVectorOf(shape, vector.length)};
                } else {
                    // The execution participated — it was attributed to a ULID and
                    // its shape was taken — but it had no stable name to be
                    // observed under, so this drift observation is forgone. That is
                    // a configuration surprise, not a throw (D3), and it is counted
                    // so an emitter rollout that forgot `kind` cannot leave R6c
                    // silently inert.
                    shapes.noteKindless(flow.id);
                }
            }
        }

        const novel = registry.get(ref) === undefined;
        const found = detectors.observe({ref, novel, time: event.time, vector, drift});
        return {event, ref, vector, found};
    }

    /**
     * Register the event, retain its exemplar and publish its anomalies. This
     * runs outside the event's try: a failure here is a defect in the service,
     * not in the event's data, and must not be reported as a skip for an event
     * that is already in the registry. Retention precedes publication so a
     * callback that throws cannot cost the event its exemplar.
     */
    function commit(prepared: PreparedEvent, collect?: Anomaly[]): number {
        // The record joins the causal index before any of its deltas are
        // published, so an anomaly is never correlated against a lineage that
        // does not hold the record it was raised on.
        dependencies.onAccepted?.(prepared.event);
        const {entry, novel} = registry.upsert(prepared.event, prepared.vector);
        // Retention precedes *any* publication, including the novelty
        // publication below: the exemplar is in the store and on the entry
        // before the first callback runs, so no callback that throws — not
        // `onTemplateAdded`, not `onAnomaly` — can cost a registered event its
        // exemplar. Pinned by "a failure after registration is a service
        // defect, not a skipped event" and by the throwing-`onTemplateAdded`
        // test.
        const retained = exemplars.offer(prepared.ref, prepared.event);
        if (retained) {
            entry.exemplars.push(prepared.event.id);
        }
        if (novel) {
            // A delta, not a record (R8): the template was not in the registry
            // before this event, which is the only sense in which it is "new".
            dependencies.onTemplateAdded?.(entry);
        }
        for (const anomaly of prepared.found) {
            if (anomaly.kind === 'drift') {
                // A drift anomaly is keyed by the stable flow kind (R6c, D4) and is
                // deliberately not stamped onto this entry: the template's own vector
                // has not moved, and the alert belongs to the flow's shape, not to the
                // template. It is recorded in the flow-drift history instead, which is
                // the surface R14's deploy diff reads (see `FlowDriftHistory`). The
                // distance is narrowed rather than cast: `DetectorSuite.observe` always
                // measures one for a drift today, but a drift anomaly without it must
                // not store `undefined` as `lastDistance` (the type could not tell the
                // difference after a cast).
                if (typeof anomaly.magnitude === 'number') {
                    driftHistory.record(anomaly.ref, anomaly.time, anomaly.magnitude);
                }
            } else if (anomaly.kind === 'novelty') {
                entry.alerts.noveltyAt = anomaly.time;
            } else if (anomaly.kind === 'rate-shift') {
                entry.alerts.rateShiftAt = anomaly.time;
            }
            // A kind that is none of the three is not a member of `AnomalyKind`
            // today. It is ignored rather than falling through to the rate-shift
            // stamp: a future member must be given an explicit home, not silently
            // recorded as a shift in request rate.
        }
        for (const anomaly of prepared.found) {
            dependencies.onAnomaly?.(anomaly, entry);
            // The request-local collector, when given, is how a caller keeps the
            // anomalies of *its own* batch apart from a concurrent request's —
            // the route needs that ownership to discard a failed batch's
            // anomalies without touching another in-flight request's (see the
            // route). The dependency callback stays the shared digest producer.
            collect?.push(anomaly);
        }
        if (retained) {
            // The exemplar delta is published after the anomaly deltas so one
            // event's deltas read in the order the digest advertises: the
            // template appeared, what was anomalous about it, and where a full
            // example can be fetched. The state change still happened before both
            // (see above), which is the ordering that matters.
            dependencies.onExemplar?.(entry, prepared.event.id);
        }
        return prepared.found.length;
    }

    /**
     * Ingest one batch. The optional `collect` array receives every anomaly this
     * batch raises, in order, so a caller can own them per request: a failed
     * batch discards exactly the array it passed and cannot lose a concurrent
     * request's anomalies (which arrive in their own array). The dependency
     * `onAnomaly` callback still fires for each one — it is the digest producer,
     * not the ownership channel.
     */
    return async function ingest(body: unknown, collect?: Anomaly[]): Promise<IngestResult> {
        const events = (body as {events?: unknown[]} | undefined)?.events;
        if (!Array.isArray(events) || !events.every(isEvent)) {
            throw new Error('ingest: expected {events: IngestEvent[]}');
        }

        let anomalies = 0;
        let skipped = 0;
        for (const event of events) {
            let prepared: PreparedEvent;
            try {
                prepared = await prepare(event);
            } catch (error) {
                skipped++;
                dependencies.onSkipped?.(error, event);
                continue;
            }
            anomalies += commit(prepared, collect);
        }
        return {accepted: events.length - skipped, templates: registry.size(), anomalies, skipped};
    };
}
