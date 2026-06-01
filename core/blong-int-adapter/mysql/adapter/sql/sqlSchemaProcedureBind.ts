import {handler} from '@feasibleone/blong';

/**
 * sqlSchemaProcedureBind — calls the knex adapter's built-in `schemaProcedureBind`
 * method to discover stored procedures whose names start with `sql_schema` and
 * generate callable handler functions for each one.
 *
 * Returns the `handlers` and `schemas` maps so the test layer can invoke
 * the discovered procedures directly.
 */
export default handler(
    () =>
        async function sqlSchemaProcedureBind(
            _params: Record<string, unknown>,
            _$meta: Record<string, unknown>,
        ) {
            return (this.schemaProcedureBind as (...args: unknown[]) => Promise<{
                handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>>;
                schemas: Record<string, unknown>;
            }>)('sql_schema');
        },
);
