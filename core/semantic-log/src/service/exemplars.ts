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

    /** The retained record, if it was kept as an exemplar. */
    recordOf(id: string): IngestEvent | undefined {
        return this.byId.get(id);
    }

    /** Total records held across every template. */
    totalRetained(): number {
        return this.byId.size;
    }
}
