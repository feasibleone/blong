import {handler, type Knex} from '@feasibleone/blong';

/**
 * sqlResourceSetup — cleans the resource-backed / graph-edge test tables so
 * each `test.mysql.resource` run starts from a known state.
 *
 * Deletes in FK-safe order: graph edges first, then the entity rows, then the
 * `core_resource` rows created for the `sql.person` / `sql.team` types (their
 * PK is a FK → `core.resource`). The `core_type` rows are left in place —
 * `ensureType` in the adapter `add` recreates them idempotently.
 */
export default handler(
    () =>
        async function sqlResourceSetup(
            _params: Record<string, never>,
            _$meta: Record<string, unknown>,
        ): Promise<{cleaned: boolean}> {
            const qb: Knex | undefined = this.config?.context?.queryBuilder;
            if (!qb) return {cleaned: false};
            await qb('core_triple').where('predicateName', 'hasMember').del();
            for (const table of ['sql_team', 'sql_person', 'sql_ulid', 'sql_uuid']) {
                await qb(table).del();
            }
            const typeIds = await qb('core_type')
                .whereIn('typeAlias', ['sql.person', 'sql.team'])
                .select('typeId');
            if (typeIds.length) {
                await qb('core_resource')
                    .whereIn(
                        'typeId',
                        typeIds.map((r: {typeId: number}) => r.typeId),
                    )
                    .del();
            }
            return {cleaned: true};
        },
);
