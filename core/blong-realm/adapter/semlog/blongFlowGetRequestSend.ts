import {handler} from '@feasibleone/blong';

/**
 * The request the port makes for `blong.flow.get`: one execution's diagram, or one
 * kind's.
 *
 * The reference is a path segment, so it is encoded rather than concatenated: an
 * identifier the caller composed is caller-supplied text like any other. See
 * `blongFlowFindRequestSend.ts` for why this is a conversion and not a handler.
 */
export default handler(
    () =>
        function blongFlowGetRequestSend(params: {reference: string}) {
            return {
                method: 'GET',
                path: `/flows/${encodeURIComponent(params.reference)}/diagram`,
                responseType: 'json',
            };
        },
);
