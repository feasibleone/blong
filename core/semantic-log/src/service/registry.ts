/**
 * Template registry (PRD R4, R12).
 *
 * Keyed by the emitter's fingerprint, so the key is computed offline by the
 * emitter (R12: stable across deploys) and the service does no identity work.
 * Registry entries — not records — are the durable artifact.
 */

import {isLegId, isLegSeq, isServiceName, type LegIdentity} from '../context.ts';
import {REF_LENGTH} from '../refs.ts';

export interface IngestEvent {
    id: string;
    time: number;
    fingerprint: string;
    /** The structural signature the fingerprint was derived from. */
    template?: string;
    service: string;
    level?: number;
    levelName?: string;
    msg?: string;
    /**
     * The operation the record was emitted for (`LogRecord.operation`), when the
     * emitter supplies one. Optional for the same reason as the rest of the
     * event: an emitter that omits it still ingests, and the lineage node simply
     * carries no operation.
     */
    operation?: string;
    /**
     * Cross-record references, all optional. `record` is the emitter's own id
     * and `trace` is the W3C trace context (PRD R7); `parent` is the record
     * that caused this one (PRD R7, added by Task 7).
     *
     * `parent` is optional on the wire for the same reason the whole group is:
     * a participant that has not been updated to emit it must still ingest, and
     * its absence degrades the *precision* of the causal chain without removing
     * the correlation — the trace id still groups its records and time still
     * orders them (`service/lineage.ts`). A trace is not a flow: a flow is one
     * caller-minted execution ULID (`flow.id`) and a trace may span more than
     * one of them, so lineage keys on `trace` and drift keys on `flow.kind`
     * (D2/D4, ruled 2026-09-13) — neither substitutes for the other.
     */
    refs?: {record?: string; trace?: string; parent?: string};
    intent?: {name: string};
    /**
     * Flow position, when the event belongs to a flow (PRD R9). Optional by
     * design: an emitter that predates flow context still ingests, and a record
     * with no flow simply does not participate in flow-level drift (PRD R6c).
     *
     * The identity has two parts. `id` is the caller-minted execution ULID —
     * *which run* — and is what the ingest discriminates one execution from the
     * next by. `kind` is the stable process name (e.g. `transfer.single`) —
     * *which recurring process* — and is the key the drift observation is made
     * under, because a value naming one execution would give every drift key a
     * single observation. `kind` is optional on the wire for the same reason the
     * whole flow is: an emitter that does not send one still ingests, and its
     * flow is simply not observed for drift (D3: an unexpected identity arriving
     * on the wire is reported, never thrown).
     *
     * `leg`, `legFrom`, `legTo` and `legSeq` are the call the record belongs to (PRD R22):
     * the method it was addressed by, the logical unit that declared the call, the
     * participant the caller expected to answer, and its position in the execution. `legTo`
     * is present on the caller's own records only, and it is what keeps an **attempt** on the
     * record when nothing answers — the receiver may be missing, failing or wired to the
     * wrong address, and the edge is then a fact about the deployment rather than a line that
     * cannot be drawn.
     */
    flow?: {
        id: string;
        kind?: string;
        step?: string;
        index?: number;
        status?: string;
        leg?: string;
        legFrom?: string;
        legTo?: string;
        legSeq?: string;
    };
}

/**
 * The call an event belongs to, or `undefined` when it names none (PRD R22).
 *
 * Read here, beside the event type, because every consumer of the wire format needs
 * the *same* verdict — the flow shape, the lineage node and the flow ledger — and
 * the rule is not obvious: every field arrived from another process, so one the
 * grammar rejects is treated exactly as an absent one. An unbalanced peer must not
 * be able to put a value into an observed shape that the shape cannot carry, and it
 * must not turn ingestion into a 500 either (D3: caller misuse throws, a wire
 * surprise is reported, never thrown).
 *
 * No counter accompanies an unusable leg, unlike an unusable flow `kind`: a kind is
 * the drift key, so losing one leaves R6c *inert* and the loss has to be visible. A
 * leg is an attribution, and losing one costs that call its edge — which the union
 * reports by simply not having it.
 */
export function legOf(event: IngestEvent): LegIdentity | undefined {
    const leg = event.flow?.leg;
    if (typeof leg !== 'string' || !isLegId(leg)) {
        return undefined;
    }
    const from = event.flow?.legFrom;
    const to = event.flow?.legTo;
    const seq = event.flow?.legSeq;
    return {
        id: leg,
        from: typeof from === 'string' && isServiceName(from) ? from : undefined,
        to: typeof to === 'string' && isServiceName(to) ? to : undefined,
        seq: typeof seq === 'string' && isLegSeq(seq) ? seq : undefined,
    };
}

export interface TemplateEntry {
    /** Short stable reference, derived from the fingerprint. */
    ref: string;
    fingerprint: string;
    signature: string;
    service: string;
    level?: number;
    levelName?: string;
    count: number;
    firstSeen: number;
    lastSeen: number;
    retiredAt?: number;
    centroid?: number[];
    /** Record ids retained as exemplars (PRD R13). */
    exemplars: string[];
    /**
     * Detector bookkeeping. Drift has no field here on purpose: it is observed
     * per flow (PRD R6c), never per template, so no template can drift.
     */
    alerts: {noveltyAt?: number; rateShiftAt?: number};
    /** Intent names seen for this template. */
    intents: string[];
}

export interface UpsertResult {
    entry: TemplateEntry;
    novel: boolean;
}

/** The short reference for a fingerprint — the emitter's own cut (PRD R12). */
export function refFromFingerprint(fingerprint: string): string {
    return fingerprint.slice(0, REF_LENGTH);
}

export class TemplateRegistry {
    private readonly entries = new Map<string, TemplateEntry>();

    /** Create or update the entry for an event's fingerprint. */
    upsert(event: IngestEvent, centroid?: number[]): UpsertResult {
        const ref = refFromFingerprint(event.fingerprint);
        const existing = this.entries.get(ref);
        if (existing) {
            existing.count++;
            existing.lastSeen = Math.max(existing.lastSeen, event.time);
            // A template observed again *after* it was retired is back: clearing
            // `retiredAt` is what stops it silently absorbing events while the
            // deploy diff reports it as gone in every window forever (see
            // `search.ts`). The observation must be at or after the retirement
            // moment — a straggler replay of an older record must not resurrect a
            // template the operator retired — and the check is against the
            // event's time, not arrival order, because the wire is fire-and-forget
            // and may deliver out of order.
            if (existing.retiredAt !== undefined && event.time >= existing.retiredAt) {
                existing.retiredAt = undefined;
            }
            if (centroid) {
                // Copy on store: the caller may hand in the embedding cache's own
                // array (Task 6 does), and the registry must never alias it.
                existing.centroid = [...centroid];
            }
            if (event.intent?.name && !existing.intents.includes(event.intent.name)) {
                existing.intents.push(event.intent.name);
            }
            return {entry: existing, novel: false};
        }
        const entry: TemplateEntry = {
            ref,
            fingerprint: event.fingerprint,
            signature: event.template ?? '',
            service: event.service,
            level: event.level,
            levelName: event.levelName,
            count: 1,
            firstSeen: event.time,
            lastSeen: event.time,
            centroid: centroid ? [...centroid] : undefined,
            exemplars: [],
            alerts: {},
            intents: event.intent?.name ? [event.intent.name] : [],
        };
        this.entries.set(ref, entry);
        return {entry, novel: true};
    }

    /** Record an occurrence without re-deriving identity (used by the rate detector). */
    bump(ref: string, time: number): TemplateEntry | undefined {
        const entry = this.entries.get(ref);
        if (!entry) return undefined;
        entry.count++;
        entry.lastSeen = Math.max(entry.lastSeen, time);
        return entry;
    }

    get(ref: string): TemplateEntry | undefined {
        return this.entries.get(ref);
    }

    list(): TemplateEntry[] {
        return [...this.entries.values()];
    }

    size(): number {
        return this.entries.size;
    }

    /**
     * Mark a template as no longer observed, keeping it readable (PRD R8/R14).
     * Called by the retirement route (`POST /templates/:ref/retire`), which is
     * what publishes the `template-retired` digest delta; nothing else retires a
     * template (there is no implicit TTL — see `.github/memory/decision.md`,
     * Task 12).
     *
     * Retirement is **reversible**, not final: a later `upsert` whose event time
     * is at or after this moment clears `retiredAt`. A standing retirement would
     * make the deploy diff's `removed` bucket permanent — the entry stays
     * readable and keeps counting, so a template retired while still live would
     * be reported as gone in every window. See `search.ts` for the window bound
     * that pairs with this.
     */
    retire(ref: string, at: number): TemplateEntry | undefined {
        const entry = this.entries.get(ref);
        if (entry) {
            entry.retiredAt = at;
        }
        return entry;
    }

    /** Replace the whole registry contents (used by the persistence loader). */
    replaceAll(entries: TemplateEntry[]): void {
        this.entries.clear();
        for (const entry of entries) {
            this.entries.set(entry.ref, entry);
        }
    }
}
