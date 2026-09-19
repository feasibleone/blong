import {validation} from '@feasibleone/blong';

/**
 * `blong.flow.get` — the sequence diagram of one execution or one flow kind.
 *
 * The reference is an execution id or a flow kind; the service decides which,
 * and answers 404 for a reference that is neither. Declared in the `gateway`
 * layer because that is what puts the method on the RPC route (see
 * `blongFlowFind.ts`).
 */
export default validation(
    async ({lib: {type}}) =>
        function blongFlowGet() {
            return {
                params: type.Object({
                    reference: type.String(),
                }),
                // Mermaid text the service drew, or a message saying it did not.
                result: type.Unknown(),
            };
        },
);
