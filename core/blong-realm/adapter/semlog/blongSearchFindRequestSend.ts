import {handler} from '@feasibleone/blong';

/**
 * The request the port makes for `blong.search.find`: free text over what was observed.
 *
 * A parameter the caller left out is not sent at all, because the service's own default is
 * a better answer than an empty one spelled `q=undefined`. See `blongFlowFindRequestSend.ts`
 * for why this is a conversion and not a handler.
 */
export default handler(
    () =>
        function blongSearchFindRequestSend(params: {query?: string; limit?: number}) {
            const search = new URLSearchParams();
            if (params.query) search.set('q', params.query);
            if (params.limit !== undefined) search.set('limit', String(params.limit));
            return {method: 'GET', path: '/search', query: search.toString(), responseType: 'json'};
        },
);
