/**
 * Unit tests for the column-type mapping in utils.ts.
 *
 * The branch that matters here is the declared `maxLength` of a string column:
 * up to 255 it is a `VARCHAR`, above that a MySQL `TEXT`, and above 65 535 a
 * `LONGTEXT` — the last one because a screenshot stored as a data URL does not
 * fit a `TEXT` and would be truncated silently (`@@D-661`).
 */

import {test} from 'tap';

import {addColumn} from './utils.ts';

/** Record what the schema builder was asked for, and stay chainable. */
function fakeTable() {
    const calls: Array<{method: string; args: unknown[]}> = [];
    const column = {
        nullable: () => column,
        notNullable: () => column,
        primary: () => column,
        unsigned: () => column,
        defaultTo: () => column,
    };
    const builder = new Proxy(
        {},
        {
            get:
                (_target, method: string) =>
                (...args: unknown[]) => {
                    calls.push({method, args});
                    return column;
                },
        },
    );
    return {builder, calls};
}

test('a short string stays a VARCHAR of its declared length', t => {
    const {builder, calls} = fakeTable();
    addColumn(builder as never, 'pageTitle', {type: 'string', maxLength: 255}, false);
    t.same(calls, [{method: 'string', args: ['pageTitle', 255]}]);
    t.end();
});

test('a string above 255 becomes TEXT', t => {
    const {builder, calls} = fakeTable();
    addColumn(builder as never, 'pageUrl', {type: 'string', maxLength: 1000}, false);
    t.same(calls, [{method: 'text', args: ['pageUrl']}]);
    t.end();
});

test('a string above 65 535 becomes LONGTEXT', t => {
    const {builder, calls} = fakeTable();
    addColumn(builder as never, 'shotData', {type: 'string', maxLength: 8000000}, false);
    t.same(calls, [{method: 'text', args: ['shotData', 'longtext']}]);
    t.end();
});

test('a declared length of exactly 65 535 stays TEXT', t => {
    const {builder, calls} = fakeTable();
    addColumn(builder as never, 'bodyText', {type: 'string', maxLength: 65535}, false);
    t.same(calls, [{method: 'text', args: ['bodyText']}]);
    t.end();
});
