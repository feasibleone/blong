import {test} from 'tap';

import type {ConfigDiff} from '@feasibleone/blong/types';

import {
    affectedNamespaces,
    applyConfigReload,
    type IReloadablePort,
    type IReloadRegistry,
} from './Watch.ts';

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

// ---------------------------------------------------------------------------
// applyConfigReload — what a reload does to the ports it affects
// ---------------------------------------------------------------------------

interface FakePort extends IReloadablePort {
    /** Every lifecycle call, in order — the assertion surface. */
    calls: string[];
    /** The arguments `configChanged` was handed, once per call. */
    changed: Array<{diff: ConfigDiff; next: unknown; prev: unknown}>;
}

function fakePort(id: string, options: {configChanged?: boolean; throws?: boolean} = {}): FakePort {
    const calls: string[] = [];
    const changed: FakePort['changed'] = [];
    const port: FakePort = {
        calls,
        changed,
        async stop() {
            calls.push('stop');
        },
        async start() {
            calls.push('start');
        },
        async ready() {
            calls.push('ready');
        },
    };
    if (options.configChanged !== false) {
        port.configChanged = async (diff, next, prev) => {
            calls.push('configChanged');
            changed.push({diff, next, prev});
            if (options.throws) throw new Error(`${id}: reload failed`);
        };
    }
    return port;
}

function fakeRegistry(ports: Record<string, FakePort>): IReloadRegistry {
    return {
        ports: {keys: () => Object.keys(ports)},
        async getPort(id) {
            return ports[id];
        },
        async createPort(id) {
            return ports[id];
        },
    };
}

const reloadDiff: ConfigDiff = new Map([['payment.adapter.db.host', {prev: 'a', next: 'b'}]]);

test('applyConfigReload — the affected port is asked to reconfigure itself', async t => {
    const port = fakePort('payment.adapter.db');
    const registry = fakeRegistry({'payment.adapter.db': port});
    const next = {payment: {adapter: {db: {host: 'b'}}}};

    const reloaded = await applyConfigReload(
        registry,
        affectedNamespaces(reloadDiff, registry.ports.keys()),
        reloadDiff,
        next,
        {payment: {adapter: {db: {host: 'a'}}}},
        {},
    );

    t.equal(reloaded, 1, 'one port reached');
    t.equal(port.calls.join(','), 'configChanged', 'and reconfigured, not restarted');
    t.equal(port.changed.length, 1, 'configChanged called once');
    t.equal(port.changed[0]?.diff, reloadDiff, 'handed the diff');
    t.equal(port.changed[0]?.next, next, 'and the new effective config');
    t.end();
});

test('applyConfigReload — an unrelated key leaves a port running', async t => {
    const affectedPort = fakePort('payment.adapter.db');
    const untouched = fakePort('audit.adapter.kafka');
    const registry = fakeRegistry({
        'payment.adapter.db': affectedPort,
        'audit.adapter.kafka': untouched,
    });

    const reloaded = await applyConfigReload(
        registry,
        affectedNamespaces(reloadDiff, registry.ports.keys()),
        reloadDiff,
        {payment: {adapter: {db: {host: 'b'}}}},
        {},
        {},
    );

    t.equal(reloaded, 1, 'only the affected port was reached');
    t.equal(untouched.calls.length, 0, 'the unrelated port was not stopped or started');
    t.end();
});

test('applyConfigReload — a port without configChanged is stopped and started again', async t => {
    const port = fakePort('payment.adapter.db', {configChanged: false});
    const registry = fakeRegistry({'payment.adapter.db': port});
    const override = {marker: true};

    await applyConfigReload(
        registry,
        affectedNamespaces(reloadDiff, registry.ports.keys()),
        reloadDiff,
        {},
        {},
        override,
    );

    t.equal(port.calls.join(','), 'stop,start,ready', 'the fallback restarts the port in order');
    t.end();
});

test('applyConfigReload — a failing port does not stop the ones behind it', async t => {
    const failing = fakePort('payment.adapter.db', {throws: true});
    const healthy = fakePort('user.adapter.db');
    const registry = fakeRegistry({
        'payment.adapter.db': failing,
        'user.adapter.db': healthy,
    });
    const diff: ConfigDiff = new Map([
        ['payment.adapter.db.host', {prev: 'a', next: 'b'}],
        ['user.adapter.db.host', {prev: 'a', next: 'b'}],
    ]);
    const errors: unknown[] = [];

    const reloaded = await applyConfigReload(
        registry,
        affectedNamespaces(diff, registry.ports.keys()),
        diff,
        {},
        {},
        {},
        error => errors.push(error),
    );

    t.equal(reloaded, 2, 'both ports were reached');
    t.equal(healthy.calls.join(','), 'configChanged', 'the second port still reloaded');
    t.equal(errors.length, 1, 'the failure was reported');
    t.end();
});
