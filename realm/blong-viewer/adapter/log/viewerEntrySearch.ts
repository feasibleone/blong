import type {IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';
import type {FilterOptions, LogEntry} from './store.ts';

/**
 * `viewer.entry.search` — everything the buffer holds that matches (`@@D-946`).
 *
 * `find` answers the recent window a reader polls; this answers the whole
 * buffer, which is what a filter or a free-text search asks for. The two are
 * separate because they cost different things: a poll runs every second and
 * must stay cheap, a search is what a person typed and may look at all of it.
 *
 * The entries come back newest last, as they were received, so a reader appends
 * what it is given and never has to sort.
 */
export default handler(({lib: {store}}) => ({
    async viewerEntrySearch(
        params: FilterOptions = {},
        _$meta: IMeta,
    ): Promise<{entries: LogEntry[]; total: number}> {
        const window = store();
        const entries = window.query(params);
        return {entries, total: entries.length};
    },
}));
