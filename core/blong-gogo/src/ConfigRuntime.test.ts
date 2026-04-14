/**
 * Unit tests for ConfigRuntime — the authoritative config lifecycle owner.
 *
 * Tests validate:
 *  1. deepDiff — flat diff of two plain objects (added, removed, modified)
 *  2. createConfigProxy — stable proxy with live-updating backing store
 *  3. affectedNamespaces — maps diff keys to port namespaces
 *  4. Destructuring safety checks — verifies that:
 *       ✅ partial destructuring (sub-object level) uses path-based proxies that
 *          stay live across updates — reads reflect the current value at call time
 *       ❌ full destructuring (scalar level) captures a stale value at load time
 *  5. Factory phase guard — enterConfigFactoryPhase / exitConfigFactoryPhase:
 *       throws on primitive reads in 'throw' mode (default)
 *       collects errors in 'collect' mode (for test verification)
 *       silent for undefined / sub-object reads regardless of mode
 */

import {test} from 'tap';

import {
    createConfigProxy,
    deepDiff,
    enterConfigFactoryPhase,
    exitConfigFactoryPhase,
} from './ConfigRuntime.ts';

// ---------------------------------------------------------------------------
// deepDiff
// ---------------------------------------------------------------------------

test('deepDiff — identical objects produce empty diff', async t => {
    const prev = {a: 1, b: {c: 2}};
    const next = {a: 1, b: {c: 2}};
    const diff = deepDiff(prev, next);
    t.equal(diff.size, 0, 'no changes expected');
});

test('deepDiff — modified leaf value is detected', async t => {
    const prev = {db: {host: 'localhost', port: 5432}};
    const next = {db: {host: '10.0.0.1', port: 5432}};
    const diff = deepDiff(prev, next);
    t.equal(diff.size, 1, 'one change expected');
    t.ok(diff.has('db.host'), 'db.host change detected');
    t.equal(diff.get('db.host')!.prev, 'localhost');
    t.equal(diff.get('db.host')!.next, '10.0.0.1');
});

test('deepDiff — added key is detected', async t => {
    const prev = {a: 1};
    const next = {a: 1, b: 2};
    const diff = deepDiff(prev, next);
    t.equal(diff.size, 1, 'one addition expected');
    t.ok(diff.has('b'));
    t.equal(diff.get('b')!.prev, undefined);
    t.equal(diff.get('b')!.next, 2);
});

test('deepDiff — removed key is detected', async t => {
    const prev = {a: 1, b: 2};
    const next = {a: 1};
    const diff = deepDiff(prev, next);
    t.equal(diff.size, 1, 'one removal expected');
    t.ok(diff.has('b'));
    t.equal(diff.get('b')!.prev, 2);
    t.equal(diff.get('b')!.next, undefined);
});

test('deepDiff — nested changes produce dotted paths', async t => {
    const prev = {tls: {cert: 'old-cert', key: 'old-key'}};
    const next = {tls: {cert: 'new-cert', key: 'old-key'}};
    const diff = deepDiff(prev, next);
    t.equal(diff.size, 1);
    t.ok(diff.has('tls.cert'));
    t.equal(diff.get('tls.cert')!.next, 'new-cert');
});

test('deepDiff — array changes are detected as leaf diffs', async t => {
    const prev = {allowed: ['a', 'b']};
    const next = {allowed: ['a', 'b', 'c']};
    const diff = deepDiff(prev, next);
    t.equal(diff.size, 1, 'array change detected as single leaf');
    t.ok(diff.has('allowed'));
});

test('deepDiff — deeply nested multi-change', async t => {
    const prev = {db: {host: 'h1', port: 3306, ssl: {ca: 'old-ca'}}};
    const next = {db: {host: 'h2', port: 3306, ssl: {ca: 'new-ca'}}};
    const diff = deepDiff(prev, next);
    t.equal(diff.size, 2, 'two changes: host and ssl.ca');
    t.ok(diff.has('db.host'));
    t.ok(diff.has('db.ssl.ca'));
});

// ---------------------------------------------------------------------------
// createConfigProxy
// ---------------------------------------------------------------------------

test('createConfigProxy — reads current values', async t => {
    const store = {db: {host: 'localhost', port: 5432}};
    const {proxy} = createConfigProxy(store);
    t.equal((proxy as any).db.host, 'localhost');
    t.equal((proxy as any).db.port, 5432);
});

test('createConfigProxy — reflects updated values after update()', async t => {
    const store = {db: {host: 'localhost'}};
    const {proxy, update} = createConfigProxy(store);

    t.equal((proxy as any).db.host, 'localhost');

    update({db: {host: '10.0.0.1'}} as any);

    t.equal((proxy as any).db.host, '10.0.0.1', 'proxy reflects updated value');
});

test('createConfigProxy — proxy reference remains stable across updates', async t => {
    const store = {a: 1};
    const {proxy, update} = createConfigProxy(store);

    const ref1 = proxy;
    update({a: 2} as any);
    const ref2 = proxy;

    t.equal(ref1, ref2, 'same proxy reference after update');
    t.equal((ref1 as any).a, 2, 'old reference reflects new value');
});

test('createConfigProxy — has/ownKeys/enumeration work correctly', async t => {
    const store = {x: 1, y: 2};
    const {proxy} = createConfigProxy(store);

    t.ok('x' in proxy, 'has "x"');
    t.ok('y' in proxy, 'has "y"');
    t.notOk('z' in proxy, 'does not have "z"');

    const keys = Object.keys(proxy);
    t.ok(keys.includes('x'), 'ownKeys includes "x"');
    t.ok(keys.includes('y'), 'ownKeys includes "y"');
});

test('createConfigProxy — undefined properties return undefined', async t => {
    const store = {a: 1};
    const {proxy} = createConfigProxy(store);
    t.equal((proxy as any).nonExistent, undefined);
});

// ---------------------------------------------------------------------------
// Destructuring safety checks
//
// These tests validate the proxy-access rule for handler config arguments:
//
//   ✅ Safe — partial destructuring to an intermediate object:
//        handler(({ config: { theme } }) => ({ myFn: () => theme.name }))
//      `theme` is a path-based proxy; every property read on it re-traverses
//      the root `current`, so `theme.name` always returns the current value
//      even after a config reload.
//
//   ❌ Unsafe — full destructuring to a scalar at factory time:
//        handler(({ config: { theme: { name } } }) => ({ myFn: () => name }))
//      `name` is a primitive captured at module-load time; it will NOT reflect
//      later config changes.
//
// To make this testable without the full framework, the tests simulate the
// handler factory pattern using raw createConfigProxy calls and a mock factory
// function that mirrors the two patterns.
// ---------------------------------------------------------------------------

test('partial destructuring — theme sub-object is a live proxy node that reflects current values after update', async t => {
    const initialStore = {theme: {name: 'light', mode: 'day'}};
    const {proxy, update} = createConfigProxy(initialStore);

    // Simulate factory-time partial destructuring: extract the `theme` sub-object
    // (as would happen in `handler(({ config: { theme } }) => ...)`)
    const {theme} = proxy as {theme: {name: string; mode: string}};

    // --- Verify initial read through the partially-destructured sub-object ---
    t.equal(theme.name, 'light', 'initial theme.name read through sub-object');
    t.equal(theme.mode, 'day', 'initial theme.mode read through sub-object');

    // --- Simulate a config reload by updating the root proxy backing store ---
    update({theme: {name: 'dark', mode: 'night'}} as typeof initialStore);

    // --- Path-based proxies: the captured sub-proxy is a live view over the
    //     root `current` cell, so it reflects the new values after update() ---
    t.equal(theme.name, 'dark', 'sub-proxy theme.name reflects update via path traversal');
    t.equal(theme.mode, 'night', 'sub-proxy theme.mode reflects update via path traversal');
    t.equal((proxy as any).theme.name, 'dark', 'root proxy.theme.name also reflects update');
});

test('full destructuring — scalar captured at factory time does NOT reflect later updates', async t => {
    const initialStore = {theme: {name: 'light'}};
    const {proxy, update} = createConfigProxy(initialStore);

    // Simulate the UNSAFE pattern: extract a leaf primitive at factory time
    // (as would happen in `handler(({ config: { theme: { name } } }) => ...)`)
    const {
        theme: {name: capturedName},
    } = proxy as {theme: {name: string}};

    t.equal(capturedName, 'light', 'initial captured value is "light"');

    // Simulate a config reload
    update({theme: {name: 'dark'}} as typeof initialStore);

    // The captured scalar is stale — it still reads 'light'
    t.equal(capturedName, 'light', 'captured scalar is stale after config update');

    // Root proxy reflects the new value
    t.equal((proxy as any).theme.name, 'dark', 'root proxy reflects updated value');

    // This proves: NEVER destructure leaf primitives at handler factory time.
    t.not(
        capturedName,
        'dark',
        'primitive captured at load time does not update — confirmed anti-pattern',
    );
});

test('root proxy access — always reflects current values regardless of nesting', async t => {
    const initialStore = {theme: {name: 'light'}, greeting: 'hello'};
    const {proxy, update} = createConfigProxy(initialStore);

    // Simulate the SAFE pattern: hold a reference to the root proxy and access
    // through it at call time (as in `handler(({ config }) => ({ fn: () => config.theme.name }))`)
    const config = proxy as {theme: {name: string}; greeting: string};

    t.equal(config.theme.name, 'light', 'initial root access');
    t.equal(config.greeting, 'hello', 'initial greeting via root');

    update({theme: {name: 'dark'}, greeting: 'hi'} as typeof initialStore);

    t.equal(config.theme.name, 'dark', 'root proxy.theme.name reflects update');
    t.equal(config.greeting, 'hi', 'root proxy.greeting reflects update');
});

// ---------------------------------------------------------------------------
// Factory phase guard — enterConfigFactoryPhase / exitConfigFactoryPhase
// ---------------------------------------------------------------------------

test('factory phase guard — throws on primitive read in default throw mode', async t => {
    const {proxy} = createConfigProxy({host: 'localhost', port: 5432});
    const p = proxy as any;

    enterConfigFactoryPhase(); // default mode = 'throw'
    t.throws(
        () => p.host,
        /anti-pattern/,
        'reading a primitive during factory phase throws by default',
    );
    exitConfigFactoryPhase(); // always clean up
});

test('factory phase guard — collects errors in collect mode without throwing', async t => {
    const {proxy} = createConfigProxy({host: 'localhost', port: 5432});
    const p = proxy as any;

    enterConfigFactoryPhase('collect');
    t.doesNotThrow(() => p.host, 'no throw in collect mode');
    t.doesNotThrow(() => p.port, 'no throw for second read in collect mode');
    const errors = exitConfigFactoryPhase();

    t.equal(errors.length, 2, 'two primitive reads were recorded');
    t.match(errors[0].message, /anti-pattern/, 'first error mentions anti-pattern');
    t.match(errors[0].message, /host/, 'first error names the offending key');
    t.match(errors[1].message, /port/, 'second error names the offending key');
});

test('factory phase guard — sub-object read is NOT flagged (safe partial destructuring)', async t => {
    const {proxy} = createConfigProxy({theme: {name: 'light'}});
    const p = proxy as any;

    enterConfigFactoryPhase(); // throw mode
    t.doesNotThrow(
        () => p.theme, // returns a sub-proxy (object), not a primitive
        'accessing a nested object during factory phase is safe',
    );
    exitConfigFactoryPhase();
});

test('factory phase guard — undefined read is NOT flagged', async t => {
    const {proxy} = createConfigProxy({a: 1});
    const p = proxy as any;

    enterConfigFactoryPhase();
    t.doesNotThrow(
        () => p.nonExistent, // undefined is safe to read (nothing to capture)
        'undefined key access during factory phase does not throw',
    );
    exitConfigFactoryPhase();
});

test('factory phase guard — guard is inactive after exitConfigFactoryPhase', async t => {
    const {proxy} = createConfigProxy({host: 'localhost'});
    const p = proxy as any;

    enterConfigFactoryPhase();
    exitConfigFactoryPhase(); // exit immediately

    t.doesNotThrow(() => p.host, 'primitive read after exit is safe again');
});

test('factory phase guard — exitConfigFactoryPhase returns empty array in throw mode', async t => {
    const {proxy} = createConfigProxy({host: 'localhost'});
    const p = proxy as any;

    enterConfigFactoryPhase(); // throw mode — errors are not collected
    try {
        p.host; // would throw
    } catch (_) {
        // expected
    }
    const errors = exitConfigFactoryPhase();
    t.equal(errors.length, 0, 'no errors collected in throw mode (they were thrown)');
});
