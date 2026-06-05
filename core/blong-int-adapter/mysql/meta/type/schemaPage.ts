import {schema} from '@feasibleone/blong';

/**
 * Defines the `itemPage` object schema by composing `item`
 * from the accumulated objectSchema.  This demonstrates reuse: by the time this
 * `schema()` factory runs, `schema.ts` has already been
 * processed (alphabetical load order) and `blong.schema.item` is
 * available as a TypeBox object reference.
 */
export default schema(
    async ({
        lib: {type},
        schema: {
            mysql: {item},
        },
    }) => ({
        itemPage: type.Object(
            {
                item: type.Array(item ?? type.Unknown()),
                total: type.Integer(),
                page: type.Optional(type.Integer()),
                pageSize: type.Optional(type.Integer()),
            },
            {required: ['item', 'total']},
        ),
    }),
);
