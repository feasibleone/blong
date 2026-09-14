/**
 * Causal lineage (PRD R7).
 *
 * Time is a poor correlation axis for concurrent systems, so the chain is built
 * from an explicit parent link where one exists. Where it does not, the trace
 * id still groups the records and time orders them — so a participant that has
 * not been updated to emit parent links degrades the precision of the chain
 * without removing it.
 *
 * That degradation is deliberate, not a stub. An emitter rollout is not atomic,
 * so the service will hold records from both before and after the change; a
 * service that dropped or refused every record without a parent would lose the
 * correlation of every un-updated participant, which is the failure the fallback
 * exists to prevent. What the fallback cannot claim is causation: a trace with
 * no parent links answers "what happened, in what order, across which services",
 * not "what caused what".
 *
 * The degradation is a property of {@link LineageIndex.trace} alone. `chain()`
 * has no approximation to offer a record with no parent link — time can order
 * records but it cannot supply a link — so such a record is the root of a
 * one-record chain, and a later record that shares its trace is not appended to
 * it.
 *
 * Within a trace, records are ordered by time and a shared timestamp is broken
 * by `id`, not by `service`. `service` was the other candidate and is rejected:
 * it is neither unique nor total, so it would leave the order of a
 * same-millisecond tie partly undefined and could interleave two services'
 * records. `id` is unique and totally ordered, so the listing is stable however
 * the records arrived.
 *
 * Lineage keys on `trace`, never on a flow. A trace is the W3C correlation id
 * (PRD R7) and may span more than one flow, while a flow is one caller-minted
 * execution ULID (D2, ruled 2026-09-13): the two are distinct values and neither
 * substitutes for the other. Drift keys on `flow.kind`, the caller's stable
 * process name (D4), for a different question entirely.
 *
 * A record whose trace is absent is grouped under {@link UNTRACED} rather than
 * dropped or held apart: a record with no trace context is still a record, and
 * ordering it among the other untraced records of the same service is the most a
 * trace-less record can support. `id` is the emitter's record id, so a caller
 * that re-`add`s the same id **replaces** the node it indexed earlier — in the
 * walk's index and in the trace listing alike, so a redelivery is one record
 * rather than two (see the `add` doc comment).
 *
 * The walk is guarded against malformed links. A parent chain is written by the
 * emitter, so it can arrive cyclic (`a` parented by `b`, `b` parented by `a`) or
 * dangling (a parent that never reached the service); a walk that trusted it
 * would not terminate, and a lineage lookup hanging a request is worse than an
 * approximated answer. The guard is a visited set, so a cycle returns the cycle
 * itself and a dangling parent ends the walk at the last node that is present.
 */

import type {IngestEvent} from './registry.ts';

/** The trace key a record is grouped under when it carries no usable trace id. */
const UNTRACED = 'untraced';

/**
 * The key a record is grouped under. A trace that is absent, empty or not a
 * string cannot identify a trace, so it is grouped under {@link UNTRACED}
 * rather than under a key that names nothing — an empty trace is not a trace of
 * its own. The ingest types the field as a string but does not validate it, so
 * the check is made on the value rather than assumed from the type; the same
 * strictness is applied to a flow kind in `ingest.ts`.
 */
function traceKeyOf(event: IngestEvent): string {
    const trace = event.refs?.trace;
    return typeof trace === 'string' && trace.length > 0 ? trace : UNTRACED;
}

export interface LineageNode {
    id: string;
    trace: string;
    parent?: string;
    service: string;
    time: number;
    operation?: string;
    fingerprint: string;
    intent?: string;
}

/**
 * Traces retained before the least-recently-`add`ed is evicted. Mirrors
 * `FlowShapes`' execution cap: one trace is a correlation group, and a few
 * megabytes is a sane ceiling for an index whose whole job is to be the recent
 * causal graph, not an archive.
 */
const DEFAULT_TRACE_LIMIT = 10_000;

/**
 * Records retained per trace before its least recently indexed is dropped.
 * Larger than `FlowShapes`' per-execution step cap because a distributed trace
 * legitimately holds more records than one business flow holds steps, and
 * smaller than the trace cap because it multiplies with it. Configurable through
 * the constructor.
 */
const DEFAULT_RECORD_LIMIT = 256;

/**
 * One record in a trace's listing, with the monotonic `sequence` value at the
 * `add` that put it there. The sequence is what the per-trace cap drops by, and
 * it is deliberately not the record's `time`: the emitter's clock orders the
 * records *within* a trace, but it cannot order their *arrival*, and a backdated
 * record must not be the first the bound drops (see the class doc).
 */
interface TraceRecord {
    node: LineageNode;
    /** The sequence value at the `add` that last indexed this record. */
    seq: number;
}

/**
 * One trace's records, plus a monotonic recency used only for eviction. The
 * recency is a counter rather than the newest record's time because the wire
 * clock is the emitter's: two hosts' clocks are not comparable, and a
 * backdated record must not make an old trace look recently used.
 */
interface TraceBucket {
    records: TraceRecord[];
    /** The `sequence` value at the last `add` into this trace; greater is more recent. */
    touched: number;
}

/**
 * The walk index for causal lineage.
 *
 * **Retention.** The index is bounded on two axes so it cannot grow with
 * traffic: at most `traceLimit` traces (the least-recently-`add`ed evicted
 * first) and at most `recordLimit` records per trace (its least recently
 * `add`ed dropped). Both bounds are absolute and both are counted —
 * `evictions()` and `truncations()` — because a bound that drops data silently
 * is the failure this service exists to prevent, and `traceCount()` shows the
 * surviving window. The design mirrors `FlowShapes`' `flowLimit`/`flowStepLimit`;
 * the numbers differ because the units do (a trace holds more records than a
 * flow holds steps).
 *
 * **Both caps order by arrival, not by the emitter's clock.** The record cap
 * drops the least recently `add`ed record, the same monotonic `sequence` the
 * trace cap evicts by. Ordering the *cap* by record time would be the one place
 * this module trusted the wire clock after denying it everywhere else, and it
 * fails exactly where the module says clocks fail: a backdated record arriving
 * into a full bucket is the *smallest* time in it, so a time-ordered cap would
 * `shift` it out the instant it was indexed — discarding the very record
 * correlation is about to read, and resolving its anomaly to `untraced:<ref>`
 * instead of the trace it belongs to. Dropping by arrival keeps the record that
 * was just observed, which is what correlation needs.
 *
 * **Eviction changes what `chain()` and `rootOf()` can answer.** This is the
 * consequence the index was not wired into the service until it was settled. An
 * evicted record is gone from the walk index, so a chain that walked through it
 * is truncated at the closest surviving ancestor instead of reaching the real
 * root: `rootOf()` then names a record closer to the leaf than the true origin.
 * That is a degraded attribution, not a wrong one — the answer is still "an
 * ancestor of this record" — and the alternative (an unbounded index) trades a
 * degraded answer for unbounded memory. What the bound must never do is make
 * the degradation *invisible*: `evictions()`/`truncations()` and `traceCount()`
 * report it, `trace()` still lists what survives, and this paragraph is the
 * contract rather than an implementation note. See `.github/memory/decision.md`
 * (Plan 2 Task 10) for the ruling and the cap rationale.
 */
export class LineageIndex {
    private readonly nodes = new Map<string, LineageNode>();
    private readonly byTrace = new Map<string, TraceBucket>();
    private readonly traceLimit: number;
    private readonly recordLimit: number;
    /** Monotonic recency source, so `touched` is a total order however the clock behaves. */
    private sequence = 0;
    private evictionCount = 0;
    private truncationCount = 0;

    /**
     * `traceLimit` bounds retained traces and `recordLimit` the records retained
     * per trace; both are clamped to at least one, so a caller cannot configure
     * a cap that stores nothing (`enforceLimit` also needs a positive bound).
     * The defaults are documented on the constants above.
     */
    constructor(traceLimit: number = DEFAULT_TRACE_LIMIT, recordLimit: number = DEFAULT_RECORD_LIMIT) {
        this.traceLimit = Math.max(1, traceLimit);
        this.recordLimit = Math.max(1, recordLimit);
    }

    /**
     * The bucket for a trace, or a fresh un-stored one when the trace has none.
     * Shared by the removal and the insert in `add`, because the defensive
     * `?? fresh` is exercised by the insert's new-trace path — so the fallback is
     * a branch the tests genuinely reach, not a guard that cannot fire — and an
     * absent bucket is safe to filter and to push into (a fresh bucket is not
     * stored until the caller sets it). An unchecked cast to the bucket type
     * would instead make a missed lookup fail silently in the hands of its
     * caller; this makes it an empty bucket.
     */
    private bucketOf(trace: string): TraceBucket {
        return this.byTrace.get(trace) ?? {records: [], touched: 0};
    }

    /**
     * Index one record, replacing any node previously indexed under the same id.
     *
     * Replacement is by `id` because the emitter mints it and an at-least-once
     * redelivery must not create a second node for the same record — and it is
     * replacement in **both** indexes, because the two must agree: replacing only
     * in `nodes` would leave the previous node object in the trace listing, so
     * `trace()` would list one record twice and `intentsOf()` could report an
     * intent carried only by the replaced node, while a re-add under a *different*
     * trace would leave the id listed under both — a record appearing in a trace
     * it is not part of. An id is one record, so it is one listing entry, under
     * one trace: the one it was last `add`ed with.
     *
     * The listing's bucket is pruned when the removal empties it, so `byTrace`
     * does not accumulate keys that group nothing. `nodes` is the authority for
     * the id from then on, and the invariant this relies on — a node in `nodes` is
     * in the bucket named by its own `trace` — is what lets the previous entry be
     * found by identity rather than by a second lookup.
     *
     * The returned node is a copy. The index keeps the object it indexed, so a
     * caller that edits what it was handed cannot alter the index — the same
     * ownership rule `trace()` and `chain()` follow for the nodes they hand out
     * as well as for the arrays.
     */
    add(event: IngestEvent): LineageNode {
        const node: LineageNode = {
            id: event.id,
            trace: traceKeyOf(event),
            parent: event.refs?.parent,
            service: event.service,
            time: event.time,
            operation: event.operation,
            fingerprint: event.fingerprint,
            intent: event.intent?.name,
        };
        const previous = this.nodes.get(node.id);
        if (previous) {
            // Removal is by identity rather than `splice(indexOf(previous), 1)`
            // on a cast bucket: `indexOf` can be `-1`, and `splice(-1, 1)` would
            // delete the *last* element — silent data loss rather than a no-op.
            // Filtering by identity cannot mis-target, and `bucketOf` already
            // turns an absent bucket into a fresh one instead of an unchecked cast.
            const bucket = this.bucketOf(previous.trace);
            const remaining = bucket.records.filter(candidate => candidate.node !== previous);
            if (remaining.length === 0) {
                this.byTrace.delete(previous.trace);
            } else {
                bucket.records = remaining;
                this.byTrace.set(previous.trace, bucket);
            }
        }
        this.nodes.set(node.id, node);
        const bucket = this.bucketOf(node.trace);
        // The monotonic sequence stamped at this `add`, reused as the bucket's
        // recency so the two caps order by the same clock — the arrival counter.
        const seq = ++this.sequence;
        bucket.records.push({node, seq});
        // `id` breaks a timestamp tie so one trace has a stable order however
        // the records arrived: two records can share a millisecond, and a
        // comparator that returned 0 for them would leave the order to sort's
        // implementation rather than to the data.
        bucket.records.sort((a, b) => a.node.time - b.node.time || a.node.id.localeCompare(b.node.id));
        bucket.touched = seq;
        this.byTrace.set(node.trace, bucket);
        // Drop the least recently `add`ed record, not the smallest-time one. A
        // backdated arrival into a full bucket has the smallest time in it, so a
        // time-ordered cap would drop it the instant it was indexed — the very
        // record correlation is about to read, whose anomaly would then resolve
        // to `untraced:<ref>` instead of this trace. Ordering by arrival keeps
        // what was just observed. The dropped node leaves `nodes` too, so a
        // chain that walked through it is truncated at its closest surviving
        // ancestor rather than reaching the real root (see the class doc).
        while (bucket.records.length > this.recordLimit) {
            let victim = 0;
            for (let i = 1; i < bucket.records.length; i++) {
                if (bucket.records[i].seq < bucket.records[victim].seq) {
                    victim = i;
                }
            }
            const [dropped] = bucket.records.splice(victim, 1);
            this.nodes.delete(dropped.node.id);
            this.truncationCount++;
        }
        this.enforceLimit();
        return {...node};
    }

    /**
     * Every record sharing a trace, in time order. The array and the nodes in
     * it are copies: the caller cannot reorder or truncate the index's own
     * listing, nor edit a node and have the index change under it.
     */
    trace(traceId: string): LineageNode[] {
        const bucket = this.byTrace.get(traceId);
        return bucket ? bucket.records.map(record => ({...record.node})) : [];
    }

    /**
     * How many trace listings the index holds. Exposed so the pruning of an
     * emptied bucket in `add` is *observable*: `trace()` returns `[]` for a
     * deleted bucket and for an empty one alike, so without this the
     * memory-hygiene claim would rest on a `delete` no test can see. A re-add
     * that moves a trace's only record elsewhere must leave this count
     * unchanged, not one higher. It is also the surviving-window report for the
     * trace cap (see the class doc).
     */
    traceCount(): number {
        return this.byTrace.size;
    }

    /**
     * The retained trace keys, in the index's own insertion order. A fresh array,
     * so a caller cannot reorder or truncate the index's listing. This is the
     * surface correlation reads to find which traces a template appears in; the
     * alternative it replaced reached into `byTrace` reflectively, which would
     * have made a rename of a private field silently break correlation.
     */
    traceIds(): string[] {
        return [...this.byTrace.keys()];
    }

    /** Traces dropped to keep the retained count within the cap. */
    evictions(): number {
        return this.evictionCount;
    }

    /** Records dropped because their trace exceeded the per-trace cap. */
    truncations(): number {
        return this.truncationCount;
    }

    /**
     * Walk parent links from the root down to `recordId`. A record with no
     * parent (or whose parent has not been indexed) is the root of its own
     * chain, and a cycle terminates the walk rather than repeating it. The
     * nodes handed back are copies, like `trace()`'s.
     */
    chain(recordId: string): LineageNode[] {
        const path: LineageNode[] = [];
        const seen = new Set<string>();
        let current = this.nodes.get(recordId);
        while (current && !seen.has(current.id)) {
            seen.add(current.id);
            path.unshift({...current});
            current = current.parent ? this.nodes.get(current.parent) : undefined;
        }
        return path;
    }

    /** The root of the chain `recordId` belongs to, if the record is known. */
    rootOf(recordId: string): string | undefined {
        const path = this.chain(recordId);
        return path.length ? path[0].id : undefined;
    }

    /** Intent names observed anywhere in a trace. */
    intentsOf(traceId: string): string[] {
        const names = new Set<string>();
        for (const node of this.trace(traceId)) {
            if (node.intent) names.add(node.intent);
        }
        return [...names];
    }

    /**
     * Evict the least-recently-`add`ed trace when the cap is exceeded, deleting
     * its records from the walk index in the same pass so the two indexes agree.
     * A node in a bucket is the current `nodes` entry for its id — `add` removes
     * a previous listing before it writes the new one — so deleting by the
     * bucket's ids cannot take a record that a *different* trace now owns.
     */
    private enforceLimit(): void {
        if (this.byTrace.size <= this.traceLimit) {
            return;
        }
        let victimKey = '';
        let oldest = Number.POSITIVE_INFINITY;
        for (const [trace, bucket] of this.byTrace) {
            if (bucket.touched < oldest) {
                oldest = bucket.touched;
                victimKey = trace;
            }
        }
        // `victimKey` cannot stay empty: the loop above runs because
        // `byTrace.size > traceLimit >= 1` guarantees at least one entry, and a
        // real trace key is never the empty string (`traceKeyOf` maps an absent,
        // empty or non-string trace to `untraced`).
        const victim = this.byTrace.get(victimKey) as TraceBucket;
        for (const record of victim.records) {
            this.nodes.delete(record.node.id);
        }
        this.byTrace.delete(victimKey);
        this.evictionCount++;
    }
}
