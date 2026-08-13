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
 * through the adapter's wrapped knex and returns a serializable summary.
 *
 * Two transactions lock the `deadlock_demo` rows in opposite order (T1:
 * row1 → row2, T2: row2 → row1) and pause with `SELECT SLEEP(1)` after
 * acquiring their first lock, so both are guaranteed to hold one row before
 * either requests the other → circular wait → the storage engine rolls back
 * one victim with error 1213 (`ER_LOCK_DEADLOCK`).
 *
 * Everything runs through `this.config.context.queryBuilder` — the adapter's
 * `wrapKnex`-wrapped knex — so the deadlock flows through the same
 * `onDeadlock` → `logKnexDeadlock` path used in production (`knex.transaction()`
 * and `knex.raw()` are both wrapped). The table is created/cleaned up through
 * `knex.raw()` on the same wrapped instance.
 */
export default handler(
    () =>
        async function sqlDeadlockTrigger(): Promise<{
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
                    '(deadlockId INT PRIMARY KEY, deadlockValue INT)',
            );
            await knex.raw('DELETE FROM deadlock_demo');
            await knex.raw(
                'INSERT INTO deadlock_demo (deadlockId, deadlockValue) VALUES (1, 0), (2, 0)',
            );

            const results = await withDeadlockTimeout(
                Promise.allSettled([
                    (async () => {
                        await knex.transaction(async trx => {
                            await trx('deadlock_demo')
                                .where({deadlockId: 1})
                                .update({deadlockValue: 1});
                            await trx.raw('SELECT SLEEP(1)');
                            await trx('deadlock_demo')
                                .where({deadlockId: 2})
                                .update({deadlockValue: 3});
                        });
                    })(),
                    (async () => {
                        await knex.transaction(async trx => {
                            await trx('deadlock_demo')
                                .where({deadlockId: 2})
                                .update({deadlockValue: 2});
                            await trx.raw('SELECT SLEEP(1)');
                            await trx('deadlock_demo')
                                .where({deadlockId: 1})
                                .update({deadlockValue: 4});
                        });
                    })(),
                ]),
            );

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
