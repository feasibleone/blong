import {handler} from '@feasibleone/blong';

/**
 * sqlTableCreate — creates the `item` test table in the blong-integration
 * database if it does not already exist.
 * This handler is called from integration tests to set up the test schema.
 */
export default handler(
    () =>
        async function sqlTableCreate(
            _params: unknown,
            _$meta: unknown,
        ): Promise<{table: string; existed: boolean}> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const qb = (this as any).config?.context?.queryBuilder;
            if (!qb) return {table: 'item', existed: false};
            const existed: boolean = await qb.schema.hasTable('item');
            if (!existed) {
                await qb.schema.createTable('item', (table: Record<string, CallableFunction>) => {
                    table['increments']('itemId');
                    table['string']('itemName', 255).notNullable();
                    table['text']('itemDescription').nullable();
                });
            }
            return {table: 'item', existed};
        },
);
