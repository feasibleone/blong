import {validation} from '@feasibleone/blong';

/**
 * commanderNodeViewer — gateway schema for `commander.node.viewer`.
 * Registers the RPC route for viewer resolution on a leaf node.
 */
export default validation(
    async ({lib: {type}}) =>
        function commanderNodeViewer() {
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
