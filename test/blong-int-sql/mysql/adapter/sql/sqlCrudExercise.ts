import {type Knex, handler} from '@feasibleone/blong';

/**
 * Integration-test helper (adapter handler): exercises the everyday CRUD path
 * through the adapter's `wrapKnex`-wrapped knex and returns the resulting rows.
 *
 * The calls mirror exactly what the knex adapter's `exec` function issues for
 * the standard predicates — `get` (`where().first()`), `find` (`select()`),
 * `add` (`insert()`), `edit` (`update()`), `remove` (`delete()`) — i.e. the
 * `knex('table')` builders, not `knex.transaction()` or `knex.raw()`.
 *
 * Unlike transactions or stored procedures, each of these statements runs in
 * its own implicit transaction (auto-commit), so a single CRUD statement cannot
 * produce a cross-statement deadlock; the builders are nonetheless deadlock-
 * wired (the wrapped `then` reports `ER_LOCK_DEADLOCK` to the adapter's
 * `onDeadlock` hook). This step proves the most-used path works end-to-end
 * through the wrapped knex.
 */
export default handler(
    () =>
        async function sqlCrudExercise(): Promise<{
            rows: Array<Record<string, unknown>>;
        }> {
            // @ts-expect-error -- `this` is bound to adapter context by the blong runtime
            const knex = this.config?.context?.queryBuilder as Knex | undefined;
            if (!knex) return {rows: []};

            await knex.raw(
                'CREATE TABLE IF NOT EXISTS crud_demo (crudId INT PRIMARY KEY, crudValue VARCHAR(50))',
            );
            await knex.raw('DELETE FROM crud_demo');
            await knex('crud_demo').insert({crudId: 1, crudValue: 'one'});
            await knex('crud_demo').insert({crudId: 2, crudValue: 'two'});
            await knex('crud_demo').where({crudId: 1}).first();
            await knex('crud_demo').where({crudId: 1}).update({crudValue: 'uno'});
            await knex('crud_demo').where({crudId: 2}).delete();
            const rows = (await knex('crud_demo').select('*').orderBy('crudId')) as Array<
                Record<string, unknown>
            >;
            await knex.raw('DROP TABLE IF EXISTS crud_demo').catch(() => {});
            return {rows};
        },
);
