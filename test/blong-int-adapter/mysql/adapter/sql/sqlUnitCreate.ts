import {handler} from '@feasibleone/blong';

/**
 * sqlUnitCreate — creates the `unit` test table in the blong-integration
 * database if it does not already exist.
 * This handler is called from integration tests to set up the test schema.
 */
export default handler(
    () =>
        async function sqlUnitCreate(
            _params: Record<string, never>,
            _$meta: Record<string, unknown>,
        ): Promise<{table: string; existed: boolean}> {
            const existed = await this.config?.context?.queryBuilder?.schema.hasTable('sql_unit');
            if (!existed) {
                await this.config?.context?.queryBuilder?.schema.createTable(
                    'sql_unit',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (table: any) => {
                        table.increments('unitId');
                        table.string('unitName', 255).notNullable();
                        table.text('unitDescription').nullable();
                    },
                );
            }
            return {table: 'sql_unit', existed: existed ?? false};
        },
);
