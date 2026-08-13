import {type Knex, handler} from '@feasibleone/blong';

/**
 * Fail fast instead of waiting out the MySQL lock-wait timeout if a deadlock
 * fails to trip (defensive CI guard — the pattern is deterministic).
 */
const withDeadlockTimeout = <T>(promise: Promise<T>, ms = 20_000): Promise<T> =>
    Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`deadlock test timed out after ${ms}ms`)), ms),
        ),
    ]);

/**
 * Integration-test helper (adapter handler): drives a genuine MySQL deadlock
 * through the `knex('table')` **builder** path — the same table-builder calls
 * the knex adapter's `exec` function issues (no `knex.transaction()`, no
 * standalone `knex.raw()` query) — and returns a serializable summary.
 *
 * Two concurrent builder queries `SELECT … FROM deadlock_demo … FOR UPDATE`
 * lock the same two rows in **opposite order** via `.orderBy('deadlockId',
 * 'asc' / 'desc')`. The `SELECT SLEEP(1)` projection makes each statement hold
 * its first row lock for ~1s, so both sides are guaranteed to hold one row
 * before either requests the other's → circular wait → one victim is rolled
 * back with error 1213 (`ER_LOCK_DEADLOCK`). Empirically 100% deterministic.
 *
 * The deadlock rejection flows through the wrapped builder's `.then`, i.e. the
 * same `onDeadlock` → `logKnexDeadlock` path as production CRUD.
 */
export default handler(
    () =>
        async function sqlDeadlockBuilder(): Promise<{
            deadlocked: boolean;
            error?: {
                message?: string;
                code?: string;
                errno?: number;
                sql?: string;
                sqlMessage?: string;
            };
        }> {
            // @ts-expect-error -- `this` is bound to adapter context by the blong runtime
            const knex = this.config?.context?.queryBuilder as Knex | undefined;
            if (!knex) return {deadlocked: false};

            await knex.raw(
                'CREATE TABLE IF NOT EXISTS deadlock_demo ' +
                    '(deadlockId INT PRIMARY KEY, deadlockValue VARCHAR(10))',
            );
            await knex.raw('DELETE FROM deadlock_demo');
            await knex.raw("INSERT INTO deadlock_demo VALUES (1, 'a'), (2, 'b')");

            const asc = knex('deadlock_demo')
                .select(knex.raw('SLEEP(1)'))
                .whereIn('deadlockId', [1, 2])
                .orderBy('deadlockId', 'asc')
                .forUpdate();
            const desc = knex('deadlock_demo')
                .select(knex.raw('SLEEP(1)'))
                .whereIn('deadlockId', [1, 2])
                .orderBy('deadlockId', 'desc')
                .forUpdate();

            const results = await withDeadlockTimeout(Promise.allSettled([asc, desc]));
            await knex.raw('DROP TABLE IF EXISTS deadlock_demo').catch(() => {});

            const rejected = results.filter(
                (result): result is PromiseRejectedResult => result.status === 'rejected',
            );
            if (rejected.length === 0) return {deadlocked: false};
            const reason = rejected[0].reason as {
                message?: string;
                code?: string;
                errno?: number;
                sql?: string;
                sqlMessage?: string;
            };
            return {
                deadlocked: true,
                error: {
                    message: reason.message,
                    code: reason.code,
                    errno: reason.errno,
                    sql: reason.sql,
                    sqlMessage: reason.sqlMessage,
                },
            };
        },
);
