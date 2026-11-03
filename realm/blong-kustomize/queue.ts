/**
 * queue.ts — the queue a reconcile pass is run through, shared by the pass itself and the loops that
 * trigger it.
 *
 * A module rather than a helper inside the handler, because the handler is the one thing another
 * handler may not import (`[CRITICAL_GUARDRAILS]`): the pass holds the queue, and the loops reach the
 * pass through the proxy, so the queue has to live where a plain module can be named by both.
 */

/** The pass in flight, or the last one: a chain, so the next waits for the previous to settle. */
let tail: Promise<unknown> = Promise.resolve();

/**
 * One reconcile pass at a time (@@D-749).
 *
 * Two triggers converge on the same suites — the watch renewal and the interval — and they used to
 * run their passes beside each other. A pass replaces its generation directory before writing into
 * it, and its prune deletes the same old Job attempts: the second pass then read a half-written tree
 * and answered `notFound` for a Job the first had already removed, which wrote `Failed` onto a
 * healthy `BlongDeployment`. Both failure modes are the same bug, and serialising the pass removes
 * both, at the cost of a pass that waits a few seconds for the one before it.
 *
 * It also bounds the container's memory: a pass runs a generation child, and the cgroup is shared.
 */
export const serialisePass = <T>(work: () => Promise<T>): Promise<T> => {
    // `then(work, work)`: a failed pass must not block the one waiting behind it.
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
};
