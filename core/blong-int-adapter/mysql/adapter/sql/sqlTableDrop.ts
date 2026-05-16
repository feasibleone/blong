import {handler} from '@feasibleone/blong';

/**
 * sqlTableDrop — drops the `item` test table from the blong-integration
 * database if it exists.
 * This handler is called from integration tests to clean up after tests.
 */
export default handler(
    () =>
        async function sqlTableDrop(
            _params: Record<string, never>,
            _$meta: Record<string, unknown>,
        ): Promise<{table: string; dropped: boolean}> {
            const existed = await this.config?.context?.queryBuilder?.schema.hasTable('item');
            if (existed) {
                await this.config?.context?.queryBuilder?.schema.dropTable('item');
            }
            return {table: 'item', dropped: existed ?? false};
        },
);
