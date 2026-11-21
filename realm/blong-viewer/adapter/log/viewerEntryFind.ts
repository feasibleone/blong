import type {IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';
import type {FilterOptions, LogEntry} from './store.ts';

/**
 * `viewer.entry.find` — the records a reader is looking at (`@@D-946`).
 *
 * The recent window, newest last, which is what a page polls: `after` carries
 * the last id the reader already has, so a poll costs the new lines rather than
 * the whole buffer. `total` is the buffer's size, not the window's — the reader
 * draws "holding N" from it, and a window that hid the number would make a
 * rolling buffer look like a history.
 *
 * The filter is the standalone viewer's own (`FilterOptions`), passed through
 * untouched: a second filter dialect would make the same record selectable in
 * one surface and not the other.
 */
export default handler(({lib: {store}}) => ({
    async viewerEntryFind(
        params: FilterOptions = {},
        _$meta: IMeta,
    ): Promise<{entries: LogEntry[]; total: number; last?: string}> {
        const window = store();
        const entries = window.recent(params);
        return {
            entries,
            total: window.size,
            ...(entries.length > 0 && {last: entries[entries.length - 1].id}),
        };
    },
}));
