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
 * through stored-procedure calls (`knex.raw('CALL …')`) and returns a
 * serializable summary.
 *
 * Two stored procedures each run a multi-statement transaction that locks the
 * `deadlock_demo` rows in opposite order (A: row1 → row2, B: row2 → row1),
 * pausing with `SELECT SLEEP(1)` after the first lock so both hold one row
 * before either requests the other's → circular wait → the storage engine rolls
 * back one victim with error 1213 (`ER_LOCK_DEADLOCK`).
 *
 * Both `CALL`s run through the adapter's wrapped knex (`knex.raw()` is covered
 * by `wrapKnex`), so the deadlock flows through the same `onDeadlock` →
 * `logKnexDeadlock` path as production stored-procedure calls. The procedures
 * are created/cleaned up through `knex.raw()` on the same wrapped instance.
 */
export default handler(
    () =>
        async function sqlDeadlockProcTrigger(): Promise<{
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

            try {
                await knex.raw(
                    'CREATE TABLE IF NOT EXISTS deadlock_demo ' +
                        '(deadlockId INT PRIMARY KEY, deadlockValue INT)',
                );
                await knex.raw('DELETE FROM deadlock_demo');
                await knex.raw(
                    'INSERT INTO deadlock_demo (deadlockId, deadlockValue) VALUES (1, 0), (2, 0)',
                );

                await knex.raw('DROP PROCEDURE IF EXISTS deadlockProcA');
                await knex.raw('DROP PROCEDURE IF EXISTS deadlockProcB');
                await knex.raw(
                    'CREATE PROCEDURE deadlockProcA() BEGIN ' +
                        'START TRANSACTION; ' +
                        'UPDATE deadlock_demo SET deadlockValue = 1 WHERE deadlockId = 1; ' +
                        'SELECT SLEEP(1); ' +
                        'UPDATE deadlock_demo SET deadlockValue = 3 WHERE deadlockId = 2; ' +
                        'COMMIT; ' +
                        'END',
                );
                await knex.raw(
                    'CREATE PROCEDURE deadlockProcB() BEGIN ' +
                        'START TRANSACTION; ' +
                        'UPDATE deadlock_demo SET deadlockValue = 2 WHERE deadlockId = 2; ' +
                        'SELECT SLEEP(1); ' +
                        'UPDATE deadlock_demo SET deadlockValue = 4 WHERE deadlockId = 1; ' +
                        'COMMIT; ' +
                        'END',
                );

                const results = await withDeadlockTimeout(
                    Promise.allSettled([
                        knex.raw('CALL deadlockProcA()'),
                        knex.raw('CALL deadlockProcB()'),
                    ]),
                );
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
            } finally {
                await knex.raw('DROP PROCEDURE IF EXISTS deadlockProcA').catch(() => {});
                await knex.raw('DROP PROCEDURE IF EXISTS deadlockProcB').catch(() => {});
                await knex.raw('DROP TABLE IF EXISTS deadlock_demo').catch(() => {});
            }
        },
);
