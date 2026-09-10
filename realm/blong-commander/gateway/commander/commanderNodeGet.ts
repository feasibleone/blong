import {validation} from '@feasibleone/blong';

/**
 * commanderNodeGet — gateway schema for `commander.node.get`.
 * Registers the RPC route for fetching a leaf node's content.
 */
export default validation(
    async ({lib: {type}}) =>
        function commanderNodeGet() {
            return {
                params: type.Object({
                    source: type.String(),
                    level: type.Number(),
                    node: type.Optional(type.Unknown()),
                }),
                result: type.Unknown(),
            };
        },
);
