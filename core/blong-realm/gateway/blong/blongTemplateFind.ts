import {validation} from '@feasibleone/blong';

/**
 * `blong.template.find` — what the service has learned to recognise.
 *
 * Declared in the `gateway` layer because that is what puts the method on the
 * RPC route (see `blongFlowFind.ts`).
 */
export default validation(
    async ({lib: {type}}) =>
        function blongTemplateFind() {
            return {
                params: type.Object({}),
                result: type.Unknown(),
            };
        },
);
