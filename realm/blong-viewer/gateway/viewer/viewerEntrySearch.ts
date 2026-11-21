import {validation} from '@feasibleone/blong';

/**
 * `viewer.entry.search` — the schema a filter or a search asks with (`@@D-946`).
 *
 * The same parameter block as `find`, without `after`: a search reads the whole
 * buffer, so there is no window to continue from and an `after` would promise a
 * paging the answer does not have.
 */
export default validation(
    async ({lib: {type}}) =>
        function viewerEntrySearch() {
            return {
                params: type.Object({
                    level: type.Optional(type.String()),
                    name: type.Optional(type.String()),
                    signal: type.Optional(type.String()),
                    capture: type.Optional(type.String()),
                    traceId: type.Optional(type.String()),
                    search: type.Optional(type.String()),
                    hasError: type.Optional(type.Boolean()),
                    properties: type.Optional(type.Record(type.String(), type.String())),
                    limit: type.Optional(type.Number()),
                }),
                result: type.Object({
                    entries: type.Array(type.Unknown()),
                    total: type.Number(),
                }),
            };
        },
);
