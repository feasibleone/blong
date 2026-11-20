/**
 * Facet projection at read time (PRD R16).
 *
 * One recorded fact, several audiences: the `SignalEntry` the ledger already holds is reshaped
 * here, at answer time, into what one consumer needs. Nothing is duplicated at emit time, so a new
 * audience is a new function in this file — no emitter change, no new record type, no migration —
 * which is R16's acceptance criterion ("adding a new consumer view requires no emitter change and
 * no new record type").
 *
 * **What `diagnostic` says now.** It used to answer two questions this service can no longer
 * answer honestly: whether a template had drifted (it could not — a template's vector was constant
 * by construction) and whether an anomaly had been raised against it (the detectors are gone, see
 * the plan's "what the anomaly detectors did"). What it reports instead is what a reader actually
 * needs to tell one signal from another: the identifier, whether it was **declared** to this
 * service or first seen on the wire, the message last observed, and the level. An ad-hoc signal is
 * the interesting diagnostic case — it means an emitter is ahead of the service it reports to — and
 * it is answered by a stored fact rather than by consulting a vocabulary this process does not
 * have.
 *
 * Projections are **copies**: the returned `intents` and `exemplars` are fresh arrays, so a caller
 * cannot change the ledger entry through the view it was handed (the ownership rule `lineage.ts`
 * keeps throughout).
 */

import type {SignalEntry} from './ledger.ts';

export const FACETS = ['ops', 'diagnostic', 'compliance'] as const;
export type Facet = (typeof FACETS)[number];

export function isFacet(value: string): value is Facet {
    return (FACETS as readonly string[]).includes(value);
}

/**
 * Project a stored signal into the shape one audience needs.
 *
 * `ops` is the operational view — how often, when last, is it retired. `diagnostic` is the reading
 * view — what the signal *is*, and whether the service was told about it. `compliance` is the
 * provenance view — which intent names and which records it was seen under.
 */
export function project(entry: SignalEntry, facet: Facet): Record<string, unknown> {
    const base = {ref: entry.ref, service: entry.service, levelName: entry.levelName};
    switch (facet) {
        case 'ops':
            return {
                ...base,
                count: entry.count,
                firstSeen: entry.firstSeen,
                lastSeen: entry.lastSeen,
                retiredAt: entry.retiredAt,
                message: entry.message,
            };
        case 'diagnostic':
            return {
                ...base,
                signal: entry.ref,
                declared: entry.declared,
                message: entry.message,
                level: entry.level,
            };
        case 'compliance':
            return {
                ...base,
                intents: [...entry.intents],
                exemplars: [...entry.exemplars],
                firstSeen: entry.firstSeen,
                lastSeen: entry.lastSeen,
            };
    }
}
