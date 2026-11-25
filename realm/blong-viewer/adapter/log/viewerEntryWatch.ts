import type {IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';
import type {LogEntry} from './store.ts';

/**
 * `viewer.entry.watch` — what arrived, and where a reader now is (`@@D-948`).
 *
 * The default frame carries the records: `{entries, last, size}`, where `entries` is what the buffer
 * received after the id the reader was last told (`@@D-986`). A reader that can afford a second call
 * says `details: false` and is sent `{last, size}` alone — the mode this realm's own page uses,
 * because a log line is not worth a frame of its own and the records it wants come from
 * `viewer.entry.find`.
 *
 * Both modes live in one handler because they are one stream with one cursor: what the flag changes
 * is what a frame carries, never when a frame is sent.
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
        params: {after?: string; details?: boolean},
        $meta: IMeta,
    ): AsyncIterable<{last?: string; size: number; entries?: LogEntry[]}> {
        const window = store();
        const signal = $meta?.abort;
        // A frame carries what arrived, and a reader that can afford the second call asks for the
        // cursor alone with `details: false` (`@@D-986`). This page does: a log line is not worth a
        // frame of its own, and the records it wants are the ones `viewer.entry.find` already pages.
        const details = params?.details !== false;
        // Where this reader already is, so a frame says only what it has not been told.
        let seen = params?.after;

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

        /**
         * What this reader has not been told yet, or `undefined` when it is current.
         *
         * The cursor moves with the frame, so two records arriving inside one wake are one frame
         * only if nothing asked in between — which is the point of carrying them: the reader gets
         * what arrived, once.
         */
        const frame = (): {last: string; size: number; entries?: LogEntry[]} | undefined => {
            const last = window.last();
            if (last === undefined || last === seen) return undefined;
            const entries = details ? window.recent({after: seen}) : undefined;
            seen = last;
            return {...(entries === undefined ? {} : {entries}), last, size: window.size};
        };

        try {
            // A reader that has just opened the page is told where the buffer
            // stands, so it does not need a first call to learn whether it is
            // already behind. A reader that says where it got to is not told
            // again: that is what makes a reconnect free of a needless find.
            const opening = frame();
            if (opening) yield opening;
            while (!signal?.aborted) {
                if (!woken) {
                    await new Promise<void>(resolve => {
                        wake = resolve;
                    });
                    wake = undefined;
                }
                if (signal?.aborted) break;
                woken = false;
                const next = frame();
                if (next) yield next;
            }
        } finally {
            signal?.removeEventListener('abort', leave);
            stop();
        }
    },
}));
