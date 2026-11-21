import type {IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

/**
 * `viewer.entry.watch` — a wake when a record arrives (`@@D-948`).
 *
 * A frame carries **a cursor and nothing else**: the id the page should read
 * from. The records themselves still travel over `viewer.entry.find`, which is
 * an ordinary call on the ordinary transport — so a stream moves the *latency* of
 * a tail and never a record, and what leaves the process in a frame is a ULID
 * that names nothing on its own.
 *
 * That split is deliberate, and it is the rule a stream lives under: a response
 * that arrives as a sequence has no single body for the gateway to sign and
 * encrypt, so a frame is protected by the connection and the caller's
 * authorization rather than by the per-response envelope every other answer gets.
 * A wake is what fits under that ceiling; a stream of records would not.
 *
 * The same shape as `realm/blong-agent/adapter/notify.ts`: a wake is a nudge, not
 * a transport, and the store is the truth (`@@D-709`).
 *
 * Several records arriving before the page has asked for any of them produce one
 * wake, because the answer to "is there anything new?" is a single cursor. The
 * listener is registered before the first frame for exactly that reason: a record
 * that lands while the loop is yielding is not a wake nobody saw, it is the next
 * turn of the loop.
 */
export default handler(({lib: {store}}) => ({
    async *viewerEntryWatch(
        params: {after?: string},
        $meta: IMeta,
    ): AsyncIterable<{last?: string; size: number}> {
        const window = store();
        const signal = $meta?.abort;

        let woken = false;
        let wake: (() => void) | undefined;
        const stop = window.onRecord(() => {
            woken = true;
            wake?.();
        });
        // One listener for the whole stream, and one that also releases the wake
        // already waiting. Registered here rather than inside the loop, where it
        // was added once per wake and never removed: a page left open for an hour
        // accumulated a listener per record and a warning to go with them, and the
        // array it grew was only ever traversed once, on abort (`@@F-798`).
        const leave = (): void => {
            wake?.();
        };
        signal?.addEventListener('abort', leave, {once: true});

        try {
            // A reader that has just opened the page is told where the buffer
            // stands, so it does not need a first call to learn whether it is
            // already behind. A reader that says where it got to is not told
            // again: that is what makes a reconnect free of a needless find.
            const last = window.last();
            if (last !== undefined && last !== params?.after) {
                yield {last, size: window.size};
            }
            while (!signal?.aborted) {
                if (!woken) {
                    await new Promise<void>(resolve => {
                        wake = resolve;
                    });
                    wake = undefined;
                }
                if (signal?.aborted) break;
                woken = false;
                const id = window.last();
                if (id !== undefined) yield {last: id, size: window.size};
            }
        } finally {
            signal?.removeEventListener('abort', leave);
            stop();
        }
    },
}));
