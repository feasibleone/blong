import {handler} from '@feasibleone/blong';

/**
 * The request the port makes for `blong.digest.get`: the change stream since a point in
 * time.
 *
 * A parameter the caller left out is not sent at all, so the service answers from the
 * point it keeps rather than from one spelled `since=undefined`. See
 * `blongFlowFindRequestSend.ts` for why this is a conversion and not a handler.
 */
export default handler(
    () =>
        function blongDigestGetRequestSend(params: {since?: string; limit?: number}) {
            const search = new URLSearchParams();
            if (params.since) search.set('since', params.since);
            if (params.limit !== undefined) search.set('limit', String(params.limit));
            return {method: 'GET', path: '/digest', query: search.toString(), responseType: 'json'};
        },
);
