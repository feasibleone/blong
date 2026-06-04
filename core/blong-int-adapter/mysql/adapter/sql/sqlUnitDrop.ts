import {handler} from '@feasibleone/blong';

/**
 * sqlUnitDrop — drops the `unit` test table from the blong-integration
 * database if it exists.
 * This handler is called from integration tests to clean up after tests.
 */
export default handler(
    () =>
        async function sqlUnitDrop(
            _params: Record<string, never>,
            _$meta: Record<string, unknown>,
        ): Promise<{table: string; dropped: boolean}> {
            const existed = await this.config?.context?.queryBuilder?.schema.hasTable('unit');
            if (existed) {
                await this.config?.context?.queryBuilder?.schema.dropTable('unit');
            }
            return {table: 'unit', dropped: existed ?? false};
        },
);
