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
    parseJsonResult,
    parseJsonRow,
    stringifyJsonValues,
    wrapJsonBuilder,
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
        parseJsonResult([
            {credentialParamsJSON: '{"a":1}'},
            {credentialParamsJSON: '{"b":2}'},
        ]),
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
