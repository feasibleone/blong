/**
 * Unit tests for the knex JSON-column interception (json.ts).
 *
 * Verifies that:
 *  - object/array values for `*JSON` columns are serialized to strings on write
 *  - `*JSON` string values are parsed back to objects on read (lenient)
 *  - `wrapJsonBuilder` intercepts insert/update inputs and query results
 */

import {test} from 'tap';

import {
    isDeadlock,
    isRetryableConnectionError,
    parseJsonResult,
    parseJsonRow,
    stringifyJsonValues,
    withConnectionRetry,
    wrapJsonBuilder,
    wrapKnex,
} from './json.ts';

test('stringifyJsonValues serializes object/array values for *JSON columns only', t => {
    const out = stringifyJsonValues({
        credentialParamsJSON: {function: 'hash', iterations: 100000},
        flowStepsJSON: ['password', 'totp'],
        credentialSalt: 'salt',
        credentialType: 'password',
    });
    t.equal(out.credentialParamsJSON, '{"function":"hash","iterations":100000}');
    t.equal(out.flowStepsJSON, '["password","totp"]');
    t.equal(out.credentialSalt, 'salt');
    t.equal(out.credentialType, 'password');
    t.end();
});

test('stringifyJsonValues leaves already-string *JSON values untouched', t => {
    const out = stringifyJsonValues({credentialParamsJSON: '{"a":1}', userId: 'u1'});
    t.equal(out.credentialParamsJSON, '{"a":1}');
    t.equal(out.userId, 'u1');
    t.end();
});

test('parseJsonRow parses *JSON strings, keeps invalid JSON and non-JSON columns', t => {
    const row = parseJsonRow({
        credentialParamsJSON: '{"function":"hash"}',
        configJSON: 'not-json',
        credentialSalt: 'salt',
    });
    t.same(row.credentialParamsJSON, {function: 'hash'});
    t.equal(row.configJSON, 'not-json');
    t.equal(row.credentialSalt, 'salt');
    t.end();
});

test('parseJsonResult handles single row, row arrays and [rows, meta] DML shapes', t => {
    // single row
    t.same(parseJsonResult({credentialParamsJSON: '{"a":1}'}), {
        credentialParamsJSON: {a: 1},
    });
    // array of rows
    t.same(
        parseJsonResult([{credentialParamsJSON: '{"a":1}'}, {credentialParamsJSON: '{"b":2}'}]),
        [{credentialParamsJSON: {a: 1}}, {credentialParamsJSON: {b: 2}}],
    );
    // [rows, meta] from MySQL DML — meta object is left untouched
    const dml = parseJsonResult([{fieldCount: 0, insertId: 1}, undefined]) as Array<unknown>;
    t.equal((dml[0] as Record<string, unknown>).insertId, 1);
    // scalars pass through
    t.equal(parseJsonResult(3), 3);
    t.end();
});

test('wrapJsonBuilder serializes JSON columns on insert/update and parses on then', async t => {
    const captured: Array<Record<string, unknown>> = [];
    const builder = {
        _result: undefined as unknown,
        insert(value: Record<string, unknown>) {
            captured.push(value);
            return this;
        },
        update(value: Record<string, unknown>) {
            captured.push(value);
            return this;
        },
        then(onFulfilled: (value: unknown) => unknown) {
            return Promise.resolve(this._result).then(onFulfilled);
        },
    };
    const wrapped = wrapJsonBuilder(builder);

    // insert — object JSON column is serialized, other columns unchanged
    const insertResult = wrapped.insert({credentialParamsJSON: {function: 'hash'}, userId: 1});
    t.equal(insertResult, builder, 'insert returns the same builder for chaining');
    t.equal(captured[0].credentialParamsJSON, '{"function":"hash"}');
    t.equal(captured[0].userId, 1);

    // update — same serialization
    wrapped.update({credentialParamsJSON: {function: 'totp', digits: 6}});
    t.equal(captured[1].credentialParamsJSON, '{"function":"totp","digits":6}');

    // then — result rows have *JSON strings parsed back to objects
    (builder as unknown as {_result: unknown})._result = {
        credentialParamsJSON: '{"function":"hash","iterations":100000}',
        credentialSalt: 'salt',
    };
    const row = (await wrapped.then((value: unknown) => value)) as Record<string, unknown>;
    t.same(row.credentialParamsJSON, {function: 'hash', iterations: 100000});
    t.equal(row.credentialSalt, 'salt');
    t.end();
});

test('isDeadlock detects MySQL deadlock errors', t => {
    t.equal(isDeadlock({errno: 1213}), true, 'errno 1213');
    t.equal(isDeadlock({code: 'ER_LOCK_DEADLOCK'}), true, 'ER_LOCK_DEADLOCK code');
    t.equal(
        isDeadlock({errno: 1213, code: 'ER_LOCK_DEADLOCK', sql: 'UPDATE t SET x = 1'}),
        true,
        'deadlock with sql',
    );
    t.equal(isDeadlock({errno: 1062}), false, 'non-deadlock errno');
    t.equal(isDeadlock(new Error('boom')), false, 'plain error');
    t.equal(isDeadlock(null), false, 'null');
    t.equal(isDeadlock('ER_LOCK_DEADLOCK'), false, 'string');
    t.end();
});

test('wrapJsonBuilder reports deadlocks via onDeadlock and preserves rejection', async t => {
    const deadlock = {
        errno: 1213,
        code: 'ER_LOCK_DEADLOCK',
        sql: 'UPDATE `t` set `x` = 1',
        sqlMessage: 'Deadlock found when trying to get lock',
    };
    const reported: unknown[] = [];
    const builder = wrapJsonBuilder(makeRejectingBuilder(deadlock), {
        onDeadlock: error => reported.push(error),
    });

    await t.rejects(Promise.resolve(builder.then(null, null)), deadlock, 'query still rejects');
    t.same(reported, [deadlock], 'onDeadlock fired once with the error');
});

test('wrapJsonBuilder passes non-deadlock errors through without reporting', async t => {
    const boom = new Error('boom');
    const reported: unknown[] = [];
    const builder = wrapJsonBuilder(makeRejectingBuilder(boom), {
        onDeadlock: error => reported.push(error),
    });

    await t.rejects(Promise.resolve(builder.then(null, null)), /boom/, 'error still propagates');
    t.same(reported, [], 'onDeadlock not called');
});

test('wrapKnex raw() reports deadlocks via onDeadlock (stored-procedure / SQL calls)', async t => {
    const deadlock = {
        errno: 1213,
        code: 'ER_LOCK_DEADLOCK',
        sql: 'CALL `sql_deadlock`()',
        sqlMessage: 'Deadlock found when trying to get lock',
        message: 'Deadlock found when trying to get lock',
    };
    const reported: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeKnex = (() => undefined) as any;
    fakeKnex.raw = () => makeRejectingThenable(deadlock);
    const wrapped = wrapKnex(fakeKnex, {onDeadlock: error => reported.push(error)});

    const raw = wrapped.raw('CALL `sql_deadlock`()');
    await t.rejects(Promise.resolve(raw.then(null, null)), deadlock, 'raw query still rejects');
    t.same(reported, [deadlock], 'onDeadlock fired for the raw query');
    t.end();
});

test('wrapKnex transaction() wraps the trx so its queries report deadlocks (callback form)', async t => {
    const deadlock = {
        errno: 1213,
        code: 'ER_LOCK_DEADLOCK',
        sql: 'UPDATE `deadlock_demo` set `x` = 1',
        sqlMessage: 'Deadlock found when trying to get lock',
        message: 'Deadlock found when trying to get lock',
    };
    const reported: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeKnex = (() => undefined) as any;
    fakeKnex.transaction = (cb: (trx: unknown) => unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const trx = (() => makeRejectingBuilder(deadlock)) as any;
        return Promise.resolve(cb(trx));
    };
    const wrapped = wrapKnex(fakeKnex, {onDeadlock: error => reported.push(error)});

    await wrapped.transaction(async (trx: (...args: unknown[]) => unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder = trx('deadlock_demo') as any;
        await t.rejects(Promise.resolve(builder.then(null, null)), deadlock, 'trx query rejects');
    });
    t.same(reported, [deadlock], 'onDeadlock fired for a transaction query');
    t.end();
});

test('wrapKnex transaction() wraps the resolved trx (promise form)', async t => {
    const deadlock = {errno: 1213, code: 'ER_LOCK_DEADLOCK'};
    const reported: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeKnex = (() => undefined) as any;
    fakeKnex.transaction = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const trx = (() => makeRejectingBuilder(deadlock)) as any;
        return Promise.resolve(trx);
    };
    const wrapped = wrapKnex(fakeKnex, {onDeadlock: error => reported.push(error)});

    const trx = await wrapped.transaction();
    const builder = trx('deadlock_demo');
    await t.rejects(Promise.resolve(builder.then(null, null)), deadlock, 'trx query rejects');
    t.same(reported, [deadlock], 'onDeadlock fired for a promise-form transaction query');
    t.end();
});

const CONN_LOST = {
    code: 'PROTOCOL_CONNECTION_LOST',
    fatal: true,
    sql: 'UPDATE `t` SET `x` = 1',
    sqlMessage: 'Connection lost: The server closed the connection.',
    message: 'Connection lost: The server closed the connection.',
};

const DUP_ENTRY = {errno: 1062, code: 'ER_DUP_ENTRY', message: 'Duplicate entry'};

const BOOM = new Error('boom');

test('isRetryableConnectionError detects transient connection errors only', t => {
    t.equal(
        isRetryableConnectionError({code: 'PROTOCOL_CONNECTION_LOST', fatal: true}),
        true,
        'PROTOCOL_CONNECTION_LOST with fatal flag',
    );
    t.equal(isRetryableConnectionError({fatal: true}), true, 'fatal flag alone');
    t.equal(isRetryableConnectionError({code: 'ECONNRESET'}), true, 'ECONNRESET');
    t.equal(isRetryableConnectionError({code: 'ER_CON_COUNT_ERROR'}), true, 'too many connections');
    t.equal(
        isRetryableConnectionError({code: 'ER_LOCK_DEADLOCK', errno: 1213}),
        false,
        'deadlock is not a connection error',
    );
    t.equal(isRetryableConnectionError(DUP_ENTRY), false, 'constraint violation');
    t.equal(isRetryableConnectionError(BOOM), false, 'plain error');
    t.equal(isRetryableConnectionError(null), false, 'null');
    t.equal(isRetryableConnectionError('PROTOCOL_CONNECTION_LOST'), false, 'string');
    t.end();
});

test('withConnectionRetry runs once when retry is disabled (default)', async t => {
    let calls = 0;
    const run = async () => {
        calls += 1;
        throw CONN_LOST;
    };
    await t.rejects(withConnectionRetry(run, {}), CONN_LOST, 'error propagates');
    t.equal(calls, 1, 'exactly one attempt');
    t.end();
});

test('withConnectionRetry retries transient connection errors and recovers', async t => {
    let calls = 0;
    const run = async () => {
        calls += 1;
        if (calls < 3) throw CONN_LOST;
        return 'ok';
    };
    const result = await withConnectionRetry(run, {
        retry: {enabled: true, maxRetries: 3, backoffMs: 1},
    });
    t.equal(result, 'ok');
    t.equal(calls, 3, 'first attempt + two retries');
    t.end();
});

test('withConnectionRetry does not retry non-connection errors', async t => {
    let calls = 0;
    const run = async () => {
        calls += 1;
        throw DUP_ENTRY;
    };
    await t.rejects(
        withConnectionRetry(run, {retry: {enabled: true, maxRetries: 3, backoffMs: 1}}),
        DUP_ENTRY,
    );
    t.equal(calls, 1, 'constraint violations are not retried');
    t.end();
});

test('withConnectionRetry gives up after maxRetries and surfaces the error', async t => {
    let calls = 0;
    const run = async () => {
        calls += 1;
        throw CONN_LOST;
    };
    await t.rejects(
        withConnectionRetry(run, {retry: {enabled: true, maxRetries: 2, backoffMs: 1}}),
        CONN_LOST,
        'final error surfaces',
    );
    t.equal(calls, 3, 'first attempt + maxRetries retries');
    t.end();
});

test('wrapJsonBuilder recovers a transient connection error via clone re-execution', async t => {
    const builder = makeFlakyBuilder(2, CONN_LOST);
    const wrapped = wrapJsonBuilder(builder, {
        retry: {enabled: true, maxRetries: 5, backoffMs: 1},
    });

    const result = await wrapped.then((value: unknown) => value);
    t.same(result, {ok: 3}, 'query succeeds after two dropped connections');
    t.equal(builder.attempts(), 3, 'original + two clone re-executions');
    t.end();
});

test('wrapJsonBuilder reports connection errors via onConnectionError', async t => {
    const reported: unknown[] = [];
    const builder = makeFlakyBuilder(1, CONN_LOST);
    const wrapped = wrapJsonBuilder(builder, {
        retry: {enabled: true, maxRetries: 3, backoffMs: 1},
        onConnectionError: error => reported.push(error),
    });

    const result = await wrapped.then((value: unknown) => value);
    t.same(result, {ok: 2}, 'recovers');
    t.same(reported, [CONN_LOST], 'the dropped connection was reported');
    t.end();
});

test('wrapJsonBuilder does not retry when retry is disabled', async t => {
    const reported: unknown[] = [];
    const builder = makeFlakyBuilder(1, CONN_LOST);
    const wrapped = wrapJsonBuilder(builder, {
        onConnectionError: error => reported.push(error),
    });

    await t.rejects(Promise.resolve(wrapped.then(null, null)), CONN_LOST, 'error propagates');
    t.equal(builder.attempts(), 1, 'exactly one attempt');
    t.same(reported, [CONN_LOST], 'connection error still reported for diagnostics');
    t.end();
});

test('wrapJsonBuilder never retries non-connection errors', async t => {
    const builder = makeFlakyBuilder(1, BOOM);
    const wrapped = wrapJsonBuilder(builder, {
        retry: {enabled: true, maxRetries: 3, backoffMs: 1},
    });

    await t.rejects(Promise.resolve(wrapped.then(null, null)), /boom/, 'error propagates');
    t.equal(builder.attempts(), 1, 'plain errors are not retried');
    t.end();
});

test('wrapKnex raw() retries transient connection errors by re-invoking raw', async t => {
    let calls = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeKnex = (() => undefined) as any;
    fakeKnex.raw = () => {
        calls += 1;
        const ok = calls > 1;
        return {
            then(
                onFulfilled?: (value: unknown) => unknown,
                onRejected?: (reason: unknown) => unknown,
            ) {
                return ok
                    ? Promise.resolve({rows: [{n: calls}]}).then(onFulfilled, onRejected)
                    : Promise.reject(CONN_LOST).then(onFulfilled, onRejected);
            },
        };
    };
    const wrapped = wrapKnex(fakeKnex, {
        retry: {enabled: true, maxRetries: 3, backoffMs: 1},
    });

    const raw = wrapped.raw('CALL something()');
    const result = await Promise.resolve(raw.then((value: unknown) => value));
    t.same(result, {rows: [{n: 2}]}, 'raw re-invoked on retry');
    t.equal(calls, 2, 'knex.raw called twice');
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

/** A minimal thenable whose `then` rejects with `error`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRejectingThenable(error: unknown): any {
    return {
        then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
            return Promise.reject(error).then(onFulfilled, onRejected);
        },
    };
}

/**
 * A knex-like builder whose first `failures` `then` calls reject with `error`
 * and whose later calls resolve. `clone()` returns a fresh builder sharing the
 * same attempt counter, mirroring how the retry path re-runs a cloned builder.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFlakyBuilder(failures: number, error: unknown): any {
    let attempts = 0;
    const make = () => ({
        insert(..._args: unknown[]) {
            return this;
        },
        update(..._args: unknown[]) {
            return this;
        },
        then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
            attempts += 1;
            return attempts <= failures
                ? Promise.reject(error).then(onFulfilled, onRejected)
                : Promise.resolve({ok: attempts}).then(onFulfilled, onRejected);
        },
        clone() {
            return make();
        },
        attempts: () => attempts,
    });
    return make();
}
