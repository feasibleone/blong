/**
 * Fingerprint-keyed embedding cache (PRD R3, SC3).
 *
 * This is the mechanism that makes cost scale with *distinct templates* rather
 * than with log volume: a known fingerprint is answered from the map and the
 * provider is never consulted. A provider failure must not be cached, or a
 * transient outage would become a permanent hole — so nothing is stored until
 * the provider has answered, and nothing is counted until it is stored.
 *
 * "At most once per distinct template" holds under concurrency too. A fastify
 * service serves overlapping requests, and a plain check-then-act would let two
 * simultaneous first arrivals both miss and both embed, so the in-flight
 * computation is memoised: concurrent callers for the same fingerprint await
 * one shared promise and the provider is consulted once. That promise is
 * dropped as soon as it settles, so a rejection is a retryable failure rather
 * than a remembered one (the "a failing provider does not poison the cache"
 * property) and no settled promise is retained.
 *
 * Ownership: `vectorFor` returns a vector the caller owns and may mutate
 * freely. The cache never hands out an array that it or another caller can
 * observe mutating — vectors are copied on store and copied again on every
 * read, so a caller's edits cannot corrupt the store or leak to a peer.
 */

import type {EmbeddingProvider} from './provider.ts';

export class EmbeddingCache {
    private readonly vectors = new Map<string, number[]>();
    /**
     * In-flight computations, keyed by fingerprint. Present only between the
     * start of an embed and its settlement, so it never grows with cache size.
     */
    private readonly pending = new Map<string, Promise<number[]>>();
    private providerCalls = 0;
    private readonly provider: EmbeddingProvider;

    constructor(provider: EmbeddingProvider) {
        this.provider = provider;
    }

    /** The vector for a fingerprint, computed at most once per distinct template. */
    async vectorFor(fingerprint: string, signature: string): Promise<number[]> {
        const cached = this.vectors.get(fingerprint);
        if (cached) {
            return [...cached];
        }
        // A concurrent caller for this fingerprint is already embedding: share
        // its computation instead of starting a second one.
        const computation = this.pending.get(fingerprint) ?? this.start(fingerprint, signature);
        return [...(await computation)];
    }

    /** Begin the one computation for a fingerprint and memoise it until it settles. */
    private start(fingerprint: string, signature: string): Promise<number[]> {
        const computation = this.provider
            .embed(signature)
            .then(vector => {
                // Copy on store: the provider's array is not aliased into the map.
                this.vectors.set(fingerprint, [...vector]);
                this.providerCalls++;
                return vector;
            })
            .finally(() => {
                // The computation is the only one running for this fingerprint
                // (a new one can only start after this runs), so an
                // unconditional delete is safe and cannot drop a successor.
                this.pending.delete(fingerprint);
            });
        this.pending.set(fingerprint, computation);
        return computation;
    }

    /** Number of provider invocations — the number the tests assert on. */
    calls(): number {
        return this.providerCalls;
    }

    /** Estimated cache size, in stored vectors. */
    size(): number {
        return this.vectors.size;
    }
}
