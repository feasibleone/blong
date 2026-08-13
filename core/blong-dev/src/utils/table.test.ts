/**
 * Unit tests for the deterministic table renderer (utils/table.ts).
 */

import {test} from 'tap';

import {cellText, formatTable} from './table.ts';

test('cellText formats SQL-ish values', t => {
    t.equal(cellText(null), 'NULL', 'null → NULL');
    t.equal(cellText(undefined), 'NULL', 'undefined → NULL');
    t.equal(cellText(42), '42', 'number');
    t.equal(cellText(true), 'true', 'boolean');
    t.equal(cellText(10n), '10', 'bigint');
    t.equal(cellText('hello'), 'hello', 'string');
    t.equal(
        cellText(new Date('2024-01-02T03:04:05.000Z')),
        '2024-01-02T03:04:05.000Z',
        'Date → ISO',
    );
    t.equal(cellText({a: 1}), '{"a":1}', 'object → JSON');
    t.equal(cellText([1, 2]), '[1,2]', 'array → JSON');
    const buf = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    t.equal(cellText(buf), '0xdeadbeef', 'Uint8Array → hex');
    t.end();
});

test('formatTable renders headers, separator and aligned rows', t => {
    const rows = [
        {id: 1, name: 'alice'},
        {id: 2, name: 'bob'},
    ];
    const table = formatTable(rows, {name: 'users'});
    t.match(table, /^users\n/, 'table name on first line');
    t.match(table, /id\s+name/, 'header present');
    t.match(table, /-+\s+-+/, 'separator present');
    t.match(table, /1\s+alice/, 'first row');
    t.match(table, /2\s+bob/, 'second row');
    const lines = table.split('\n');
    t.equal(lines[0], 'users', 'name line');
    t.end();
});

test('formatTable truncates over-long cells with an ellipsis', t => {
    const long = 'x'.repeat(100);
    const table = formatTable([{a: long}], {maxColWidth: 10});
    t.match(table, /x{1,9}…/, 'long value truncated with ellipsis');
    t.ok(!table.includes('x'.repeat(20)), 'no untruncated long value');
    t.end();
});

test('formatTable drops overflowing right-most columns', t => {
    const rows = [{alpha: 'a', beta: 'b', gamma: 'c'}];
    const table = formatTable(rows, {maxWidth: 12, maxColWidth: 10});
    // Only the first column(s) fit within maxWidth 12.
    t.ok(table.includes('alpha'), 'first column kept');
    t.ok(!table.includes('gamma'), 'overflowing column dropped');
    t.end();
});

test('formatTable handles empty rows', t => {
    t.equal(formatTable([]), '(no rows)', 'empty table');
    t.equal(formatTable([], {name: 't'}), 't\n(no rows)', 'empty table with name');
    t.end();
});

test('formatTable applies header color when provided', t => {
    const rows = [{a: 1}];
    const table = formatTable(rows, {headerColor: text => `[${text}]`});
    t.match(table, /\[a\]/, 'header wrapped by color fn');
    t.end();
});
