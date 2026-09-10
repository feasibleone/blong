import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * testMysqlList — integration test for the commander explore vocabulary of the
 * knex adapter:
 *   `sql.schema.list` → databases/schemas (existing handler)
 *   `sql.table.list`  → tables in a schema (generic knex exec `list` op)
 */
export default handler(({lib: {group}, handler: {sqlSchemaList, sqlTableList}}) => ({
    testMysqlList: ({name = 'mysql explore list'}: {name?: string}) =>
        group(name)([
            async function listSchemas(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const result = await sqlSchemaList({}, $meta);
                assert.ok(Array.isArray(result), 'schema.list should return schemas');
                assert.ok(result.length > 0, 'should list at least one schema');
                return result;
            },
            async function listTables(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const result = await sqlTableList({}, $meta);
                const items = (result as {items?: unknown[]}).items ?? [];
                assert.ok(Array.isArray(items), 'table.list should return items');
                assert.ok(items.length > 0, 'should list at least one table');
                return result;
            },
        ]),
}));
