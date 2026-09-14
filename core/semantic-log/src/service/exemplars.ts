/**
 * Exemplar retention — the claim check (PRD R13).
 *
 * A bounded number of full records per template is kept; everything beyond that
 * contributes only to counters. Storage therefore scales with the number of
 * templates, not with traffic, while a real occurrence can still be examined.
 *
 * The bound is per template, not per store: a template that is seen once keeps
 * its one record however many other templates there are, and a template seen a
 * million times still keeps only `limit`. That is what makes the claim check a
 * claim check rather than a sample — the record that is kept is the *first*
 * occurrence, which is the one an operator investigating "what does this
 * template actually look like" wants to see.
 *
 * The store owns the retained records (`recordOf`) and the ids retained per
 * template (`get`); the registry entry carries the same ids as
 * `entry.exemplars` so that listing a template does not have to reach into the
 * store. Both are appended under the same predicate — `offer` returning true —
 * so they cannot diverge.
 */

import type {IngestEvent} from './registry.ts';

export interface ExemplarStoreOptions {
    /** Full records retained per template. */
    limit: number;
}

export class ExemplarStore {
    private readonly byRef = new Map<string, string[]>();
    private readonly byId = new Map<string, IngestEvent>();
    /**
     * Declared as a field rather than as a constructor parameter property: the
     * package runs under bare Node's strip-only type removal, which rejects
     * parameter properties at load time (see `test/strip-types.test.ts`).
     */
    private readonly options: ExemplarStoreOptions;

    constructor(options: ExemplarStoreOptions) {
        this.options = options;
    }

    /**
     * Whether this template still has room for another exemplar, without taking one.
     *
     * Asked *before* an event is committed, so the work an exemplar costs can be done
     * for the records that will be kept: embedding a record that the store then refuses
     * would make the cost per occurrence rather than per retained exemplar (R3/SC3). The
     * answer is a prediction, not a reservation — a batch of several sightings of one
     * template can all be told there is room, and only the first few are kept — which is
     * why the vector is stored under the record's own id: the ones that are refused
     * leave a vector nothing can reach, rather than a hole in a kept record's search.
     */
    hasRoom(ref: string): boolean {
        return (this.byRef.get(ref)?.length ?? 0) < this.options.limit;
    }

    /**
     * Retain `event` as an exemplar when its template still has room, reporting
     * whether it was kept. Full retention is first-come: once the template is
     * full, later occurrences are counted by the registry and nothing else.
     */
    offer(ref: string, event: IngestEvent): boolean {
        const existing = this.byRef.get(ref) ?? [];
        if (existing.length >= this.options.limit) {
            return false;
        }
        existing.push(event.id);
        this.byRef.set(ref, existing);
        this.byId.set(event.id, event);
        return true;
    }

    /** The record ids retained for a template, oldest first. */
    get(ref: string): string[] {
        return [...(this.byRef.get(ref) ?? [])];
    }

    /**
     * The retained records themselves, oldest first.
     *
     * The pairs are handed out together because they cannot come apart: the store keeps the
     * id and the record under the same predicate (`offer`), so a caller that enumerated ids
     * and then looked each one up would need a branch for a lookup that cannot fail — and a
     * branch nothing can take is a guard that hides an invariant rather than testing it.
     */
    retained(): Array<{id: string; event: IngestEvent}> {
        return [...this.byId.entries()].map(([id, event]) => ({id, event}));
    }

    /** The retained record, if it was kept as an exemplar. */
    recordOf(id: string): IngestEvent | undefined {
        return this.byId.get(id);
    }

    /** Total records held across every template. */
    totalRetained(): number {
        return this.byId.size;
    }
}
