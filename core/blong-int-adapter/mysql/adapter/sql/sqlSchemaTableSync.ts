import {handler} from '@feasibleone/blong';

/**
 * sqlSchemaTableSync — creates or synchronises the `schema_item` integration-test
 * table using the knex adapter's built-in `schemaTableSync` method driven by the
 * TypeBox schema declared in the test fixtures.
 *
 * Passing `dropColumns: true` will additionally remove any columns not present
 * in the TypeBox schema (useful for cleanup between test runs).
 */
export default handler(
    ({schema}) =>
        async function sqlSchemaTableSync(
            params: {dropColumns?: boolean},
            _$meta: Record<string, unknown>,
        ): Promise<{created: boolean; added: string[]; dropped: string[]}> {
            return (
                this.schemaTableSync as (
                    ...args: unknown[]
                ) => Promise<{created: boolean; added: string[]; dropped: string[]}>
            )('item', schema.mysql.item, {
                dropColumns: params.dropColumns ?? false,
            });
        },
);
