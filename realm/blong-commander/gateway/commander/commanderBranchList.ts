import {validation} from '@feasibleone/blong';

/**
 * commanderBranchList — gateway schema for `commander.branch.list`.
 * Registers the RPC route for generic children dispatch.
 */
export default validation(
    async ({lib: {type}}) =>
        function commanderBranchList() {
            return {
                params: type.Object({
                    source: type.String(),
                    level: type.Optional(type.Number()),
                    parent: type.Optional(type.Unknown()),
                    paging: type.Optional(
                        type.Object({
                            pageSize: type.Optional(type.Number()),
                            pageNumber: type.Optional(type.Number()),
                        }),
                    ),
                }),
                result: type.Object({
                    items: type.Array(type.Unknown()),
                }),
            };
        },
);
