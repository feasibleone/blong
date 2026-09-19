import * as cacache from 'cacache';
import {appendFileSync, existsSync, readFileSync, statSync} from 'node:fs';
import {mkdtemp, mkdir, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {cachePaths, cacheRecordIds, openCache} from './cache.ts';
import type {LogRecord} from './record.ts';

function record(id: string, time: number): LogRecord {
    return {id, time, level: 30, levelName: 'info', msg: `m-${id}`, service: 's', refs: {record: id}};
}

function ids(from: number, to: number): string[] {
    return Array.from({length: to - from}, (_value, index) => `01${(from + index).toString().padStart(2, '0')}`);
}

async function tempDir(): Promise<string> {
    return mkdtemp(join(tmpdir(), 'semantic-log-cache-'));
}

/** The store's own index, as the module's own enumeration would see it. */
async function storedIds(dir: string): Promise<string[]> {
    return (await cacheRecordIds(dir)).sort();
}

t.test('a stored record is retrievable by id', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await cache.put(record('01A', 1));
    t.equal((await cache.get('01A'))?.msg, 'm-01A');
    t.equal(await cache.get('missing'), undefined);
    // An id that could never name an entry is a miss, not an exception: `get`
    // must never fail a lookup, whatever it is handed.
    t.equal(await cache.get('../escape'), undefined);
    t.equal(await cache.get(''), undefined);
    t.same(cache.stats(), {size: 1, dropped: 0});
    await cache.close();
});

t.test('lookup reads one entry, not the store (PRD R21 acceptance)', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));

    // Intercept the index read so an enumeration on the lookup path is
    // observable. Only the cache's own instance is mocked; the assertion below
    // controls for the interception being live.
    const real = await import('cacache');
    const scans: string[] = [];
    const spied = {
        ...real,
        ls: (...args: unknown[]): Promise<unknown> => {
            scans.push('ls');
            return (real.ls as (...rest: unknown[]) => Promise<unknown>)(...args);
        },
    };
    const {openCache: openSpied} = await t.mockImport<typeof import('./cache.ts')>('./cache.ts', {
        cacache: spied,
    });
    const cache = await openSpied({dir, limit: 10});
    await cache.put(record('01A', 1));

    // Opening adopts the counts, which is an index read — that is the control.
    const afterOpen = scans.length;
    t.ok(afterOpen > 0, 'the open consulted the index');

    t.equal((await cache.get('01A'))?.msg, 'm-01A');
    t.equal(await cache.get('missing'), undefined);
    t.equal(scans.length, afterOpen, 'no enumeration happened on the lookup path');
    await cache.close();
});

t.test('the cache is bounded and prunes the oldest records', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 5});
    for (let i = 0; i < 12; i++) {
        await cache.put(record(`01${i.toString().padStart(2, '0')}`, i));
    }
    t.same(await storedIds(dir), ids(7, 12), 'the store holds exactly the bound, newest last');
    t.equal(await cache.get('0100'), undefined, 'oldest pruned');
    t.ok(await cache.get('0111'), 'newest retained');
    t.same(cache.stats(), {size: 5, dropped: 7}, 'the accounting matches the pruning');
    // Publishing the marker must not leave a temporary sibling behind.
    t.equal(
        (await readdir(dir)).filter(name => name.endsWith('.tmp')).length,
        0,
        'no temporary file is left over',
    );
    await cache.close();
});

t.test('concurrent writes stay bounded', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await Promise.all(ids(0, 25).map((id, index) => cache.put(record(id, index))));
    t.ok((await storedIds(dir)).length <= 10, 'a concurrent burst is still bounded');
    t.equal(cache.stats().dropped, 15, 'exactly the overflow was pruned');
    t.equal(await cache.get('0100'), undefined, 'the oldest went first');
    t.ok(await cache.get('0124'), 'the newest survived the burst');
    await cache.close();
});

t.test('a record survives process exit, because it is on disk', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const first = await openCache({dir, limit: 10});
    await first.put(record('01Z', 9));
    await first.close();
    const second = await openCache({dir, limit: 10});
    t.equal((await second.get('01Z'))?.msg, 'm-01Z');
    t.equal(second.stats().size, 1, 'the store was read back');
    await second.close();
});

t.test('putSync retains a record before it returns, with no flush of any kind', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    cache.putSync(record('01S', 7));
    // Every read below is synchronous, with no `await` in between: only a write
    // that completed inside `putSync` can have landed the line this early. A
    // queued asynchronous `put` would still be pending, because the event loop
    // has not turned. This is the property `fatal` depends on — `process.exit`
    // drains no pending I/O — so it is asserted without any flush.
    const raw = readFileSync(cachePaths.sidecarFile(dir), 'utf8');
    const staged = JSON.parse(raw.trim()) as {id: string; json: string};
    t.equal(
        (JSON.parse(staged.json) as LogRecord).msg,
        'm-01S',
        'the sidecar line is there the moment putSync returns',
    );
    t.equal((await cache.get('01S'))?.id, '01S', 'the lookup path resolves it');
    await cache.close();
});

t.test('a synchronous write is bounded and pruned like the asynchronous one', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 2});
    for (const id of ['01A', '01B', '01C']) {
        cache.putSync(record(id, 1));
    }
    // A synchronous write is staged in the sidecar — the one surface it can reach
    // without waiting on the event loop — and that surface is bounded to the same
    // limit and drops the oldest first, exactly as the store does. `stats()`
    // counts the store, so it is deliberately not what this asserts.
    const lines = readFileSync(cachePaths.sidecarFile(dir), 'utf8').trim().split('\n');
    t.equal(lines.length, 2, 'the staging surface is bounded to the same limit');
    t.equal(await cache.get('01A'), undefined, 'the oldest went first');
    t.equal((await cache.get('01C'))?.id, '01C', 'the newest is retained');
    t.equal(
        (await readdir(dir)).filter(name => name.endsWith('.tmp')).length,
        0,
        'no temporary file is left over',
    );
    await cache.close();
});

t.test('the synchronous write never throws, however it fails', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    // An id that could never name an entry is refused, not thrown: this call runs
    // on the `fatal` path, where a throw would abort the process the record
    // exists to report. The asynchronous path reports the same refusal as a
    // rejection, because it promised a promise.
    t.doesNotThrow(() => cache.putSync(record('../escape', 1)));
    await t.rejects(cache.put(record('../escape', 1)), /unsafe record id/);
    // An unwritable destination is swallowed exactly as a rejected `put` is. The
    // directory is replaced by a plain file, so the staging append has nowhere to
    // go, and put back afterwards so the teardown is an ordinary one.
    await rm(dir, {recursive: true, force: true});
    await writeFile(dir, 'not a directory');
    t.doesNotThrow(() => cache.putSync(record('01P', 1)));
    await rm(dir, {force: true});
    await mkdir(dir, {recursive: true});
    await cache.close();
});

t.test('a torn sidecar line is skipped instead of breaking the cache', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const first = await openCache({dir, limit: 10});
    first.putSync(record('01A', 1));
    first.putSync(record('01B', 2));
    await first.close();
    // A crash between the append and its flush leaves a partial line; a blank
    // line is skipped too.
    appendFileSync(cachePaths.sidecarFile(dir), '\n{"id":"01TORN"\n');

    const second = await openCache({dir, limit: 10});
    t.equal((await second.get('01A'))?.msg, 'm-01A', 'the records around it survive');
    t.equal(await second.get('01TORN'), undefined, 'the torn line is not a record');
    t.equal(second.stats().size, 2, 'exactly the two real entries were replayed');
    t.notOk(existsSync(cachePaths.sidecarFile(dir)), 'the replay removed the sidecar');
    await second.close();
});

t.test('cacheRecordIds reports the store, and tolerates a missing directory', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await cache.put(record('01A', 1));
    await cache.putPayload('01P', 1, '{}');
    // The payload and the sweep marker are not records, and this is the one
    // enumeration the module allows.
    t.same(await cacheRecordIds(dir), ['01A']);
    await cache.close();
    t.same(await cacheRecordIds(join(dir, 'absent')), [], 'a missing directory holds no records');
});

t.test('openCache refuses a cache it could not bound', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    await t.rejects(openCache({dir: '', limit: 10}), /a cache directory is required/);
    await t.rejects(openCache({dir, limit: 0}), /limit must be a positive integer/);
    await t.rejects(openCache({dir, limit: 1.5}), /limit must be a positive integer/);
});

t.test('the canonical paths are the ones the cache actually uses', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    cache.putSync(record('01A', 1));
    t.ok(statSync(cachePaths.sidecarFile(dir)).isFile(), 'the reported sidecar is the one written');
    // The marker is reported because a caller may have to write or reason about
    // it; this asserts the reported key is the one the store really holds.
    t.ok(cachePaths.marker in (await cacache.ls(dir)), 'the reported marker key is the one stored');
    await cache.close();
});

t.test('putPayloadSync retains a payload before it returns, with no flush of any kind', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const json = JSON.stringify({hello: 'world'});
    cache.putPayloadSync('01P', 7, json);
    // Read synchronously, as the `putSync` test does: a fatal's inline payload
    // reference must resolve after the exit that drains no pending I/O.
    const lines = readFileSync(cachePaths.sidecarFile(dir), 'utf8').trim().split('\n');
    t.equal((JSON.parse(lines[0] ?? '{}') as {json?: string}).json, json, 'the payload is staged the moment it returns');
    t.same(await cache.getPayload('01P'), {hello: 'world'}, 'the lookup path resolves it');
    await cache.close();
});

t.test('the synchronous payload write never throws, however it fails', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    t.doesNotThrow(() => cache.putPayloadSync('../escape', 1, '{}'));
    await t.rejects(cache.putPayload('../escape', 1, '{}'), /unsafe payload id/);
    t.same(cache.payloadStats(), {size: 0, dropped: 0}, 'nothing was retained under an unsafe id');
    await cache.close();
});

t.test('a stored record that is not JSON resolves to undefined rather than throwing', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    // A record torn by a crash must answer "not retained" rather than throw out of
    // a lookup. The entry is written directly, because that is what a store with a
    // corrupt entry in it looks like from the outside.
    await cacache.put(dir, '01TRUNC', '{"id":');
    t.equal(await cache.get('01TRUNC'), undefined, 'a corrupt record is a miss, not an exception');
    await cache.close();
});

t.test('a stored payload that is not JSON resolves to undefined rather than throwing', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await cacache.put(dir, '01TRUNC', '{"a":', {metadata: {timestamp: 1, kind: 'payload'}});
    t.equal(await cache.getPayload('01TRUNC'), undefined, 'a corrupt payload is a miss, not an exception');
    await cache.close();
});

t.test('records and payloads are bounded independently', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 2});

    for (const [id, time] of [
        ['01A', 1],
        ['01B', 2],
        ['01C', 3],
        ['01D', 4],
    ] as Array<[string, number]>) {
        await cache.put(record(id, time));
    }
    t.equal(await cache.get('01A'), undefined);
    t.equal((await cache.get('01D'))?.msg, 'm-01D');
    t.same(cache.stats(), {size: 2, dropped: 2});

    // The payload half is bounded by the same rule, pruned oldest-first, and
    // counted on its own.
    for (const [id, time] of [
        ['01P', 10],
        ['01Q', 11],
        ['01R', 12],
        ['01S', 13],
    ] as Array<[string, number]>) {
        await cache.putPayload(id, time, JSON.stringify({id}));
    }
    t.equal(await cache.getPayload('01P'), undefined);
    t.same(await cache.getPayload('01S'), {id: '01S'});
    t.same(cache.payloadStats(), {size: 2, dropped: 2});
    // Pruning one surface does not disturb the other.
    t.equal((await cache.get('01D'))?.msg, 'm-01D');

    // An entry written by another writer behind this store's back is neither
    // counted nor pruned by it: the retention order is the list this process read
    // at open. That is the stated cost of not reading the index on every write,
    // and it is why the bound is described as per-writer rather than per-directory.
    await cacache.put(dir, '01NOTS', '{}');
    await cache.put(record('01E', 5));
    await cache.put(record('01F', 6));
    t.ok(await cache.get('01NOTS'), 'a foreign entry is left where it is');
    t.equal((await cache.get('01F'))?.msg, 'm-01F');
    t.equal(await cache.get('01C'), undefined, 'the oldest this store wrote went first');
    t.same(cache.stats(), {size: 2, dropped: 4}, 'the bound still holds for what it wrote');
    await cache.close();
});

t.test('the sweep runs at most once per interval, and adopts the counts', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));

    const first = await openCache({dir, limit: 10, sweepIntervalMs: 0, now: () => 1000});
    await first.put(record('01A', 1));
    await first.close();

    // A marker that is present and recent: the counts are adopted and nothing is
    // pruned, which is the whole point of the marker.
    const second = await openCache({dir, limit: 10, sweepIntervalMs: 60_000, now: () => 1001});
    t.equal(second.stats().size, 1);
    t.equal((await second.get('01A'))?.msg, 'm-01A');
    await second.close();

    // A marker whose value is not an instant reads as "never swept", not as an
    // error: a corrupted marker must not stop the cache from bounding itself. The
    // clock starts past the zero it falls back to, so the pass really is due.
    await cacache.put(dir, cachePaths.marker, Buffer.from(JSON.stringify({lastCleanup: 'nope'})));
    const third = await openCache({dir, limit: 10, sweepIntervalMs: 0, now: () => 1});
    t.equal(third.stats().size, 1);
    await third.close();
});

t.test('a sweep at open prunes to the bound the cache is opened with', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const wide = await openCache({dir, limit: 10});
    for (const [index, id] of ids(0, 5).entries()) {
        await wide.put(record(id, index));
    }
    // An entry another writer left without a timestamp sorts oldest, so the bound
    // still reaches it: a missing instant reads as the beginning of time.
    await cacache.put(dir, '01NOMETA', '{}');
    await wide.close();

    // Opening with a narrower bound and a sweep that is due prunes the store it
    // finds, not just the writes that come after — and that pass is the one that
    // garbage-collects content, so it is the pass that must run `verify`. The real
    // clock keeps the elapsed time non-negative against the marker the wide open
    // published.
    const narrow = await openCache({dir, limit: 2, sweepIntervalMs: 0});
    t.same(await storedIds(dir), ids(3, 5), 'the store was pruned to the new bound');
    t.same(narrow.stats(), {size: 2, dropped: 4}, 'the pruning at open is counted');
    t.equal(await narrow.get('01NOMETA'), undefined, 'the entry with no instant went first');
    await narrow.close();
});

t.test('a sweep whose content collection fails still bounds the store', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const wide = await openCache({dir, limit: 10});
    for (const [index, id] of ids(0, 4).entries()) {
        await wide.put(record(id, index));
    }
    await wide.close();

    // `verify` rewrites the whole index to collect what nothing references any
    // more. That is disk hygiene rather than correctness, so a store that cannot
    // collect must still bound itself, and the sweep must not fail the open.
    const real = await import('cacache');
    const {openCache: openUncollectable} = await t.mockImport<typeof import('./cache.ts')>(
        './cache.ts',
        {
            cacache: {
                ...real,
                verify: async () => {
                    throw new Error('gc failed');
                },
            },
        },
    );
    const narrow = await openUncollectable({dir, limit: 2, sweepIntervalMs: 0});
    t.same(await storedIds(dir), ids(2, 4), 'the bound still holds');
    t.same(narrow.stats(), {size: 2, dropped: 2}, 'and the pruning is still counted');
    await narrow.close();
});

t.test('a read-only open neither sweeps nor writes', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const written = await openCache({dir, limit: 10});
    await written.put(record('01A', 1));
    await written.close();

    // A staged record no open has replayed yet, and a marker old enough that a
    // sweep is due: a read-only open must act on neither.
    appendFileSync(
        cachePaths.sidecarFile(dir),
        `${JSON.stringify({
            id: '01FATAL',
            time: 1,
            kind: 'record',
            json: JSON.stringify(record('01FATAL', 1)),
        })}\n`,
    );
    await cacache.put(dir, cachePaths.marker, Buffer.from(JSON.stringify({lastCleanup: 0})));
    const markerBefore = (await cacache.get(dir, cachePaths.marker)).data.toString();

    const readOnly = await openCache({dir, limit: 10, readOnly: true, sweepIntervalMs: 0, now: () => 1});
    t.equal(readOnly.stats().size, 1, 'the counts are adopted from the index without pruning');
    t.equal((await readOnly.get('01A'))?.msg, 'm-01A', 'a stored record resolves');
    t.equal((await readOnly.get('01FATAL'))?.msg, 'm-01FATAL', 'a staged record resolves too');
    t.equal(
        (await cacache.get(dir, cachePaths.marker)).data.toString(),
        markerBefore,
        'the marker was not rewritten',
    );
    t.ok(existsSync(cachePaths.sidecarFile(dir)), 'the sidecar was not replayed');
    await readOnly.close();
});

t.test('a failing store reports, and never loses a synchronous record', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));

    const opened = await openCache({dir, limit: 10});
    opened.putSync(record('01FATAL', 1));
    await opened.close();

    // A store whose writes fail, but whose marker write and index read do not: the
    // replay cannot complete, so the durable copy has to stay.
    const failing = {
        get: async () => {
            throw new Error('no marker');
        },
        put: async (_cache: string, key: string) => {
            if (key === cachePaths.marker) {
                return {};
            }
            throw new Error('disk full');
        },
        ls: async (cache: string) => {
            if (cache.endsWith('not-a-cache')) {
                throw new Error('not a cache');
            }
            return {};
        },
        rm: {entry: async () => undefined},
        verify: async () => ({}),
    };
    const {openCache: openFailing, cacheRecordIds: failingRecordIds} = await t.mockImport<
        typeof import('./cache.ts')
    >('./cache.ts', {cacache: failing});
    const cache = await openFailing({dir, limit: 10});
    t.ok(existsSync(cachePaths.sidecarFile(dir)), 'a failed replay keeps the sidecar');
    t.equal((await cache.get('01FATAL'))?.msg, 'm-01FATAL');
    await t.rejects(cache.put(record('01B', 2)), /disk full/);
    // An index that cannot even be read is no records, not a failed call.
    t.same(await failingRecordIds(join(dir, 'not-a-cache')), []);
    await cache.close();
});
