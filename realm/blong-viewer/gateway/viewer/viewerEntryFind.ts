import {validation} from '@feasibleone/blong';

/**
 * `viewer.entry.find` — the schema a reader polls (`@@D-946`).
 *
 * The parameter block is the standalone viewer's filter, so the two surfaces
 * ask for the same thing in the same words; `after` is the one member a poll
 * needs that a page-load does not, and it is the last id the reader already has.
 *
 * The result is `unknown[]` deliberately: a record is whatever lukaot wrote, and
 * a schema that described today's fields would refuse the record a later release
 * adds — a viewer that cannot show a new field is the one failure it must not
 * have.
 */
export default validation(
    async ({lib: {type}}) =>
        function viewerEntryFind() {
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
                    after: type.Optional(type.String()),
                    limit: type.Optional(type.Number()),
                }),
                result: type.Object({
                    entries: type.Array(type.Unknown()),
                    total: type.Number(),
                    last: type.Optional(type.String()),
                }),
            };
        },
);
