import {handler} from '@feasibleone/blong';

/**
 * sqlSchemaTableDrop — unconditionally drops the `item` integration-test
 * table. Used as a cleanup step in testMysqlSchema after schema tests complete.
 */
export default handler(
    () =>
        async function sqlSchemaTableDrop(
            _params: Record<string, unknown>,
            _$meta: Record<string, unknown>,
        ): Promise<void> {
            const knex = this.config?.context?.queryBuilder;
            if (!knex) throw new Error('Knex queryBuilder not available');
            await Promise.all([
                knex.schema.dropTableIfExists('item'),
                knex.schema.dropTableIfExists('itemPage'),
            ]);
        },
);
