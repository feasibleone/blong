/**
 * Template-level semantic search and the deploy diff (PRD R12, R14).
 *
 * Ranking runs over the **registry**, never over records: the store embeds one
 * vector per template, so a query costs one embedding and a scan of the
 * registry rather than a scan of the records behind it — which is the whole
 * reason embeddings are affordable here (R14, R3/SC3).
 *
 * Which vector a template is ranked on. It is the registry entry's own
 * centroid, and that is correct rather than a snapshot awaiting a better source:
 * a template's embedding is keyed by the very fingerprint that identifies the
 * template, so it is constant by construction (`embedding.ts`). `DriftTracker`'s
 * moving average is a **flow's** surface, keyed by the stable process name
 * `flow.kind` (R6c, D4); a template key there would only ever hold that same
 * constant vector, so the two are different granularities rather than competing
 * candidates (see `centroid.ts`).
 *
 * The deploy diff answers "what changed since the last release?" from three
 * surfaces. `added` and `removed` are **reads of the registry** — a template
 * first seen inside the window, or one whose last appearance precedes it (or an
 * explicit retirement inside it) — and nothing here writes to the registry, so
 * a diff cannot retire a template or produce the `template-retired` digest
 * delta: retirement is an explicit write (`POST /templates/:ref/retire`), never
 * a read (see `digest.ts`).
 *
 * Both clauses of `removed` are **bounded to the window**, which is what makes
 * the bucket a delta rather than a standing list. The retirement clause is
 * `retiredAt >= range.from && retiredAt <= range.to`: an entry retired *before*
 * the window is not a removal *inside* it. Without the lower bound a template
 * retired once appeared in `removed` in every window that followed, forever,
 * because `retiredAt` never ages out — the window was only ever checked against
 * its `to`. The upper bound has always been there (a retirement after the window
 * is a later window's news). The `lastSeen < range.from` clause is bounded in
 * the same way by construction: it is a statement about *this* window's start,
 * and a template that keeps being seen keeps moving out of it.
 *
 * A retirement is also reversible at the registry: seeing a template *again*
 * after it was retired clears `retiredAt` (`TemplateRegistry.upsert`), so a
 * template that was retired by mistake and then observed resumes counting and
 * leaves `removed` rather than silently absorbing events while still reported
 * as gone. `drifted` cannot be a
 * template bucket at all: a template's vector is keyed by the fingerprint that
 * identifies it, so it is constant and can never drift (R6c, amendment
 * 2026-09-13). It reports the **flow kinds** whose shape moved inside the
 * window, read from the per-kind drift history the ingest keeps
 * (`FlowDriftHistory`). That history is a **required** argument rather than an
 * optional one: a diff handed no history would report an empty `drifted` that
 * reads as "no flow changed shape", which is exactly the silently-wrong answer
 * the bucket exists to prevent (see `.github/memory/decision.md`, Task 9).
 */

import {cosine} from './centroid.ts';
import type {FlowDrift, FlowDriftHistory} from './ingest.ts';
import type {TemplateEntry, TemplateRegistry} from './registry.ts';

export interface SearchResult {
    ref: string;
    score: number;
    entry: TemplateEntry;
}

/** Rank templates by similarity to a query vector, closest first. */
export function searchTemplates(registry: TemplateRegistry, queryVector: readonly number[], limit = 10): SearchResult[] {
    const ranked: SearchResult[] = [];
    for (const entry of registry.list()) {
        // A template with no centroid (created before any embedding was
        // available) or an empty one cannot be scored: `cosine` throws
        // `RangeError` on a width mismatch, and a zero-length vector is not a
        // direction. Skipping is deliberate rather than scoring it as "equally
        // dissimilar", which would silently place a template it never ranked
        // among the ranked ones (see `centroid.ts`).
        if (!entry.centroid || entry.centroid.length === 0) {
            continue;
        }
        ranked.push({ref: entry.ref, score: cosine(queryVector, entry.centroid), entry});
    }
    // A stable sort keeps registry order among equal scores, so two templates
    // that are equally similar rank deterministically rather than by insertion
    // accident.
    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, limit);
}

export interface DeployDiff {
    added: TemplateEntry[];
    removed: TemplateEntry[];
    /**
     * The flow kinds whose shape moved inside the range — not templates, because
     * a template cannot drift (R6c, amendment 2026-09-13).
     */
    drifted: FlowDrift[];
    /** Templates that were neither added nor removed inside the range. */
    unchanged: number;
}

export interface TimeRange {
    from: number;
    to: number;
}

/**
 * What changed between two points in time: templates first seen inside the
 * range, templates whose last appearance precedes it (or that were retired
 * inside it), and the flow kinds whose shape moved inside it.
 *
 * The three buckets are read from two different granularities and neither is
 * derived from the other: a template's identity is what identifies it, so a
 * template can only appear, disappear or stay; a **flow** is what can change
 * shape. An empty `drifted` therefore means "no flow kind drifted in this
 * window", not "the flow surface is missing" — the history is a required
 * argument so the two cannot be confused.
 */
export function deployDiff(registry: TemplateRegistry, range: TimeRange, driftHistory: FlowDriftHistory): DeployDiff {
    const added: TemplateEntry[] = [];
    const removed: TemplateEntry[] = [];
    let unchanged = 0;

    for (const entry of registry.list()) {
        if (entry.firstSeen >= range.from && entry.firstSeen <= range.to) {
            added.push(entry);
            continue;
        }
        if (
            entry.lastSeen < range.from ||
            (entry.retiredAt !== undefined && entry.retiredAt >= range.from && entry.retiredAt <= range.to)
        ) {
            removed.push(entry);
            continue;
        }
        unchanged++;
    }

    return {added, removed, drifted: driftHistory.inWindow(range.from, range.to), unchanged};
}
