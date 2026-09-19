import {validation} from '@feasibleone/blong';

/**
 * `blong.flow.find` — the gateway's declaration of the realm's flow read.
 *
 * A method is only routed by the gateway when the realm's `gateway` layer declares it,
 * and for this realm that makes these files the *only* place its six methods are
 * declared: the adapter holds conversions rather than handlers, so nothing else names
 * the method. Without this file the route does not exist, and a call answers JSON-RPC
 * `-32000 Not Found` — which is what every page in this realm did until these
 * declarations were added. In-process calls (the realm's own tap flow) never noticed,
 * because they resolve against the whole server registry rather than the gateway's
 * routes.
 *
 * The read itself is the `adapter/semlog/` conversion pair for this method —
 * `blongFlowFindRequestSend` builds the request, `responseReceive` takes the answer —
 * reached through the `blong` dispatch orchestrator.
 */
export default validation(
    async ({lib: {type}}) =>
        function blongFlowFind() {
            return {
                params: type.Object({}),
                // The service owns the shape of what it observed; declaring it here
                // would be a second, drifting copy of an external contract.
                result: type.Unknown(),
            };
        },
);
