/**
 * `LogDigest` — the machine-readable change stream (PRD R8).
 *
 * Deltas only: new templates, anomalies and exemplar references. A consumer
 * asks "what changed since cursor N" and gets exactly that, without reading the
 * raw records or computing statistics itself — which is the whole point of R8,
 * and why a delta is *published by the producer* rather than derived by the
 * consumer. A digest that handed over whole records would push the reading back
 * onto the consumer, which is the failure R8 exists to prevent.
 *
 * **Which kinds have a producer.** `DigestKind` reserves five kinds and **all
 * five are published**, all from `app.ts`: `template-added` (once per newly
 * created template), `anomaly` (for every anomaly the detectors raise),
 * `incident` (when correlation finds a new or grown cross-service incident),
 * `exemplar-retained` (when a record is kept) and `template-retired` (when
 * `POST /templates/:ref/retire` retires a template — Plan 2 Task 12). The union
 * member was reserved ahead of its writer on purpose, so the producer would not
 * need a schema change; a consumer polling `GET /digest` may now wait on any of
 * the five, and none of them is advertised without a route or callback that
 * publishes it.
 *
 * **The anomaly payload is keyed unambiguously.** An anomaly's `anomalyRef` is
 * the flow **kind** for a `drift` anomaly and the template ref for `novelty`
 * and `rate-shift` (see `Anomaly`), so `app.ts` republishes it under that name
 * rather than as `ref`; `templateRef` is always the template whose event
 * triggered the anomaly. A consumer that reads `anomalyRef` as a template ref
 * is wrong for drift, which is the trap the distinct names close.
 *
 * The published value is a *change*, not an observation: `publish` takes the
 * kind and the payload the producer has already reduced to what answers "what
 * changed" (a new template's identity, an anomaly's type and magnitude, the id
 * of a retained exemplar). Repeated occurrences of a known template are a count
 * going up, which is not a change to the set of templates and so is not a
 * delta — the ingest publishes `template-added` once per template, not once per
 * event.
 *
 * The log is bounded like everything else in this service, and the bound is
 * visible rather than silent: an entry past `limit` drops the oldest one and is
 * counted, so a consumer polling from a cursor that has fallen behind is
 * **told** it missed entries instead of being quietly short-changed.
 * `stats().oldest` shows the surviving window, and the number *a particular
 * cursor* missed is `read(since)[0].seq - since - 1` (zero when nothing is
 * retained); `stats().dropped` is the **cumulative total evicted since the
 * process started**, not the amount one consumer missed — an earlier consumer's
 * misses stay in it forever. That is the same contract `FlowShapes` keeps for
 * its caps: dropping is allowed, dropping without a trace is not.
 *
 * The sequence is monotonic and is never reused, including across a drop:
 * surviving entries keep the cursor they were issued under, so a consumer's
 * cursor stays meaningful — `read(since)` returns exactly the entries newer
 * than it that are still retained — and how far behind the cursor is shows in
 * the distance between it and the oldest survivor.
 *
 * This is a polling surface, not a push one: there is no subscriber queue, so
 * there is nothing to `close` and no unbounded buffer to leak. A slow consumer
 * can only cost *itself* the entries beyond the bound; it cannot make the
 * service hold memory on its behalf.
 *
 * `read` hands back copies of the entries (the array is fresh either way), so a
 * caller cannot retitle, re-cursor or re-time what the log holds. `data` is the
 * producer's payload and is shared by reference, as `unknown` cannot be copied
 * generically without changing what a caller gets back — it is treated as
 * read-only, and every producer here passes a freshly built object.
 */

export type DigestKind =
    | 'template-added'
    | 'template-retired'
    | 'anomaly'
    | 'incident'
    | 'exemplar-retained';

export interface DigestEntry {
    seq: number;
    at: number;
    kind: DigestKind;
    data: unknown;
}

export interface DigestOptions {
    /**
     * Maximum retained entries. A non-negative integer: a negative cap makes
     * `publish`'s eviction loop non-terminating (`while (entries.length > -1)`
     * never exits), so the constructor rejects it rather than hanging.
     */
    limit: number;
    /** Injected clock, for deterministic tests. */
    now?: () => number;
}

export class DigestLog {
    /**
     * Declared as fields rather than as constructor parameter properties: the
     * package runs under bare Node's strip-only type removal, which rejects
     * parameter properties at load time (see `test/strip-types.test.ts`).
     */
    private readonly entries: DigestEntry[] = [];
    private readonly options: DigestOptions;
    private sequence = 0;
    private droppedCount = 0;

    constructor(options: DigestOptions) {
        // `limit` is the eviction budget and `publish` drains to it with
        // `while (entries.length > limit)`, which never terminates for a
        // negative limit (`0 > -1`) and so hangs a caller of this public
        // export. A non-integer is equally meaningless as a count. Caller
        // misuse throws here, the way `withFlow` rejects a malformed kind,
        // rather than being clamped: a silent clamp would accept a value the
        // caller did not mean and hide the mistake.
        if (!Number.isInteger(options.limit) || options.limit < 0) {
            throw new TypeError(`digest limit must be a non-negative integer, got ${options.limit}`);
        }
        this.options = options;
    }

    /** Append one delta, issuing the next cursor, and return what was stored. */
    publish(kind: DigestKind, data: unknown): DigestEntry {
        const entry: DigestEntry = {
            seq: ++this.sequence,
            at: (this.options.now ?? Date.now)(),
            kind,
            data,
        };
        this.entries.push(entry);
        while (this.entries.length > this.options.limit) {
            this.entries.shift();
            this.droppedCount++;
        }
        return {...entry};
    }

    /** Entries newer than `since`, oldest first; `limit` caps the page. */
    read(since: number, limit?: number): DigestEntry[] {
        const newer = this.entries.filter(entry => entry.seq > since).map(entry => ({...entry}));
        return limit === undefined ? newer : newer.slice(0, limit);
    }

    /** The highest cursor issued so far. */
    latest(): number {
        return this.sequence;
    }

    /**
     * What the log currently holds, for a consumer deciding whether it can catch
     * up: `dropped` is the cumulative count of entries evicted by the bound,
     * `retained` the window's size, and `oldest` the cursor of the oldest
     * surviving entry — or the next cursor to be issued when nothing is held, so
     * an empty log never reports a cursor it has not reached.
     */
    stats(): {dropped: number; retained: number; oldest: number} {
        return {
            dropped: this.droppedCount,
            retained: this.entries.length,
            oldest: this.entries[0]?.seq ?? this.sequence + 1,
        };
    }
}
