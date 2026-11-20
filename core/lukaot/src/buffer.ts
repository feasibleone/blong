/**
 * Bounded ring buffer of withheld detail (PRD R10; §5.1 rows "Backpressure and
 * drop policy" and "Sampling and rate limiting").
 *
 * R10 decouples verbosity from static level configuration: high-detail fields
 * are retained locally but *not transmitted*, and are flushed retroactively
 * when an escalation condition occurs (a local error, a failed assertion, an
 * anomaly). Nothing here leaves the process on its own — `take` is the only
 * drain — so the cost of withheld detail is bounded memory while the system is
 * healthy, and the detail is available the moment it is not. That is why
 * sampling and rate limiting are "Replaced": an anomaly is never sampled away,
 * it is escalated.
 *
 * The spec's drop policy is *explicit, observable accounting instead of silent
 * loss* (§5.1 "Backpressure and drop policy"). Overflow discards the oldest
 * entry and increments `dropped`; `dropped` is cumulative and never resets, so
 * `logger.ts` can report the loss on every record for as long as the buffer is
 * in use and no overflow can go unmentioned.
 *
 * Withheld detail is redacted *before* it is pushed (see `logger.ts`): Task 8
 * redacts at record-construction time so that a withheld value is absent from
 * everything retained, the ring buffer included. Retaining raw fields here
 * would reopen that hole, so the buffer only ever holds what the record would
 * have held.
 */

export interface RingBuffer<T> {
    /** Append `entry`, discarding the oldest entry if the bound is exceeded. */
    push(entry: T): void;
    /** A copy of the retained entries, oldest first; the buffer is unchanged. */
    peek(): T[];
    /** Remove and return every retained entry, oldest first. */
    take(): T[];
    /** How many entries are currently retained. */
    size(): number;
    /** How many entries have been discarded by the bound, cumulatively. */
    dropped(): number;
    /** Discard every retained entry; not an overflow, so `dropped` is unchanged. */
    clear(): void;
}

/** Create a ring buffer retaining at most `maxEntries` entries. */
export function createRingBuffer<T>(maxEntries: number): RingBuffer<T> {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
        throw new Error('createRingBuffer: maxEntries must be a positive integer');
    }
    const entries: T[] = [];
    let dropped = 0;
    return {
        push(entry: T): void {
            entries.push(entry);
            while (entries.length > maxEntries) {
                entries.shift();
                dropped++;
            }
        },
        peek: () => [...entries],
        take: (): T[] => entries.splice(0, entries.length),
        size: () => entries.length,
        dropped: () => dropped,
        clear: (): void => void entries.splice(0, entries.length),
    };
}
