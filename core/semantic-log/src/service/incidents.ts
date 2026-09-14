/**
 * Cross-service incident correlation (PRD R15).
 *
 * A single failure spans services and produces one anomaly per service. Without
 * correlation that is an alert storm in which every participant looks guilty;
 * with it, the services are grouped by trace and the anomaly closest to the
 * trace root is named as the candidate origin — the only attribution that helps
 * an operator.
 *
 * **Attribution is by observation, not by template membership.** An anomaly is
 * raised while observing one event, and that event's record is in the lineage
 * index under the same fingerprint and time, so an anomaly is attributed to the
 * trace of the retained record with that fingerprint whose time is nearest the
 * anomaly's own. The brief's sketch assigned each anomaly to *every* trace that
 * had ever used its template, which made one template shared by two traces
 * produce two incidents from a single anomaly — the "one alert per service"
 * storm R15 exists to prevent, one level up — and its own second acceptance test
 * fails under that reading. The tests are the contract, so the single
 * attribution is what ships; the deviation is recorded in
 * `.github/memory/decision.md`.
 *
 * An anomaly whose reference no retained record matches is grouped under
 * `untraced:<ref>` rather than dropped or attributed to a neighbouring trace: an
 * anomaly that cannot be placed is still a signal an operator must see, and
 * inventing a trace for it would put it in a correlation it does not belong to.
 * This is also where a `drift` anomaly lands in production: drift is keyed by the
 * flow **kind**, not by a template fingerprint (D4), and `Anomaly` carries no
 * trace, so drift incidents group by kind — recorded in `.github/memory/todo.md`.
 *
 * **A correlation is two *anomalies*, not two services.** Grouping is by trace
 * and window alone (see `groupByTrace`), so two anomalies from the *same*
 * service on one trace do form an incident, with `services.length === 1`.
 * `MIN_CORRELATION_SIZE` counts anomalies, never distinct services. That is
 * deliberate and is not an R15 violation — R15 requires only that two services
 * yield one incident — and joining two detectors (a `novelty` and a
 * `rate-shift`, say) on one trace is the useful answer, not the alert storm the
 * threshold exists to prevent. It differs from the natural reading of
 * "cross-service", so it is stated here rather than left to be inferred.
 *
 * **The store accumulates across batches, and reports only change.** A
 * cross-service incident is by definition assembled from anomalies that arrive
 * in different ingest batches (each service emits its own), so the store keeps a
 * bounded buffer of recent anomalies and re-derives incidents from it on every
 * `absorb`. Because a re-derivation returns every incident the buffer still
 * supports, `absorb` returns only the incidents that are **new or changed** —
 * otherwise a `GET /digest` consumer would see every retained incident
 * republished on every batch, a delta storm in the stream R8 exists to keep
 * readable. A group of one anomaly is not retained at all (see
 * {@link MIN_CORRELATION_SIZE}). `list()` is the full retained set for
 * `GET /incidents`.
 */

import type {Anomaly, AnomalyKind} from './detectors.ts';
import type {LineageIndex} from './lineage.ts';
import type {TemplateRegistry} from './registry.ts';

export interface Incident {
    id: string;
    trace: string;
    rootCause: string;
    services: string[];
    refs: string[];
    kinds: AnomalyKind[];
    firstAt: number;
    lastAt: number;
    severity: number;
    anomalies: Anomaly[];
}

interface Group {
    trace: string;
    anomalies: Anomaly[];
}

/** The prefix an anomaly that names no retained trace is grouped under. */
const UNTRACED_PREFIX = 'untraced:';

/**
 * How many recent anomalies the store keeps for cross-batch correlation. A
 * count, not a time span: the trigger is an anomaly arriving, and the incident
 * window already bounds how far apart the anomalies of one incident may be. The
 * cap mirrors `LogDigest`'s entry count — an incident is assembled from a
 * change stream, so a buffer of the same order as the stream is the honest bound
 * — and it is what stops the store growing with traffic.
 */
const DEFAULT_ANOMALY_BUFFER = 1000;

/**
 * The smallest group that is a **correlation**. R15 is about joining anomalies
 * that arrived apart — one per service, or one per batch — so a lone anomaly is
 * not an incident: it is already the `anomaly` delta R8 publishes, and
 * republishing every anomaly as an incident would be the alert storm R15 exists
 * to prevent (and, for an anomaly that carries no trace, would add a retained
 * incident once per event). The store therefore keeps only groups of two or
 * more; `correlate` itself is deliberately unfiltered, because it groups and
 * does not judge.
 */
const MIN_CORRELATION_SIZE = 2;

/**
 * The trace an anomaly was observed on, or an `untraced:` key when no retained
 * record matches it.
 *
 * The nearest-time match, rather than an exact one, is deliberate: the anomaly
 * and its record share the event's time, but the record may have been re-`add`ed
 * under a redelivery's time (or the emitter's clock may repeat), and a nearest
 * match still lands on the record the anomaly describes. Ties keep the first
 * trace in the index's insertion order, which makes the attribution
 * deterministic without a second sort.
 */
function traceOf(anomaly: Anomaly, lineage: LineageIndex): string {
    let bestTrace = '';
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const traceId of lineage.traceIds()) {
        for (const node of lineage.trace(traceId)) {
            if (node.fingerprint !== anomaly.ref) {
                continue;
            }
            const distance = Math.abs(node.time - anomaly.time);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestTrace = traceId;
            }
        }
    }
    return bestTrace === '' ? `${UNTRACED_PREFIX}${anomaly.ref}` : bestTrace;
}

/**
 * Attribute each anomaly to one trace and split each trace's anomalies into
 * bursts no farther apart than `windowMs`: one trace can carry two unrelated
 * failures, and merging them would name one root cause for two incidents.
 */
function groupByTrace(anomalies: Anomaly[], lineage: LineageIndex, windowMs: number): Group[] {
    const groups = new Map<string, Anomaly[]>();
    for (const anomaly of anomalies) {
        const trace = traceOf(anomaly, lineage);
        const bucket = groups.get(trace) ?? [];
        bucket.push(anomaly);
        groups.set(trace, bucket);
    }
    const result: Group[] = [];
    for (const [trace, bucket] of groups) {
        const sorted = [...bucket].sort((a, b) => a.time - b.time);
        let current: Anomaly[] = [sorted[0]];
        for (const anomaly of sorted.slice(1)) {
            if (anomaly.time - current[0].time <= windowMs) {
                current.push(anomaly);
            } else {
                result.push({trace, anomalies: current});
                current = [anomaly];
            }
        }
        result.push({trace, anomalies: current});
    }
    return result;
}

/**
 * Group anomalies into incidents, naming a candidate root cause for each.
 *
 * The origin is the anomaly whose record sits closest to the trace root, read as
 * the shortest parent chain — the record that the causal graph says happened
 * before the others. A record with no chain length to offer (an untraced
 * anomaly, whose group has no lineage nodes at all) keeps its own reference as
 * the reported origin rather than being given a fabricated record id.
 */
export function correlate(
    anomalies: Anomaly[],
    lineage: LineageIndex,
    registry: TemplateRegistry,
    windowMs: number,
): Incident[] {
    const incidents: Incident[] = [];
    for (const group of groupByTrace(anomalies, lineage, windowMs)) {
        const services = new Set<string>();
        const refs = new Set<string>();
        const kinds = new Set<AnomalyKind>();
        for (const anomaly of group.anomalies) {
            refs.add(anomaly.ref);
            kinds.add(anomaly.kind);
            // A template the registry has never held names no service: the
            // anomaly is still reported, because the record it came from is real,
            // but its lack of a service is not turned into a fabricated one.
            const entry = registry.get(anomaly.ref);
            if (entry) {
                services.add(entry.service);
            }
        }

        let rootCause = group.anomalies[0].ref;
        let bestDepth = Number.POSITIVE_INFINITY;
        for (const anomaly of group.anomalies) {
            const nodes = lineage.trace(group.trace).filter(node => node.fingerprint === anomaly.ref);
            for (const node of nodes) {
                // `chain` returns at least the node itself for a record the trace
                // listing holds, so every candidate has a depth to compare.
                const depth = lineage.chain(node.id).length;
                if (depth < bestDepth) {
                    bestDepth = depth;
                    rootCause = node.id;
                }
            }
        }

        const times = group.anomalies.map(anomaly => anomaly.time);
        incidents.push({
            // Provisional only. A pure grouping has no history to anchor an
            // identity to, and the group's running minimum moves when a late,
            // lower-timestamped anomaly joins it — so the store resolves the
            // stable identity of an incident it grows (`IncidentStore.identityOf`).
            id: `inc-${group.trace}-${Math.min(...times)}`,
            trace: group.trace,
            rootCause,
            services: [...services],
            refs: [...refs],
            kinds: [...kinds],
            firstAt: Math.min(...times),
            lastAt: Math.max(...times),
            severity: services.size + kinds.size,
            anomalies: group.anomalies,
        });
    }
    return incidents.sort((a, b) => a.firstAt - b.firstAt);
}

/**
 * Accumulates incidents across ingest batches.
 *
 * The buffer is the correlation *input*: anomalies from every recent batch are
 * re-correlated together, which is what lets an incident name the services of a
 * failure whose anomalies arrived one service at a time. Incidents the store has
 * already reported at their current size are not returned again — see the module
 * doc — while `list()` keeps every incident the store has ever opened, which is
 * the `GET /incidents` surface.
 */
export class IncidentStore {
    private readonly incidents = new Map<string, Incident>();
    private readonly recent: Anomaly[] = [];
    private readonly signatures = new Map<string, string>();
    private readonly bufferLimit: number;

    constructor(bufferLimit: number = DEFAULT_ANOMALY_BUFFER) {
        this.bufferLimit = Math.max(1, bufferLimit);
    }

    /**
     * Fold this batch's anomalies into the retained buffer, re-correlate, and
     * return the incidents that are new or have grown. An empty batch is normal
     * (most events raise no anomaly) and is not a no-op: it still re-derives,
     * which is how a batch whose events arrived *before* its anomalies are
     * correlated by the next call. A group of fewer than
     * {@link MIN_CORRELATION_SIZE} anomalies is skipped entirely — not retained
     * and not reported.
     */
    absorb(anomalies: Anomaly[], lineage: LineageIndex, registry: TemplateRegistry, windowMs: number): Incident[] {
        for (const anomaly of anomalies) {
            this.recent.push(anomaly);
        }
        while (this.recent.length > this.bufferLimit) {
            this.recent.shift();
        }
        const changed: Incident[] = [];
        for (const incident of correlate(this.recent, lineage, registry, windowMs)) {
            if (incident.anomalies.length < MIN_CORRELATION_SIZE) {
                continue;
            }
            incident.id = this.identityOf(incident);
            const signature = `${incident.services.length}:${incident.kinds.length}:${incident.anomalies.length}`;
            this.incidents.set(incident.id, copyIncident(incident));
            if (this.signatures.get(incident.id) !== signature) {
                this.signatures.set(incident.id, signature);
                changed.push(copyIncident(incident));
            }
        }
        return changed;
    }

    /**
     * The identity an incident is stored and reported under: the id of the
     * incident this correlation has **grown from**, or a fresh id when the burst
     * is genuinely new.
     *
     * Identity is the trace and the burst, never the running minimum of the
     * group's emitter-clock times. The wire clock is the emitter's and two
     * hosts' clocks are not comparable — the premise this whole design rests on
     * — so a later batch can carry an anomaly with an *earlier* timestamp than
     * the batch that opened the incident. A `Math.min` id would then differ from
     * the stored one, `incidents` would hold two entries for one trace (one
     * incident per batch, the alert storm R15 exists to prevent, one level up),
     * and `list()` would return both. Correlation re-reads the retained anomaly
     * objects on every batch, so an incident that grew still shares an anomaly
     * *reference* with the one already stored: that shared reference is the
     * burst's identity, and matching on it keeps the original id.
     */
    private identityOf(incident: Incident): string {
        for (const existing of this.incidents.values()) {
            if (existing.trace !== incident.trace) {
                continue;
            }
            if (existing.anomalies.some(anomaly => incident.anomalies.includes(anomaly))) {
                return existing.id;
            }
        }
        return incident.id;
    }

    /** Every incident the store has opened, newest first. */
    list(): Incident[] {
        return [...this.incidents.values()].sort((a, b) => b.lastAt - a.lastAt).map(copyIncident);
    }
}

/**
 * A copy of an incident that shares nothing mutable with the store. The anomaly
 * objects inside stay by reference — an `Anomaly` is a plain detector output the
 * store never edits, and correlation re-reads them by identity (see
 * `identityOf`) — but the incident's own arrays are fresh, so a caller cannot add
 * a service, reorder a ref or empty the anomalies and change what the store
 * reports next time. The same ownership rule `LineageIndex.trace()` and
 * `FlowDriftHistory.inWindow` follow.
 */
function copyIncident(incident: Incident): Incident {
    return {
        ...incident,
        services: [...incident.services],
        refs: [...incident.refs],
        kinds: [...incident.kinds],
        anomalies: [...incident.anomalies],
    };
}
