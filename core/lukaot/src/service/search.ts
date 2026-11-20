/**
 * Search and the deploy diff, both over declared identifiers.
 *
 * ## Why there is no vector here
 *
 * `semantic-log` ranked by cosine distance against an embedding of each message, which needed a
 * provider, a cache, a centroid per template and a record vector per retained exemplar. A declared
 * vocabulary changes the arithmetic: the queryable set is the identifiers a codebase declares —
 * a few hundred names in the largest realm here — and those names are what a person types. Lexical
 * matching over a name, its message and its service answers the question the vector space was
 * built for, at no cost and with an answer a reader can predict (`@@D-891`). If the corpus ever
 * grows past what a scan can serve, the ranking below is where a vector would go back, not the
 * ledger.
 *
 * ## The deploy diff, and the bucket that is gone
 *
 * `added` and `removed` are statements about the **set** of identifiers observed, which is exactly
 * what a release changes. `drifted` — the flow kinds whose shape moved — went with the drift
 * detection it read from; the shape itself is still retained per kind (`flowLedger.ts`), so a
 * sequence diff that needs no model can be built on it when there is a founding case for it.
 *
 * A retirement is reversible at the ledger: seeing a signal *again* after it was retired clears
 * `retiredAt` (`SignalLedger.upsert`), so a signal retired by mistake and then observed resumes
 * counting and leaves `removed` rather than silently absorbing events while still reported as
 * gone. The window bound on `removed` is what keeps a standing retirement from reporting the same
 * signal as gone in every window that follows: a retirement after the window is a later window's
 * news, and `lastSeen < range.from` is a statement about *this* window's start by construction.
 */

import type {ExemplarStore} from './exemplars.ts';
import type {IngestEvent, SignalEntry, SignalLedger} from './ledger.ts';

/** One observed signal, ranked. */
export interface SignalResult {
    ref: string;
    score: number;
    entry: SignalEntry;
}

/** One retained record, as a search result. */
export interface RecordResult {
    id: string;
    score: number;
    event: IngestEvent;
}

/**
 * The text a record is made searchable by.
 *
 * What a person would type to find it: the identifier first — it is the thing a developer reads in
 * the source — then the message (the one human sentence a record carries), the operation and the
 * service. A record that carries none of them still has its identifier, so the fallback is that
 * rather than an empty string, which would match every query equally and rank by accident.
 */
export function recordText(event: IngestEvent): string {
    return (
        [event.signal, event.message, event.msg, event.operation, event.service]
            .filter(part => typeof part === 'string' && part.length > 0)
            .join(' ') || event.signal
    );
}

/** The text an observed signal is made searchable by. */
export function signalText(entry: SignalEntry): string {
    return [entry.ref, entry.message, entry.service]
        .filter((part): part is string => typeof part === 'string' && part.length > 0)
        .join(' ');
}

/**
 * The query as the tokens a scan looks for: lower-cased, split on anything that is not part of a
 * name. `agentTicketSkipped` is one token, `ticket skipped` is two, and both find the same signal —
 * which is the only tolerance a declared vocabulary needs.
 */
function tokensOf(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length > 0);
}

/**
 * Score one haystack against the query's tokens: how many of them it contains, plus a bonus per
 * token that matches the *identifier* itself.
 *
 * The identifier is weighted because it is the declaration. A query of `ticket` that hits
 * `agentTicketSkipped` in its message and another signal in its name should rank the named one
 * first: a reader searching for a signal is almost always holding part of its name.
 */
function scoreOf(haystack: string, ref: string, tokens: readonly string[]): number {
    const hay = haystack.toLowerCase();
    const name = ref.toLowerCase();
    let score = 0;
    for (const token of tokens) {
        if (!hay.includes(token)) {
            continue;
        }
        score += 1;
        if (name.includes(token)) {
            score += 2;
        }
    }
    return score;
}

/**
 * Rank the observed signals against a query, best first.
 *
 * Only signals that match at least one token are returned: a result set padded with zero-score
 * entries would make "nothing matched" indistinguishable from "everything did". Ties settle by
 * reference, so two equally good matches rank deterministically rather than by the order the ledger
 * happens to hold them in.
 */
export function searchSignals(
    ledger: SignalLedger,
    query: string,
    limit = 10,
): SignalResult[] {
    const tokens = tokensOf(query);
    if (tokens.length === 0) {
        return [];
    }
    const ranked: SignalResult[] = [];
    for (const entry of ledger.list()) {
        const score = scoreOf(signalText(entry), entry.ref, tokens);
        if (score > 0) {
            ranked.push({ref: entry.ref, score, entry});
        }
    }
    ranked.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));
    return ranked.slice(0, limit);
}

/**
 * Rank the retained records against a query, best first.
 *
 * The scan is over the retained exemplars rather than over the ledger, because the answer has to
 * carry a record somebody can read: an identifier with nothing to show for it is a signal result,
 * not a record result. The bound is therefore the retention bound — signals times the per-signal
 * limit — rather than anything traffic can grow.
 */
export function searchRecords(
    exemplars: ExemplarStore,
    query: string,
    limit = 10,
): RecordResult[] {
    const tokens = tokensOf(query);
    if (tokens.length === 0) {
        return [];
    }
    const ranked: RecordResult[] = [];
    for (const {id, event} of exemplars.retained()) {
        const score = scoreOf(recordText(event), event.signal, tokens);
        if (score > 0) {
            ranked.push({id, score, event});
        }
    }
    // Ties settled by id: two equally good records rank deterministically rather than by the order
    // the store happens to hold them in.
    ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return ranked.slice(0, limit);
}

export interface DeployDiff {
    /** Signals first seen inside the range. */
    added: SignalEntry[];
    /** Signals whose last appearance precedes the range, or that were retired inside it. */
    removed: SignalEntry[];
    /** Signals that were neither added nor removed inside the range. */
    unchanged: number;
}

export interface TimeRange {
    from: number;
    to: number;
}

/**
 * What changed between two points in time: signals first seen inside the range, and signals whose
 * last appearance precedes it — or that were retired inside it.
 *
 * Both buckets are statements about one signal's own timestamps, so the answer needs no history
 * beyond the ledger: `firstSeen` and `lastSeen` are the two ends a window is compared against, and
 * the bounds are inclusive, matching the ingestion's own time comparisons.
 */
export function deployDiff(ledger: SignalLedger, range: TimeRange): DeployDiff {
    const added: SignalEntry[] = [];
    const removed: SignalEntry[] = [];
    let unchanged = 0;

    for (const entry of ledger.list()) {
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

    return {added, removed, unchanged};
}
