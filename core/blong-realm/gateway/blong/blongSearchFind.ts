import {validation} from '@feasibleone/blong';

/**
 * `blong.search.find` — free-text search over what the service has observed.
 *
 * Declared in the `gateway` layer because that is what puts the method on the
 * RPC route (see `blongFlowFind.ts`).
 */
export default validation(
    async ({lib: {type}}) =>
        function blongSearchFind() {
            return {
                params: type.Object({
                    query: type.Optional(type.String()),
                    limit: type.Optional(type.Number()),
                }),
                result: type.Unknown(),
            };
        },
);
