/**
 * Unit tests for the knex adapter's MySQL deadlock logging (`logKnexDeadlock`),
 * including the `wrapKnex`/`onDeadlock` wiring used by the adapter's `start()`.
 *
 * Deadlock *detection* (`isDeadlock`) and the `wrapJsonBuilder` `onDeadlock`
 * hook itself are covered in `adapter/schema/knex/json.test.ts`. These tests
 * cover the logging that turns a detected deadlock into a 'knex deadlock' log
 * entry (and the debug/logLevel gating), plus the end-to-end wiring a real
 * deadlock rejection travels through.
 */

import {test} from 'tap';

import {wrapKnex} from '../schema/knex/json.ts';
import {logKnexDeadlock} from './knex.ts';

function makeLog(): {log: {error: (...a: unknown[]) => void}; calls: Array<{args: unknown[]}>} {
    const calls: Array<{args: unknown[]}> = [];
    return {
        log: {
            error: (...args: unknown[]) => calls.push({args}),
        },
        calls,
    };
}

// Shaped like a real mysql2 deadlock error: `message` feeds the logged `err`,
// `sql`/`sqlMessage` are the actual detail the adapter surfaces.
const DEADLOCK = {
    errno: 1213,
    code: 'ER_LOCK_DEADLOCK',
    sql: 'UPDATE `deadlock_demo` set `deadlockValue` = 3 where `deadlockId` = 2',
    sqlMessage: 'Deadlock found when trying to get lock; try restarting transaction',
    message: 'Deadlock found when trying to get lock; try restarting transaction',
};

const EXPECTED_ENTRY = {
    err: DEADLOCK.message,
    code: 'ER_LOCK_DEADLOCK',
    errno: 1213,
    sql: DEADLOCK.sql,
    sqlMessage: DEADLOCK.sqlMessage,
};

test('logKnexDeadlock logs full deadlock details when config.debug is set', t => {
    const {log, calls} = makeLog();
    logKnexDeadlock({debug: true}, log, DEADLOCK);

    t.equal(calls.length, 1, 'logged exactly once');
    t.same(calls[0].args[0], EXPECTED_ENTRY, 'entry carries err, code, errno, sql, sqlMessage');
    t.equal(calls[0].args[1], 'knex deadlock', 'message is "knex deadlock"');
    t.end();
});

test('logKnexDeadlock logs when logLevel is debug', t => {
    const {log, calls} = makeLog();
    logKnexDeadlock({logLevel: 'debug'}, log, DEADLOCK);
    t.equal(calls.length, 1, 'logged once');
    t.end();
});

test('logKnexDeadlock stays silent unless debug or logLevel debug', t => {
    const {log, calls} = makeLog();
    logKnexDeadlock({logLevel: 'info'}, log, DEADLOCK);
    logKnexDeadlock({}, log, DEADLOCK);
    t.same(calls, [], 'no log entries when gating is off');
    t.end();
});

test('logKnexDeadlock maps a plain Error to its message', t => {
    const {log, calls} = makeLog();
    logKnexDeadlock({debug: true}, log, new Error('boom'));
    t.equal(calls.length, 1, 'logged once');
    t.equal((calls[0].args[0] as {err?: unknown}).err, 'boom', 'err is the error message');
    t.end();
});

test('logKnexDeadlock tolerates a missing log method', t => {
    t.doesNotThrow(() => logKnexDeadlock({debug: true}, undefined, DEADLOCK), 'no log at all');
    t.doesNotThrow(() => logKnexDeadlock({debug: true}, {}, DEADLOCK), 'log without error method');
    t.end();
});

test('wrapKnex onDeadlock wiring logs the deadlock (as wired in adapter start())', async t => {
    const {log, calls} = makeLog();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeKnex = (() => makeRejectingBuilder(DEADLOCK)) as any;
    const wrapped = wrapKnex(fakeKnex, {
        onDeadlock: error => logKnexDeadlock({debug: true}, log, error),
    });
    const builder = wrapped('deadlock_demo');

    await t.rejects(Promise.resolve(builder.then(null, null)), DEADLOCK, 'query still rejects');
    t.equal(calls.length, 1, 'deadlock logged once');
    t.equal(calls[0].args[1], 'knex deadlock', 'logged with the deadlock message');
    t.same(calls[0].args[0], EXPECTED_ENTRY, 'full deadlock details logged');
    t.end();
});

/** A minimal knex-like builder whose `then` rejects with `error`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRejectingBuilder(error: unknown): any {
    return {
        insert(..._args: unknown[]) {
            return this;
        },
        update(..._args: unknown[]) {
            return this;
        },
        then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
            return Promise.reject(error).then(onFulfilled, onRejected);
        },
    };
}
