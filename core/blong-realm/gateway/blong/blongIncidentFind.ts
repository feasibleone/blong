import {validation} from '@feasibleone/blong';

/**
 * `blong.incident.find` — the executions the service considers broken.
 *
 * Declared in the `gateway` layer because that is what puts the method on the
 * RPC route (see `blongFlowFind.ts`).
 */
export default validation(
    async ({lib: {type}}) =>
        function blongIncidentFind() {
            return {
                params: type.Object({}),
                result: type.Unknown(),
            };
        },
);
