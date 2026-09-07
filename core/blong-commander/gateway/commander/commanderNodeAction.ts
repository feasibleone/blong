import {validation} from '@feasibleone/blong';

/**
 * commanderNodeAction — gateway schema for `commander.node.action`.
 * Registers the RPC route for generic node actions (open/refresh/copy path).
 */
export default validation(
    async ({lib: {type}}) =>
        function commanderNodeAction() {
            return {
                params: type.Object({
                    source: type.String(),
                    level: type.Number(),
                    node: type.Optional(type.Unknown()),
                    action: type.String(),
                }),
                result: type.Unknown(),
            };
        },
);
