import {handler} from '@feasibleone/blong';

/**
 * sqlSchemaProcedureSync — synchronises inline stored-procedure definitions to
 * the database using the knex adapter's built-in `schemaProcedureSync` method.
 *
 * For the integration test we create a trivial `sql_schema_list_active` procedure
 * that returns all rows from `schema_item` where `schema_item_active = 1`.
 */
export default handler(
    () =>
        async function sqlSchemaProcedureSync(
            _params: Record<string, unknown>,
            _$meta: Record<string, unknown>,
        ): Promise<{created: string[]}> {
            return (
                this.schemaProcedureSync as (...args: unknown[]) => Promise<{created: string[]}>
            )([
                {
                    name: 'sql_schema_list_active',
                    sql: `CREATE PROCEDURE \`sql_schema_list_active\`()
BEGIN
    SELECT * FROM \`schema_item\` WHERE \`schemaItemActive\` = 1;
END`,
                },
            ]);
        },
);
