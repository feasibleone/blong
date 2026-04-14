import {test} from 'tap';

import {affectedNamespaces} from './Watch.ts';

// ---------------------------------------------------------------------------
// affectedNamespaces
// ---------------------------------------------------------------------------

test('affectedNamespaces — exact key match', async t => {
    const diff = new Map([['payment.adapter.db', {prev: 1, next: 2}]]);
    const ports = ['payment.adapter.db', 'user.adapter.db'];
    const affected = affectedNamespaces(diff, ports);
    t.ok(affected.has('payment.adapter.db'), 'exact match detected');
    t.notOk(affected.has('user.adapter.db'), 'unrelated port excluded');
});

test('affectedNamespaces — prefix match', async t => {
    const diff = new Map([['payment.adapter.db.host', {prev: 'a', next: 'b'}]]);
    const ports = ['payment.adapter.db', 'user.adapter.db'];
    const affected = affectedNamespaces(diff, ports);
    t.ok(affected.has('payment.adapter.db'), 'prefix match detected');
    t.notOk(affected.has('user.adapter.db'), 'unrelated port excluded');
});

test('affectedNamespaces — no match returns empty set', async t => {
    const diff = new Map([['unrelated.key', {prev: 1, next: 2}]]);
    const ports = ['payment.adapter.db'];
    const affected = affectedNamespaces(diff, ports);
    t.equal(affected.size, 0, 'no affected ports');
});

test('affectedNamespaces — multiple ports can be affected', async t => {
    const diff = new Map([
        ['payment.adapter.db.host', {prev: 'old', next: 'new'}],
        ['user.adapter.db.port', {prev: 3306, next: 5432}],
    ]);
    const ports = ['payment.adapter.db', 'user.adapter.db', 'audit.adapter.kafka'];
    const affected = affectedNamespaces(diff, ports);
    t.equal(affected.size, 2, 'two ports affected');
    t.ok(affected.has('payment.adapter.db'));
    t.ok(affected.has('user.adapter.db'));
    t.notOk(affected.has('audit.adapter.kafka'));
});

test('affectedNamespaces — partial name prefix does not match', async t => {
    // 'payment.adapter.db2' should NOT match port 'payment.adapter.db'
    const diff = new Map([['payment.adapter.db2.host', {prev: 'a', next: 'b'}]]);
    const ports = ['payment.adapter.db'];
    const affected = affectedNamespaces(diff, ports);
    t.equal(affected.size, 0, 'partial-name prefix should not match');
});
