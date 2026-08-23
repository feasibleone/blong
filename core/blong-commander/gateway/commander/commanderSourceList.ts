import {validation} from '@feasibleone/blong';

/**
 * commanderSourceList — gateway schema for `commander.source.list`.
 * Registers the RPC route so the browser can fetch the permission-filtered
 * source descriptors (the commander page calls `commanderSourceList`).
 */
export default validation(
    async ({lib: {type}}) =>
        function commanderSourceList() {
            return {
                params: type.Object({}),
                result: type.Object({
                    items: type.Array(type.Unknown()),
                }),
            };
        },
);
