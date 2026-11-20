/**
 * Ingestion: a batch of records becomes a set of observed signals.
 *
 * One event is looked up by its identifier, counted on the ledger entry, offered to the exemplar
 * store and announced if it is a first sighting. Nothing is derived from its text — the identifier
 * the emitter reached *is* the identity (`@@D-889`), so an event that names a signal this service
 * has never been told about is ingested as an **ad-hoc** entry rather than rejected. That is the
 * case a rolling deploy produces every time the emitters move first, and rejecting it would make
 * the service blind to exactly the release an operator is watching.
 *
 * ## One kind of failure, since there is nothing per-event left to fail
 *
 * `semantic-log` separated two failures: a malformed batch was rejected, and an event whose
 * *embedding* failed was skipped and counted, because the emitter is fire-and-forget (R18) and one
 * unusable event must not discard the good ones beside it. With the embedding gone there is no
 * per-event work that can fail — an event is looked up by its identifier, which is a map read — so
 * the distinction has collapsed into one rule: a batch this service cannot read is rejected, and a
 * batch it can read is accepted whole. The `skipped` count and its `onSkipped` hook went with the
 * second failure rather than remaining as a number that can only ever be zero.
 *
 * A dependency that throws is now a defect in the service: the promise rejects and the caller sees
 * it, which is the honest answer — nothing about *the event's data* caused it.
 */

import type {ExemplarStore} from './exemplars.ts';
import type {IngestEvent, SignalEntry, SignalLedger} from './ledger.ts';

export interface IngestDependencies {
    ledger: SignalLedger;
    exemplars: ExemplarStore;
    /**
     * Called once per event the ingest has accepted, before any of that event's deltas are
     * published. The causal lineage index needs the raw event, and it must hold the record
     * *before* the deltas are published — otherwise a consumer reading the lineage for this
     * record would find it missing. A skipped event is deliberately not reported: it was never
     * observed.
     */
    onAccepted?: (event: IngestEvent) => void;
    /**
     * Called once per signal the ledger has never held before. Deliberately *not* called for a
     * repeat occurrence: a count going up is not a change to the set of signals, and a delta
     * stream that re-announced a signal on every event would be a record stream with extra steps.
     */
    onSignalAdded?: (entry: SignalEntry) => void;
    /**
     * Called when a record is retained as an exemplar (PRD R8/R13), so the digest can carry the
     * pointer without the consumer reading the record. It fires only when the store actually kept
     * the record — once a signal's exemplar slots are full, later occurrences are counted and
     * nothing else.
     */
    onExemplar?: (entry: SignalEntry, recordId: string) => void;
}

export interface IngestResult {
    /** Events that were ingested — the batch size, since a batch is accepted or rejected whole. */
    accepted: number;
    /** Signals in the ledger after this batch — not the batch's new ones. */
    signals: number;
}

function isFlow(value: unknown): value is {id: string} {
    const candidate = value as {id?: unknown} | null | undefined;
    // Only the shape the pipeline dereferences is structural: a flow whose `id`
    // is not a string cannot be attributed at all, so the batch is malformed. A
    // string that is not a ULID is a *data* surprise instead — the ledger counts it
    // as a straggler rather than throwing, because an unplaced identity arriving
    // over the wire must not be able to break ingestion (D3).
    return Boolean(candidate && typeof candidate.id === 'string');
}

/**
 * Is this a well-formed event? The guard covers the fields the pipeline needs before it touches
 * them, and the identifier is one of them — it is the key, so an event without one names nothing
 * to count. It is the only identifier that is required: the service deliberately does not check it
 * against a vocabulary, because the vocabulary lives in the process that emits.
 *
 * A **flow** is the second way to be attributable (@@D-940), and it is the ordinary one: a served
 * request's records are emitted by the realm and the runtime, none of which reaches a declaration,
 * yet each of them belongs to the execution the route minted. Such an event is placed on that
 * execution and in the lineage and is deliberately not counted against any signal — the signal
 * ledger is the index of what was *declared*, and inventing a key for it would put a name in a
 * filter that no source contains. An event that names neither is malformed, as before.
 */
function isEvent(value: unknown): value is IngestEvent {
    const candidate = value as Partial<IngestEvent> | undefined;
    const named = typeof candidate?.signal === 'string' && candidate.signal.length > 0;
    const flowId = (candidate?.flow as {id?: unknown} | undefined)?.id;
    const attributed = typeof flowId === 'string' && flowId.length > 0;
    return Boolean(
        candidate &&
        typeof candidate.id === 'string' &&
        (named || attributed) &&
        typeof candidate.service === 'string' &&
        (candidate.flow === undefined || isFlow(candidate.flow)),
    );
}

/**
 * What one event yields once it has been placed on the ledger.
 *
 * The lookup and the write are kept apart because the states they leave behind differ: a batch
 * rejected before the write touches nothing, while a callback that throws during the write leaves
 * an entry that has been counted and an exemplar that has been kept.
 */
interface PreparedEvent {
    event: IngestEvent;
    /**
     * The signal the event counts against, absent for an event that only a flow attributes — it is
     * still accepted and still observed by the lineage and the flow ledger, and there is no ledger
     * entry for it to be placed on (@@D-940).
     */
    ref?: string;
    novel?: boolean;
}

export function createIngest(
    dependencies: IngestDependencies,
): (body: unknown) => Promise<IngestResult> {
    const {ledger, exemplars} = dependencies;

    /** Place one event: which entry it counts against, and whether that entry is new. */
    function prepare(event: IngestEvent): PreparedEvent {
        if (event.signal === undefined || event.signal.length === 0) {
            return {event};
        }
        return {event, ref: event.signal, novel: ledger.get(event.signal) === undefined};
    }

    /**
     * Count the event, retain its exemplar and announce it. This runs outside the event's try: a
     * failure here is a defect in the service, not in the event's data, and must not be reported as
     * a skip for an event that is already on the ledger. Retention precedes publication so a
     * callback that throws cannot cost the event its exemplar.
     */
    function commit(prepared: PreparedEvent): void {
        // The record joins the causal index before any of its deltas are published, so a consumer
        // of this signal never reads a lineage that does not hold the record it names. It also
        // reaches the flow ledger here, which is what an event with no signal has *instead* of an
        // entry: the execution it belongs to names it (@@D-940).
        dependencies.onAccepted?.(prepared.event);
        const ref = prepared.ref;
        if (ref === undefined) return;
        const {entry, novel} = ledger.upsert(prepared.event);
        // Retention precedes *any* publication, including the first-sighting announcement below:
        // the exemplar is in the store and on the entry before the first callback runs, so no
        // callback that throws — `onSignalAdded` included — can cost a registered event its
        // exemplar.
        const retained = exemplars.offer(ref, prepared.event);
        if (retained) {
            entry.exemplars.push(prepared.event.id);
        }
        if (novel) {
            // A delta, not a record (R8): the signal was not on the ledger before this event,
            // which is the only sense in which it is "new".
            dependencies.onSignalAdded?.(entry);
        }
        if (retained) {
            // The exemplar delta is published after the first-sighting delta so one event's
            // deltas read in the order the digest advertises: the signal appeared, and here is
            // where a full example can be fetched. The state change still happened before both,
            // which is the ordering that matters.
            dependencies.onExemplar?.(entry, prepared.event.id);
        }
    }

    /** Ingest one batch. */
    return async function ingest(body: unknown): Promise<IngestResult> {
        const events = (body as {events?: unknown[]} | undefined)?.events;
        if (!Array.isArray(events) || !events.every(isEvent)) {
            throw new Error('ingest: expected {events: IngestEvent[]}');
        }
        for (const event of events) {
            commit(prepare(event));
        }
        return {accepted: events.length, signals: ledger.size()};
    };
}
