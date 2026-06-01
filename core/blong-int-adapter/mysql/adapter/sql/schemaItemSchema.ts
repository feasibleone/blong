import {Type} from 'typebox';

/**
 * TypeBox schema for the `schema_item` integration-test table.
 *
 * Declared in the adapter layer so the knex adapter's `activation.schema.tables`
 * config can reference it directly.  Test fixtures import from here rather than
 * the reverse.
 */
export const schemaItemSchema = Type.Object(
    {
        schemaItemId: Type.Integer(),
        schemaItemName: Type.String({maxLength: 255}),
        schemaItemDescription: Type.Optional(Type.String({maxLength: 1000})),
        schemaItemActive: Type.Optional(Type.Boolean()),
    },
    {required: ['schemaItemId', 'schemaItemName']},
);
