import {handler} from '@feasibleone/blong';

/**
 * The request the port makes for `blong.flow.find`: every kind it has observed.
 *
 * A *conversion* handler rather than an API handler, and that is the whole point of
 * this group: the port loop runs it before the call and hands its result to the
 * adapter's own `exec`, so the path is the only thing this realm has to say about
 * HTTP. Addressing the service, the TLS settings, the timeouts and the response
 * itself stay the adapter's, and the answer comes back through `responseReceive`.
 */
export default handler(
    () =>
        function blongFlowFindRequestSend() {
            return {method: 'GET', path: '/flows', responseType: 'json'};
        },
);
