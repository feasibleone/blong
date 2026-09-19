import {handler} from '@feasibleone/blong';

/**
 * The request the port makes for `blong.incident.find`: the correlated failures.
 *
 * See `blongFlowFindRequestSend.ts` for why this is a conversion and not a handler.
 */
export default handler(
    () =>
        function blongIncidentFindRequestSend() {
            return {method: 'GET', path: '/incidents', responseType: 'json'};
        },
);
