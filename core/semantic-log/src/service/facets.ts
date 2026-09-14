/**
 * Facet projection at read time (PRD R16).
 *
 * One recorded fact, several audiences: the `TemplateEntry` the registry
 * already holds is reshaped here, at answer time, into what one consumer needs.
 * Nothing is duplicated at emit time, so a new audience is a new function in
 * this file — no emitter change, no new record type, no migration — which is
 * R16's acceptance criterion ("adding a new consumer view requires no emitter
 * change and no new record type").
 *
 * **What `diagnostic.drifted` means.** It is *not* "this template drifted".
 * That reading is not derivable and never will be: a template's embedding is
 * keyed by the same fingerprint that identifies it, so its vector is the same
 * every time and a per-template distance is always zero (D4, ruled 2026-09-13;
 * R6c makes drift a property of `flow.kind`, observed by `FlowDriftHistory`).
 * `drifted` instead means **"this template was the trigger of a drift
 * observation"**: the flow drifted, and this template is the step the anomaly
 * was attributed to (`onAnomaly` pairs every anomaly with the template whose
 * event raised it). It is derived from the anomaly collection the caller
 * supplies — the bounded set of anomalies this read is made against — and is
 * `false` when that collection holds no `drift` anomaly naming this template.
 * There is no stored per-template drift marker, and one must not be
 * reintroduced (`alerts.driftAt` was deleted as dead state).
 *
 * Projections are **copies**: the returned `intents`, `exemplars` and `alerts`
 * are fresh, so a caller cannot change the registry entry through the view it
 * was handed (the ownership rule `lineage.ts`, `centroid.ts` and
 * `FlowDriftHistory.inWindow` already keep).
 */

import type {AnomalyKind} from './detectors.ts';
import type {TemplateEntry} from './registry.ts';

export const FACETS = ['ops', 'diagnostic', 'compliance'] as const;
export type Facet = (typeof FACETS)[number];

/**
 * The slice of a published anomaly a drift attribution reads: which detector
 * raised it and which template's event triggered it (`templateRef`). These are
 * exactly the names the digest publishes under its `anomaly` kind —
 * `anomalyRef` is deliberately not read here, because for a drift it is the
 * flow *kind*, not a template (see `digest.ts`).
 */
export interface FacetAnomaly {
    kind: AnomalyKind;
    templateRef?: string;
}

export function isFacet(value: string): value is Facet {
    return (FACETS as readonly string[]).includes(value);
}

/**
 * Project a stored template into the shape one audience needs.
 *
 * `anomalies` is the bounded collection the caller is reading against — the
 * digest's retained anomalies for the route — and only `diagnostic` reads it.
 */
export function project(
    entry: TemplateEntry,
    facet: Facet,
    anomalies: readonly FacetAnomaly[] = [],
): Record<string, unknown> {
    const base = {ref: entry.ref, service: entry.service, levelName: entry.levelName};
    switch (facet) {
        case 'ops':
            return {
                ...base,
                count: entry.count,
                firstSeen: entry.firstSeen,
                lastSeen: entry.lastSeen,
                retiredAt: entry.retiredAt,
                message: entry.signature.replace(/^.*\[MSG: /, '').replace(/\]$/, ''),
            };
        case 'diagnostic':
            return {
                ...base,
                fingerprint: entry.fingerprint,
                signature: entry.signature,
                alerts: {...entry.alerts},
                drifted: anomalies.some(anomaly => anomaly.kind === 'drift' && anomaly.templateRef === entry.ref),
                novelty: entry.alerts.noveltyAt !== undefined,
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
