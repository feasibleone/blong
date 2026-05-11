import {handler} from '@feasibleone/blong';

/**
 * sqlTableDrop — drops the `item` test table from the blong-integration
 * database if it exists.
 * This handler is called from integration tests to clean up after tests.
 */
export default handler(
    () =>
        async function sqlTableDrop(_params: unknown, _$meta: unknown): Promise<{table: string; dropped: boolean}> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const qb = (this as any).config?.context?.queryBuilder;
            if (!qb) return {table: 'item', dropped: false};
            const existed: boolean = await qb.schema.hasTable('item');
            if (existed) {
                await qb.schema.dropTable('item');
            }
            return {table: 'item', dropped: existed};
        },
);
