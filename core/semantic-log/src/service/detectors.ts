/**
 * The three detectors (PRD R6).
 *
 * They are deliberately separate event types — R6a novelty, R6b rate-shift,
 * R6c drift — because a new behaviour, a known behaviour at an unusual rate,
 * and a known behaviour that has changed shape call for different operator
 * responses, so collapsing them into one score would destroy the information
 * that makes this system useful.
 *
 * Drift compares the vector it is handed with the moving-average centroid kept
 * by `DriftTracker`, under the key it is handed — and the key is the caller's
 * choice, because it is the granularity that makes drift meaningful. The ingest
 * hands drift a **flow** key (`observation.drift`), never a template one: a
 * template's embedding is keyed by the fingerprint that identifies it, so its
 * vector is the same every time and a per-template distance is always 0 and can
 * never fire, however long the service runs; a flow's shape really does move.
 * Supplying an observation whose shape actually moved is the ingest's job, not
 * something a detector can compensate for after the fact. The drift tests below
 * feed vectors directly: they pin the detector's contract and are not evidence
 * that drift fires through the ingest route.
 *
 * The rate baseline is per template, in `RateTracker`, and never global: a
 * global threshold would flag a chatty template as permanently anomalous and a
 * quiet one as never anomalous. A template's own completed windows are the
 * baseline, and its threshold is read through the tracker so the suite cannot
 * hold a second copy that drifts out of tune with the one being compared
 * against.
 */

import {DriftTracker, type DriftOptions} from './centroid.ts';

export type AnomalyKind = 'novelty' | 'rate-shift' | 'drift';

export interface Anomaly {
    kind: AnomalyKind;
    ref: string;
    time: number;
    /** Kind-specific magnitude: z-score for rate-shift, distance for drift. */
    magnitude?: number;
    detail?: string;
}

export interface RateOptions {
    /** Bucket width. */
    windowMs: number;
    /** Completed buckets used as the baseline. */
    buckets: number;
    /** Standard deviations above the baseline mean that constitute a surge. */
    zThreshold: number;
}

export interface DetectorOptions {
    drift: DriftOptions;
    rate: RateOptions;
}

export interface Observation {
    /** The template's reference — what novelty and rate-shift are keyed by. */
    ref: string;
    novel: boolean;
    time: number;
    /** Unit vector for the template's current observation. */
    vector: number[];
    /**
     * The drift observation, when drift is measured at a different granularity
     * than novelty and rate-shift (PRD R6c: a flow's shape moves, a template's
     * vector cannot). `{ref, vector}` measures drift under that key while
     * novelty and rate stay on `ref`; `null` performs no drift observation for
     * this event at all; omitted, this observation is its own drift observation,
     * which is the single-vector case the detector's own tests pin. The key
     * given here is the one the anomaly reports. A caller observing at two
     * granularities must not pass the same key in both roles: rate-shift stays
     * keyed by `ref` alone, so a flow's stable kind handed here *and* in `ref`
     * would give the flow a rate baseline it has no business having. The ingest
     * passes a template `ref` and a flow `drift.ref`, so the two never collide.
     */
    drift?: {ref: string; vector: number[]} | null;
}

/**
 * A per-template occurrence counter.
 *
 * Occurrences are counted into fixed-width windows; when a window closes the
 * count joins a bounded history, and once the history is full its mean and
 * standard deviation are the baseline the new window is scored against. A
 * baseline of nothing but equal counts has zero deviation, which has no
 * z-score: any occurrence above that flat mean is reported as an unbounded
 * score (see `DetectorSuite.observe`, which distinguishes that case in
 * `detail`) rather than being divided by zero.
 */
class RateTracker {
    private readonly buckets = new Map<string, {windowStart: number; count: number; history: number[]}>();
    private readonly options: RateOptions;

    constructor(options: RateOptions) {
        this.options = options;
    }

    /**
     * The surge threshold, exposed here so the suite reads the same value the
     * scoring uses instead of duplicating it and drifting out of tune.
     */
    get zThreshold(): number {
        return this.options.zThreshold;
    }

    /** Record an occurrence; returns a z-score once enough baseline exists. */
    observe(ref: string, time: number): number | undefined {
        const windowStart = Math.floor(time / this.options.windowMs) * this.options.windowMs;
        let state = this.buckets.get(ref);
        if (!state) {
            state = {windowStart, count: 0, history: []};
            this.buckets.set(ref, state);
        }
        if (windowStart !== state.windowStart) {
            state.history.push(state.count);
            while (state.history.length > this.options.buckets) {
                state.history.shift();
            }
            state.windowStart = windowStart;
            state.count = 0;
        }
        state.count++;
        if (state.history.length < this.options.buckets) {
            return undefined;
        }
        const mean = state.history.reduce((sum, value) => sum + value, 0) / state.history.length;
        const variance = state.history.reduce((sum, value) => sum + (value - mean) ** 2, 0) / state.history.length;
        const deviation = Math.sqrt(variance);
        if (deviation === 0) {
            return state.count > mean ? Number.POSITIVE_INFINITY : 0;
        }
        return (state.count - mean) / deviation;
    }
}

export class DetectorSuite {
    private readonly drift: DriftTracker;
    private readonly rate: RateTracker;

    constructor(options: DetectorOptions) {
        this.drift = new DriftTracker(options.drift);
        this.rate = new RateTracker(options.rate);
    }

    /** Feed one observation and receive every anomaly it triggered. */
    observe(observation: Observation): Anomaly[] {
        const anomalies: Anomaly[] = [];
        if (observation.novel) {
            anomalies.push({kind: 'novelty', ref: observation.ref, time: observation.time});
        }
        // The drift key is separate from the template, and `null` withholds it
        // entirely: a template must not acquire a drift baseline, and the key
        // that carries drift must not acquire a rate one (R6c).
        const drift =
            observation.drift === null
                ? undefined
                : (observation.drift ?? {ref: observation.ref, vector: observation.vector});
        if (drift) {
            const result = this.drift.observe(drift.ref, drift.vector);
            if (result.drifted) {
                anomalies.push({
                    kind: 'drift',
                    ref: drift.ref,
                    time: observation.time,
                    magnitude: result.distance,
                    detail: `distance ${result.distance.toFixed(3)}`,
                });
            }
        }
        const z = this.rate.observe(observation.ref, observation.time);
        if (z !== undefined && z > this.rate.zThreshold) {
            anomalies.push({
                kind: 'rate-shift',
                ref: observation.ref,
                time: observation.time,
                magnitude: Number.isFinite(z) ? z : undefined,
                detail: Number.isFinite(z) ? `z=${z.toFixed(2)}` : 'first observation above a flat baseline',
            });
        }
        return anomalies;
    }

    /**
     * The authoritative moving-average centroid for a key — in this service, a
     * flow's stable kind, `flow.kind` (PRD R6c, D4) — or `undefined` when the
     * key has never been observed.
     * The delegation keeps `DriftTracker`'s copy-on-read contract: the returned
     * array is the caller's, and an unobserved key is `undefined` rather than a
     * zero vector.
     */
    centroidOf(ref: string): number[] | undefined {
        return this.drift.centroidOf(ref);
    }
}
