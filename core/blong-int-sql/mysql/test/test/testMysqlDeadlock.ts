import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * Integration tests for the knex adapter's deadlock handling against a real
 * MySQL backend. Genuine deadlocks are driven through the wrapped adapter paths
 * and surface with exactly the fields the adapter's deadlock logging
 * (`logKnexDeadlock` in `@feasibleone/blong-gogo`, unit-tested there) emits:
 * `code`, `errno`, `sql`, `sqlMessage` and `message`.
 *
 * Covered wrapped paths:
 *   - `knex('table')` builders  → `sqlDeadlockBuilder` — the exec path: two
 *     `SELECT … FOR UPDATE` builder queries lock the same rows in opposite
 *     order (`.orderBy('id','asc'/'desc')`), with a `SELECT SLEEP(1)`
 *     projection holding the first lock so the circular wait is deterministic
 *   - `knex.transaction()`      → `sqlDeadlockTrigger` (two transaction blocks,
 *     opposite lock order + `SELECT SLEEP(1)`, `Promise.allSettled`)
 *   - `knex.raw('CALL …')`      → `sqlDeadlockProcTrigger` (two stored
 *     procedures, opposite lock order + `SELECT SLEEP(1)`, `Promise.allSettled`)
 *   - exec-style CRUD round-trip → `sqlCrudExercise` (get/find/add/edit/remove)
 *
 * No raw `mysql2` connections are used.
 */
export default handler(
    ({
        lib: {group},
        handler: {sqlDeadlockTrigger, sqlDeadlockProcTrigger, sqlDeadlockBuilder, sqlCrudExercise},
    }) => ({
        testMysqlDeadlock: ({name = 'mysql deadlock'}: {name?: string}) =>
            group(name)([
                async function deadlockThroughBuilder(assert: typeof Assert, {$meta}) {
                    const result = (await sqlDeadlockBuilder({}, $meta)) as DeadlockSummary;
                    assert.ok(
                        result.deadlocked,
                        'the concurrent knex(table) builder queries deadlocked',
                    );
                    assert.equal(result.error?.code, 'ER_LOCK_DEADLOCK', 'deadlock error code');
                    assert.equal(result.error?.errno, 1213, 'deadlock errno 1213');
                    assert.ok(
                        typeof result.error?.sql === 'string' &&
                            (result.error?.sql?.length ?? 0) > 0,
                        'deadlock error carries the offending query (err.sql)',
                    );
                    assert.ok(
                        typeof result.error?.sqlMessage === 'string' &&
                            (result.error?.sqlMessage?.length ?? 0) > 0,
                        'deadlock error carries the detail the adapter logs (err.sqlMessage)',
                    );
                },
                async function deadlockThroughAdapter(assert: typeof Assert, {$meta}) {
                    const result = (await sqlDeadlockTrigger({}, $meta)) as DeadlockSummary;
                    assert.ok(result.deadlocked, 'one of the concurrent transactions deadlocked');
                    assert.equal(result.error?.code, 'ER_LOCK_DEADLOCK', 'deadlock error code');
                    assert.equal(result.error?.errno, 1213, 'deadlock errno 1213');
                    assert.ok(
                        typeof result.error?.sql === 'string' &&
                            (result.error?.sql?.length ?? 0) > 0,
                        'deadlock error carries the offending query (err.sql)',
                    );
                    assert.ok(
                        typeof result.error?.sqlMessage === 'string' &&
                            (result.error?.sqlMessage?.length ?? 0) > 0,
                        'deadlock error carries the detail the adapter logs (err.sqlMessage)',
                    );
                    assert.ok(
                        typeof result.error?.message === 'string' &&
                            (result.error?.message?.length ?? 0) > 0,
                        'deadlock error carries err.message (logged as err by logKnexDeadlock)',
                    );
                },
                async function deadlockThroughProcedure(assert: typeof Assert, {$meta}) {
                    const result = (await sqlDeadlockProcTrigger({}, $meta)) as DeadlockSummary;
                    assert.ok(
                        result.deadlocked,
                        'one of the concurrent stored-procedure calls deadlocked',
                    );
                    assert.equal(result.error?.code, 'ER_LOCK_DEADLOCK', 'deadlock error code');
                    assert.equal(result.error?.errno, 1213, 'deadlock errno 1213');
                    assert.ok(
                        typeof result.error?.sql === 'string' &&
                            (result.error?.sql?.length ?? 0) > 0,
                        'deadlock error carries the offending query (err.sql)',
                    );
                    assert.ok(
                        typeof result.error?.sqlMessage === 'string' &&
                            (result.error?.sqlMessage?.length ?? 0) > 0,
                        'deadlock error carries the detail the adapter logs (err.sqlMessage)',
                    );
                },
                async function crudThroughAdapter(assert: typeof Assert, {$meta}) {
                    const result = (await sqlCrudExercise({}, $meta)) as {
                        rows: Array<Record<string, unknown>>;
                    };
                    assert.ok(Array.isArray(result.rows), 'exec-style CRUD returned rows');
                    assert.equal(result.rows.length, 1, 'one row remains after add/edit/remove');
                    assert.equal(
                        result.rows[0]?.crudValue,
                        'uno',
                        'edit applied through the adapter',
                    );
                },
            ]),
    }),
);

interface DeadlockSummary {
    deadlocked: boolean;
    error?: {
        message?: string;
        code?: string;
        errno?: number;
        sql?: string;
        sqlMessage?: string;
    };
}
