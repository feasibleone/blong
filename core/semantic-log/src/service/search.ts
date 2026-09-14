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
import type {EmbeddingCache} from './embedding.ts';
import type {ExemplarStore} from './exemplars.ts';
import type {FlowDrift, FlowDriftHistory} from './ingest.ts';
import type {IngestEvent, TemplateEntry, TemplateRegistry} from './registry.ts';

export interface SearchResult {
    ref: string;
    score: number;
    entry: TemplateEntry;
}

/**
 * The key namespace a retained record's vector is stored under (D20).
 *
 * The fingerprint key would collapse every exemplar of one template onto the single
 * vector that template has — they are the same template, so they share a signature — and
 * a record-level search would then rank one arbitrary member of each group. The id is the
 * record's, so its vector is the record's own.
 */
export const RECORD_KEY = 'record:';

/** The key one retained record's vector is stored under. */
export function recordKey(id: string): string {
    return `${RECORD_KEY}${id}`;
}

/**
 * The text a record is made searchable by.
 *
 * What a person would type to find it: the message first — the one human sentence a record
 * carries — then the operation, the service and the structural signature, which is where
 * the machine-readable half of its meaning lives. A record with none of them (every field
 * absent from the wire) falls back to its fingerprint, which is what the template path
 * does for the same reason: a vector of nothing is not a direction, and it would place
 * the record in the ranking by accident.
 */
export function recordText(event: IngestEvent): string {
    return (
        [event.msg, event.operation, event.service, event.template]
            .filter(part => typeof part === 'string' && part.length > 0)
            .join(' ') || event.fingerprint
    );
}

/** One retained record, as a search result. */
export interface RecordResult {
    id: string;
    score: number;
    event: IngestEvent;
}

/**
 * Rank the retained records by similarity to a query vector, closest first.
 *
 * Only records whose vector is **already stored** can be ranked: one was embedded when it
 * was retained (D20), and a record without a vector — an older retention from before this
 * surface existed — is left out rather than embedded during the query, which would make a
 * search cost one provider call per candidate (`embedding.ts`).
 *
 * The scan is over the retained exemplars, not over the embedding cache, because the
 * answer has to carry the record itself: a vector with nothing to show for it is not a
 * search result. The bound is therefore the retention bound — templates times the
 * per-template limit — rather than anything traffic can grow.
 */
export function searchRecords(
    exemplars: ExemplarStore,
    cache: EmbeddingCache,
    queryVector: readonly number[],
    limit = 10,
): RecordResult[] {
    const ranked: RecordResult[] = [];
    for (const {id, event} of exemplars.retained()) {
        const vector = cache.vectorOf(recordKey(id));
        if (vector === undefined) {
            continue;
        }
        ranked.push({id, score: cosine(queryVector, vector), event});
    }
    // Ranked by score, ties settled by id: two records that are equally similar rank
    // deterministically rather than by the order the store happens to hold them in.
    ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return ranked.slice(0, limit);
}

/** Rank templates by similarity to a query vector, closest first. */
export function searchTemplates(
    registry: TemplateRegistry,
    queryVector: readonly number[],
    limit = 10,
): SearchResult[] {
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
export function deployDiff(
    registry: TemplateRegistry,
    range: TimeRange,
    driftHistory: FlowDriftHistory,
): DeployDiff {
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
            (entry.retiredAt !== undefined &&
                entry.retiredAt >= range.from &&
                entry.retiredAt <= range.to)
        ) {
            removed.push(entry);
            continue;
        }
        unchanged++;
    }

    return {added, removed, drifted: driftHistory.inWindow(range.from, range.to), unchanged};
}
