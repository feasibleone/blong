/**
 * Centroids and drift (PRD R6c).
 *
 * The centroid is a moving average, not a fixed reference: that is what lets a
 * deliberate rewording of a message settle into a new stable position instead
 * of alerting forever, while still flagging the step change a rewording
 * produces.
 *
 * Which centroid is authoritative, and at which granularity.
 * `centroidOf(ref)` is the read surface for a **flow's** drifting centroid
 * (PRD R6c), and the key it is read under is the flow's stable **process name**
 * (`flow.kind`, ruled 2026-09-13, D4). A flow's *shape*
 * genuinely changes over time (a step appears, disappears or reorders), so a
 * moving average over the same process's own observations describes how that
 * process behaves now. A **template** similarity search (PRD R14) is a different
 * granularity, not a competing candidate for the same value, and it must not
 * rank on this tracker: it ranks templates, and a template's vector is constant
 * by construction — the embedding is keyed by the same fingerprint that
 * identifies the template — so the registry's `entry.centroid` *is* the right
 * basis for that ranking. Ranking templates here would find nothing, because a
 * template key only ever receives that same constant vector.
 *
 * No centroid to compare against. `centroidOf` returns `undefined` for a key
 * this tracker has never observed — a flow whose first completed shape has not
 * arrived, or an empty tracker after a restart. That is not an empty vector and
 * must not be treated as one: zero similarity and "nothing to compare against"
 * are different answers. A consumer must fall back explicitly — for example by
 * treating the flow as unranked until it has completed once — rather than
 * passing a zero vector into `cosine`, which would rank every candidate as
 * equally dissimilar without saying so.
 *
 * Width. `cosine`, `distance` and `updateCentroid` all require their two vector
 * arguments to have the same width, and all three throw `RangeError` when they
 * do not. Truncating to the shorter length produces a plausible but wrong
 * number, which is the worst possible failure for a ranking path, and padding
 * with zeros invents a direction out of a missing observation. The width is the
 * embedding provider's, and nothing else reconciles the provider's declared
 * dimension with the length it actually returns, so a mismatch is a real defect
 * the caller must handle rather than something to absorb silently.
 *
 * Ownership. Every vector that leaves this module is a fresh copy and belongs to
 * the caller. `observe` copies on store and `centroidOf` copies on read, so no
 * holder of a returned array can mutate the tracker's state or observe another
 * caller's edits.
 */

export interface DriftOptions {
    /** Distance above which an observation is reported as drift. */
    epsilon: number;
    /** Weight of a new observation when moving the centroid (0..1). */
    learningRate: number;
}

export interface DriftResult {
    drifted: boolean;
    distance: number;
}

/**
 * Cosine similarity. Inputs are expected to be unit vectors.
 *
 * The two vectors must have the same width (see the module doc comment); a
 * mismatch throws `RangeError` rather than being silently truncated.
 */
export function cosine(a: readonly number[], b: readonly number[]): number {
    if (a.length !== b.length) {
        throw new RangeError(`cosine: width mismatch (${a.length} !== ${b.length})`);
    }
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
    }
    return dot;
}

/**
 * Dissimilarity derived from the cosine similarity, so it is 0 for identical
 * vectors. As with `cosine`, a width mismatch throws `RangeError`.
 */
export function distance(a: readonly number[], b: readonly number[]): number {
    if (a.length !== b.length) {
        throw new RangeError(`distance: width mismatch (${a.length} !== ${b.length})`);
    }
    return 1 - cosine(a, b);
}

/**
 * Move `current` toward `next` by `rate`.
 *
 * The two vectors must have the same width (see the module doc comment); a
 * mismatch throws `RangeError` rather than being padded or truncated.
 */
export function updateCentroid(current: readonly number[], next: readonly number[], rate: number): number[] {
    if (current.length !== next.length) {
        throw new RangeError(`updateCentroid: width mismatch (${current.length} !== ${next.length})`);
    }
    return current.map((value, index) => value + rate * (next[index] - value));
}

/**
 * A moving-average centroid per key.
 *
 * The class is granularity-agnostic — it keys its map by whatever `ref` it is
 * handed — and the caller decides what a key means. The cluster service keys it
 * by **`flow.kind`**, the stable process name (PRD R6c, D4); see the module doc
 * comment for why a template ref is not the right key.
 */
export class DriftTracker {
    private readonly centroids = new Map<string, number[]>();
    private readonly options: DriftOptions;

    constructor(options: DriftOptions) {
        this.options = options;
    }

    /** Record an observation, returning whether it constitutes drift. */
    observe(ref: string, vector: number[]): DriftResult {
        const current = this.centroids.get(ref);
        if (!current) {
            this.centroids.set(ref, [...vector]);
            return {drifted: false, distance: 0};
        }
        const observed = distance(current, vector);
        this.centroids.set(ref, updateCentroid(current, vector, this.options.learningRate));
        return {drifted: observed > this.options.epsilon, distance: observed};
    }

    /**
     * The authoritative moving-average centroid for `ref`, or `undefined` when
     * the reference has never been observed. The array is a copy the caller owns.
     */
    centroidOf(ref: string): number[] | undefined {
        const vector = this.centroids.get(ref);
        if (vector === undefined) {
            return undefined;
        }
        return [...vector];
    }
}
