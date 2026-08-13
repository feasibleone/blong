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
    parseJsonResult,
    parseJsonRow,
    stringifyJsonValues,
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
