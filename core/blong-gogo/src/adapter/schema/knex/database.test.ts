/**
 * Unit tests for the `ensureDatabase` helper (adapter/schema/knex/database.ts).
 *
 * `ensureDatabase` accepts an injectable `connect` factory, so these tests use
 * a fake admin connection and never touch a real MySQL server.
 */

import {test} from 'tap';

import {ensureDatabase, type IAdminConnection} from './database.ts';

interface IFakeState {
    calls: string[];
    rows?: Array<{SCHEMA_NAME: string}>;
    createError?: Error;
}

function fakeConnect(state: IFakeState): () => Promise<IAdminConnection> {
    return async () => {
        const admin: IAdminConnection = {
            async query<T>(sql: string): Promise<[T, unknown]> {
                state.calls.push(sql);
                if (sql.startsWith('SELECT SCHEMA_NAME')) {
                    return [(state.rows ?? []) as T, []];
                }
                if (state.createError) throw state.createError;
                return [undefined as T, []];
            },
            async end() {
                state.calls.push('end');
            },
        };
        return admin;
    };
}

test('ensureDatabase — returns early when no database is configured', async t => {
    const state: IFakeState = {calls: []};
    const result = await ensureDatabase({host: 'localhost'}, fakeConnect(state));
    t.same(result, {created: false, database: ''}, 'no-op result');
    t.equal(state.calls.length, 0, 'no connection made');
    t.end();
});

test('ensureDatabase — creates the database when missing', async t => {
    const state: IFakeState = {calls: [], rows: []};
    const result = await ensureDatabase({database: 'blong-kalin'}, fakeConnect(state));
    t.equal(result.created, true, 'database was created');
    t.equal(result.database, 'blong-kalin', 'reports the database name');
    t.ok(
        state.calls.some(c => c.startsWith('CREATE DATABASE')),
        'CREATE DATABASE issued',
    );
    t.equal(state.calls[state.calls.length - 1], 'end', 'admin connection closed');
    t.end();
});

test('ensureDatabase — skips creation when the database exists', async t => {
    const state: IFakeState = {calls: [], rows: [{SCHEMA_NAME: 'blong-kalin'}]};
    const result = await ensureDatabase({database: 'blong-kalin'}, fakeConnect(state));
    t.equal(result.created, false, 'database already exists');
    t.ok(
        !state.calls.some(c => c.startsWith('CREATE DATABASE')),
        'no CREATE DATABASE issued',
    );
    t.equal(state.calls[state.calls.length - 1], 'end', 'admin connection closed');
    t.end();
});

test('ensureDatabase — rejects when CREATE DATABASE fails but still closes the connection', async t => {
    const state: IFakeState = {
        calls: [],
        rows: [],
        createError: new Error('access denied'),
    };
    await t.rejects(ensureDatabase({database: 'blong-kalin'}, fakeConnect(state)), /access denied/);
    t.equal(state.calls[state.calls.length - 1], 'end', 'admin connection closed on failure');
    t.end();
});

test('ensureDatabase — escapes backticks in the database name', async t => {
    const state: IFakeState = {calls: [], rows: []};
    await ensureDatabase({database: 'weird`db'}, fakeConnect(state));
    const createSql = state.calls.find(c => c.startsWith('CREATE DATABASE'));
    t.ok(createSql?.includes('`weird``db`'), 'backtick doubled in identifier');
    t.end();
});
