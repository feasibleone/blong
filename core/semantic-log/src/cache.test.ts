import * as cacache from 'cacache';
import {appendFileSync, existsSync, readFileSync, statSync} from 'node:fs';
import {mkdir, mkdtemp, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {cachePaths, cacheRecordIds, openCache, reclaimDeadIndexFiles} from './cache.ts';
import type {LogRecord} from './record.ts';

function record(id: string, time: number): LogRecord {
    return {
        id,
        time,
        level: 30,
        levelName: 'info',
        msg: `m-${id}`,
        service: 's',
        refs: {record: id},
    };
}

/** A record of a known shape: the shape reference its repeats share is its key. */
function shaped(id: string, time: number, shape: string): LogRecord {
    return {...record(id, time), refs: {record: id, template: shape}};
}

/** A record that withheld a payload, so folding it away would hide one. */
function withheld(id: string, time: number, shape: string): LogRecord {
    const base = shaped(id, time, shape);
    return {...base, refs: {...base.refs, payloads: {config: '01PAY'}}};
}

/** A record that carries an error, which is the other kind folding would hide. */
function errored(id: string, time: number, shape: string): LogRecord {
    return {...shaped(id, time, shape), level: 50, levelName: 'error'};
}

function ids(from: number, to: number): string[] {
    return Array.from(
        {length: to - from},
        (_value, index) => `01${(from + index).toString().padStart(2, '0')}`,
    );
}

async function tempDir(): Promise<string> {
    return mkdtemp(join(tmpdir(), 'semantic-log-cache-'));
}

/** The store's own index, as the module's own enumeration would see it. */
async function storedIds(dir: string): Promise<string[]> {
    return (await cacheRecordIds(dir)).sort();
}

/**
 * Every index file under `dir`, at any depth.
 *
 * `cacache` gives each key an index file of its own, so this count is the number
 * of files a `cacache.ls` has to open — which is what the store's retention is
 * judged by, and what a tombstoned prune leaves behind.
 */
async function indexFiles(dir: string): Promise<string[]> {
    const found: string[] = [];
    const walk = async (path: string): Promise<void> => {
        for (const entry of await readdir(path, {withFileTypes: true})) {
            const full = join(path, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else {
                found.push(full);
            }
        }
    };
    for (const entry of await readdir(dir, {withFileTypes: true})) {
        if (entry.isDirectory() && entry.name.startsWith('index-v')) {
            await walk(join(dir, entry.name));
        }
    }
    return found;
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
    t.same(cache.recordStats(), {size: 1, dropped: 0}, 'and it is counted as a per-emit record');
    t.same(cache.stats(), {size: 0, dropped: 0}, 'a record with no shape leaves the primary empty');
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
    t.same(cache.recordStats(), {size: 5, dropped: 7}, 'the accounting matches the pruning');
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
    t.equal(cache.recordStats().dropped, 15, 'exactly the overflow was pruned');
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
    t.equal(second.recordStats().size, 1, 'the store was read back');
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
    t.equal(second.recordStats().size, 2, 'exactly the two real entries were replayed');
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

t.test('a sweep rewrites the index from the shapes it holds', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const first = await openCache({dir, limit: 3});
    await first.put(shaped('01A', 1, 'aa'));
    await first.put(shaped('01A2', 2, 'aa'));
    await first.put(shaped('01B', 3, 'bb'));
    await first.close();

    // The pass that reads the truth and rewrites the index has to write the shapes
    // back with their counts, or the next open would restart every count at one.
    const swept = await openCache({dir, limit: 3, sweepIntervalMs: 0});
    const after = readFileSync(join(dir, 'order.jsonl'), 'utf8').trim().split('\n');
    t.same(
        after.map(line => JSON.parse(line) as object),
        [
            {id: 'aa', k: 'template', n: 2},
            {id: 'bb', k: 'template'},
        ],
        'each shape is one line, oldest first, with its count',
    );
    t.same(swept.stats(), {size: 2, dropped: 0}, 'and the pass kept both shapes');
    await swept.close();
});

t.test('openCache refuses a cache it could not bound', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    await t.rejects(openCache({dir: '', limit: 10}), /a cache directory is required/);
    await t.rejects(openCache({dir, limit: 0}), /limit must be a positive integer/);
    await t.rejects(openCache({dir, limit: 1.5}), /limit must be a positive integer/);
    // The per-emit tenant has its own bound, so it has its own refusal: a typo that
    // left it at zero would prune every record the moment it was written.
    await t.rejects(
        openCache({dir, limit: 10, recordLimit: 0}),
        /recordLimit must be a positive integer/,
    );
    await t.rejects(
        openCache({dir, limit: 10, recordLimit: 2.5}),
        /recordLimit must be a positive integer/,
    );
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
    t.equal(
        (JSON.parse(lines[0] ?? '{}') as {json?: string}).json,
        json,
        'the payload is staged the moment it returns',
    );
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
    t.equal(
        await cache.getPayload('01TRUNC'),
        undefined,
        'a corrupt payload is a miss, not an exception',
    );
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
    t.same(cache.recordStats(), {size: 2, dropped: 2});

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
    t.same(cache.recordStats(), {size: 2, dropped: 4}, 'the bound still holds for what it wrote');
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
    t.equal(second.recordStats().size, 1);
    t.equal((await second.get('01A'))?.msg, 'm-01A');
    await second.close();

    // A marker whose value is not an instant reads as "never swept", not as an
    // error: a corrupted marker must not stop the cache from bounding itself. The
    // clock starts past the zero it falls back to, so the pass really is due.
    await cacache.put(dir, cachePaths.marker, Buffer.from(JSON.stringify({lastCleanup: 'nope'})));
    const third = await openCache({dir, limit: 10, sweepIntervalMs: 0, now: () => 1});
    t.equal(third.recordStats().size, 1);
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
    t.same(narrow.recordStats(), {size: 2, dropped: 4}, 'the pruning at open is counted');
    t.equal(await narrow.get('01NOMETA'), undefined, 'the entry with no instant went first');
    await narrow.close();
});

t.test('pruning deletes the entry index file rather than tombstoning it', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 5});
    for (const [index, id] of ids(0, 12).entries()) {
        await cache.put(record(id, index));
    }

    // Five records plus the sweep marker: one file per live entry, and nothing
    // for the seven that were pruned. A tombstoning removal would leave twelve.
    t.equal((await indexFiles(dir)).length, 6, 'only the live entries have index files');
    t.same(await storedIds(dir), ids(7, 12), 'the store still holds exactly the bound');
    t.equal(await reclaimDeadIndexFiles(dir), 0, 'there is nothing left to reclaim');
    await cache.close();
});

t.test('reclaiming removes the files of entries pruned before the fix', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));

    // A directory written the way the store used to prune: the entry is put and
    // then removed without `removeFully`, so the file stays behind holding a
    // deletion that shadows it. That is what made the index grow without bound.
    await cacache.put(dir, '01LIVE', JSON.stringify(record('01LIVE', 5)), {
        metadata: {timestamp: 5, kind: 'record'},
    });
    await cacache.put(dir, '01DEAD', JSON.stringify(record('01DEAD', 1)), {
        metadata: {timestamp: 1, kind: 'record'},
    });
    await cacache.rm.entry(dir, '01DEAD');
    t.equal((await indexFiles(dir)).length, 2, 'both entries have a file, pruned one included');
    t.same(await storedIds(dir), ['01LIVE'], 'only one of them is still readable');

    t.equal(await reclaimDeadIndexFiles(dir), 1, 'the dead file is the one reclaimed');
    t.equal((await indexFiles(dir)).length, 1, 'the live entry keeps its file');

    // The reclaim is a repair, not a rewrite: what was readable still is.
    const cache = await openCache({dir, limit: 10});
    t.equal((await cache.get('01LIVE'))?.msg, 'm-01LIVE');
    t.equal(await cache.get('01DEAD'), undefined);
    await cache.close();
});

t.test('an index file that holds nothing is reclaimed', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await cache.put(record('01A', 1));
    await cache.close();

    // A crash between `cacache`'s `mkdir` and its `appendFile` leaves one behind.
    const [file] = await indexFiles(dir);
    await writeFile(
        join(file, '..', '0000000000000000000000000000000000000000000000000000000000'),
        '',
    );
    t.equal(await reclaimDeadIndexFiles(dir), 1, 'the file that holds nothing is removed');
});

t.test('a slow index scan is reported, and the directory is reclaimed', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));

    // One dead file to reclaim, written the old way.
    await cacache.put(dir, '01DEAD', JSON.stringify(record('01DEAD', 1)), {
        metadata: {timestamp: 1, kind: 'record'},
    });
    await cacache.rm.entry(dir, '01DEAD');

    const warnings: Array<Record<string, unknown>> = [];
    let clock = 0;
    // The first reading starts the scan and every later one is five seconds on:
    // the scan is the step this store measures, and faking the clock is how a
    // slow one is asserted without waiting for one.
    const cache = await openCache({
        dir,
        limit: 10,
        slowMs: 1000,
        sweepIntervalMs: 24 * 60 * 60 * 1000,
        now: () => (clock++ === 0 ? 0 : 5_000),
        log: {warn: (message, details) => warnings.push({message, ...details})},
    });

    t.equal(warnings.length, 1, 'the slow scan is reported once');
    t.match(warnings[0] as object, {elapsedMs: 5_000}, 'the report carries the measured time');
    t.match(warnings[0] as object, {message: /took 5000ms/}, 'and says what it cost');

    // The reclaim itself is background work: wait for it to finish rather than
    // for a fixed time.
    for (let attempt = 0; attempt < 100 && (await indexFiles(dir)).length > 0; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    t.equal((await indexFiles(dir)).length, 0, 'the dead index file was reclaimed');
    await cache.close();
});

t.test('a read-only open never reclaims, however slow the scan', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    await cacache.put(dir, '01DEAD', JSON.stringify(record('01DEAD', 1)), {
        metadata: {timestamp: 1, kind: 'record'},
    });
    await cacache.rm.entry(dir, '01DEAD');

    const warnings: Array<Record<string, unknown>> = [];
    let clock = 0;
    const cache = await openCache({
        dir,
        limit: 10,
        readOnly: true,
        slowMs: 1000,
        now: () => (clock++ === 0 ? 0 : 5_000),
        log: {warn: (message, details) => warnings.push({message, ...details})},
    });

    t.equal((await indexFiles(dir)).length, 1, 'the inspecting process deleted nothing');
    t.same(warnings, [], 'and reported nothing');
    await cache.close();
});

t.test('a reclaim that found nothing is not repeated on the next open', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    // A directory with nothing left to reclaim, opened twice with a scan that
    // looks slow both times. A scan happens on both opens because the sweep is due
    // on both (`sweepIntervalMs: 0`) — the secondary index is what otherwise spares
    // the second one. The second open reports the delay, which is a real one, but
    // does not read the whole directory again to find nothing. Each reading of the
    // clock is five seconds on, so the scan is always the same length.
    let clock = 0;
    const slowClock = () => (clock += 5_000);
    const first = await openCache({
        dir,
        limit: 10,
        slowMs: 1000,
        sweepIntervalMs: 0,
        now: slowClock,
    });
    for (let attempt = 0; attempt < 100; attempt++) {
        if (existsSync(join(dir, 'reclaim-state.json'))) break;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    t.ok(existsSync(join(dir, 'reclaim-state.json')), 'what the reclaim did was recorded');
    await first.close();

    const messages: string[] = [];
    const second = await openCache({
        dir,
        limit: 10,
        slowMs: 1000,
        sweepIntervalMs: 0,
        now: slowClock,
        log: {
            warn: message => {
                messages.push(message);
            },
        },
    });
    t.equal(messages.length, 1, 'the slow scan is still reported');
    t.notOk(/reclaiming/.test(messages[0]), 'but no reclaim is announced');
    await second.close();
});

t.test('a directory with a secondary index is not read the expensive way again', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));

    // Intercept `cacache.ls` so the expensive read is observable. It is the pass
    // that reads one file per live entry — the one the index exists to avoid.
    const real = await import('cacache');
    let scans = 0;
    const spied = {
        ...real,
        ls: (...args: unknown[]): Promise<unknown> => {
            scans += 1;
            return (real.ls as (...rest: unknown[]) => Promise<unknown>)(...args);
        },
    };
    const {openCache: openSpied} = await t.mockImport<typeof import('./cache.ts')>('./cache.ts', {
        cacache: spied,
    });

    const first = await openSpied({dir, limit: 10});
    await first.put(record('01A', 1));
    await first.close();
    // The first open has to read the truth — there is no index — and the sweep
    // that is due on a directory with no marker reads it a second time. What
    // matters is the reading the index exists to spare, so the count is kept
    // rather than asserted.
    const afterFirst = scans;
    t.ok(afterFirst > 0, 'the first open reads the truth, having no index to read');
    t.ok(existsSync(join(dir, 'order.jsonl')), 'and writes the index for the next one');

    const second = await openSpied({dir, limit: 10});
    t.equal(scans, afterFirst, 'the second open adds no read of the truth');
    t.equal(second.recordStats().size, 1, 'the counts came from the index');
    t.equal((await second.get('01A'))?.msg, 'm-01A', 'and the entry still resolves');
    await second.close();
});

t.test('the index is not trusted over the truth: the sweep reconciles it', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));

    const wide = await openCache({dir, limit: 10});
    for (const [index, id] of ids(0, 5).entries()) {
        await wide.put(record(id, index));
    }
    await wide.close();
    // An entry written straight to the cache, the way a process that keeps no
    // index — a transport, or an older version — would leave one. Its instant is
    // the oldest, so the bound reaches it first.
    await cacache.put(dir, '01FOREIGN', JSON.stringify(record('01FOREIGN', -1)), {
        metadata: {timestamp: -1, kind: 'record'},
    });

    // The sweep is due, so the truth is read, adopted and pruned to the bound the
    // cache is opened with — the foreign entry included, because it is really
    // there. What the index did not know cannot survive the reconciliation.
    const narrow = await openCache({dir, limit: 2, sweepIntervalMs: 0});
    t.same(await storedIds(dir), ids(3, 5), 'the store was pruned to the new bound');
    t.equal(await narrow.get('01FOREIGN'), undefined, 'the entry the index never saw was pruned');
    await narrow.close();

    // And the index that the pass rewrote is now what a later open reads: the two
    // live records, nothing else.
    const lines = readFileSync(join(dir, 'order.jsonl'), 'utf8').trim().split('\n');
    t.equal(lines.length, 2, 'the index holds exactly what is retained');
    t.same(
        lines.map(line => (JSON.parse(line) as {id: string}).id).sort(),
        ids(3, 5),
        'oldest first, with the foreign entry gone',
    );
});

t.test('removals are recorded, so the next open knows the entry is gone', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 2});
    for (const [index, id] of ids(0, 4).entries()) {
        await cache.put(record(id, index));
    }
    const lines = readFileSync(join(dir, 'order.jsonl'), 'utf8').trim().split('\n');
    type Line = {id?: string; d?: number; k?: string};
    const parsed = lines.map(line => JSON.parse(line) as Line);
    t.same(
        Object.keys(parsed[0] as object).sort(),
        ['id', 'k'],
        'a write carries the entry and its surface, and none of the varying fields',
    );
    t.same(
        Object.keys(parsed.find(line => line.d) as object).sort(),
        ['d', 'id'],
        'and a removal carries only what it removes',
    );
    t.equal(parsed.filter(line => line.d).length, 2, 'each pruned entry left a line saying so');
    await cache.close();

    // A later open reads two live entries, not four: the removals it read are
    // what tell it the difference.
    const reopened = await openCache({dir, limit: 2});
    t.same(
        reopened.recordStats(),
        {size: 2, dropped: 0},
        'the index reported what is really retained',
    );
    t.equal(await reopened.get('0100'), undefined, 'and nothing it pruned came back');
    await reopened.close();
});

t.test('the sweep compacts the index to what is retained', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 3});
    for (const [index, id] of ids(0, 12).entries()) {
        await cache.put(record(id, index));
    }
    const before = readFileSync(join(dir, 'order.jsonl'), 'utf8').trim().split('\n').length;
    t.ok(before > 3, 'the index holds a line per write and per removal');
    await cache.close();

    // The pass that reads the truth and prunes to the bound is the only one that
    // rewrites the index, and it leaves only what is retained in it.
    const swept = await openCache({dir, limit: 3, sweepIntervalMs: 0});
    t.same(await storedIds(dir), ids(9, 12), 'the store still holds the bound');
    const after = readFileSync(join(dir, 'order.jsonl'), 'utf8').trim().split('\n');
    t.equal(after.length, 3, 'the index was compacted');
    t.same(
        after.map(line => (JSON.parse(line) as {id: string}).id),
        ids(9, 12),
        'oldest first',
    );
    await swept.close();
});

t.test('writing an id again refreshes it instead of counting twice', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 3});
    await cache.put(record('01A', 1));
    await cache.put(record('01B', 2));
    await cache.put(record('01C', 3));

    // The same id written a second time — a repeated or replayed write. It has to
    // count as the *newest* write and not as a second entry: counted twice, it
    // would take the bound over by one and evict an entry that should have stayed,
    // which for a store whose whole point is that a reference still resolves is the
    // worst kind of eviction.
    await cache.put(record('01A', 10));
    t.same(cache.recordStats(), {size: 3, dropped: 0}, 'the store holds three entries, not four');
    t.same(await storedIds(dir), ['01A', '01B', '01C'], 'and the refresh evicted nothing');
    // The order is the position in the file, so a refresh *is* the id's last line:
    // the next open finds it last and prunes it last.
    const afterRefresh = readFileSync(join(dir, 'order.jsonl'), 'utf8').trim().split('\n');
    t.equal(
        (JSON.parse(afterRefresh[afterRefresh.length - 1] as string) as {id: string}).id,
        '01A',
        'the refreshed entry is the last line of the index',
    );

    // The refresh moved it to the newest place, so the next write past the bound
    // takes the entry behind it rather than the refreshed one.
    await cache.put(record('01D', 11));
    t.same(
        await storedIds(dir),
        ['01A', '01C', '01D'],
        'the refreshed entry outlived its neighbour',
    );
    t.same(cache.recordStats(), {size: 3, dropped: 1}, 'the bound still holds, counted once');
    await cache.close();

    // A later open reads the same thing from the index: one line per write, last
    // one for the id, and the prune order it describes is the refreshed one. `01A`
    // survives the next eviction only because the refresh made it newer than `01C`;
    // had the repeat been counted at its original time, `01A` would be the oldest
    // and would have gone instead.
    const reopened = await openCache({dir, limit: 3});
    t.same(
        reopened.recordStats(),
        {size: 3, dropped: 0},
        'the index reports three retained entries',
    );
    await reopened.put(record('01E', 20));
    t.same(
        await storedIds(dir),
        ['01A', '01D', '01E'],
        'the refreshed entry outlived the one it was written before',
    );
    await reopened.close();
});

t.test('a shape is one entry that holds its newest occurrence and its count', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 3});
    await cache.put(shaped('01A', 1, 'aa'));
    await cache.put(shaped('01B', 2, 'bb'));
    await cache.put(shaped('01C', 3, 'cc'));

    // The same shape again, under a fresh id — which is every repeat of an event,
    // since a record's id is minted per emit. Held per occurrence, the store would
    // hold one entry per line of traffic and a shape that appears in every run
    // would age out with the one-off records written after it; held per shape, the
    // newest occurrence takes the entry and the count says how many it stands for.
    await cache.put(shaped('01A2', 10, 'aa'));
    t.same(cache.stats(), {size: 3, dropped: 0}, 'three shapes are retained, not four');
    t.equal((await cache.get('aa'))?.time, 10, 'the shape resolves to its newest occurrence');
    t.equal((await cache.get('aa'))?.msg, 'm-01A2', 'and it is that occurrence, not the first');
    const listed = (await cacache.ls(dir)) as Record<string, {metadata?: {count?: number}}>;
    t.equal(listed['aa']?.metadata?.count, 2, 'the entry says it stands for two occurrences');
    t.same(
        (await storedIds(dir)).filter(id => id === 'aa' || id === '01A' || id === '01A2'),
        ['aa'],
        'the shape is one entry, whatever the id it was written under',
    );

    // The shape's place is the newest, so the next write past the bound takes the
    // entry behind it rather than the shape that just repeated.
    await cache.put(shaped('01D', 11, 'dd'));
    t.same(await storedIds(dir), ['aa', 'cc', 'dd'], 'the repeated shape outlived its neighbour');
    await cache.close();

    // The count is in the index, so a later open continues it rather than
    // restarting at one — the count is on the entry, not in the process.
    const reopened = await openCache({dir, limit: 3});
    t.same(reopened.stats(), {size: 3, dropped: 0}, 'the index reported what is retained');
    await reopened.put(shaped('01A3', 30, 'aa'));
    t.equal(
        (await reopened.get('aa'))?.time,
        30,
        'the newest occurrence replaced the one it found',
    );
    const relisted = (await cacache.ls(dir)) as Record<string, {metadata?: {count?: number}}>;
    t.equal(relisted['aa']?.metadata?.count, 3, 'and the count carried on across the reopen');
    await reopened.close();
});

t.test('a shape that repeats keeps its place at the bound', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    // The reason for keying by shape, stated as a run of traffic: one shape that
    // every iteration repeats, and one-off records written after it. Counted per
    // occurrence, the repeating shape would be the oldest by the third iteration
    // and would be pruned — the store would hold the three most recent one-offs
    // and nothing of the event that is actually happening.
    const cache = await openCache({dir, limit: 3});
    for (let index = 0; index < 20; index++) {
        await cache.put(shaped('01LOOP', index, 'loop'));
        await cache.put(shaped(`01ONE${index.toString().padStart(2, '0')}`, index, `one${index}`));
    }
    t.same(cache.stats(), {size: 3, dropped: 18}, 'the one-offs were pruned, the loop was not');
    t.equal(
        (await cache.get('loop'))?.time,
        19,
        'the repeating shape is still there, at its newest',
    );
    const listed = (await cacache.ls(dir)) as Record<string, {metadata?: {count?: number}}>;
    t.equal(listed['loop']?.metadata?.count, 20, 'and it says it happened twenty times');
    await cache.close();
});

t.test('a record whose denoise would hide something earns an entry of its own', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await cache.put(shaped('01A', 1, 'aa'));
    // An ordinary occurrence is represented by its shape and nothing else.
    t.same(
        cache.recordStats(),
        {size: 0, dropped: 0},
        'an ordinary record keeps no entry of its own',
    );
    // A record that withheld a payload, and an error: both keep one beside their
    // shape, because the fields of that occurrence are what a reader comes for.
    await cache.put(withheld('01B', 2, 'aa'));
    await cache.put(errored('01C', 3, 'aa'));
    t.same(cache.recordStats(), {size: 2, dropped: 0}, 'the two earned their own entries');
    t.equal((await cache.get('01B'))?.refs.payloads?.config, '01PAY', 'the withheld one resolves');
    t.equal((await cache.get('01C'))?.level, 50, 'and the error resolves');
    // A record that never had a shape can only be kept this way, so it is.
    await cache.put(record('01D', 4));
    t.equal((await cache.get('01D'))?.msg, 'm-01D', 'a record with no shape is kept under its id');
    t.same(cache.recordStats(), {size: 3, dropped: 0}, 'and counted with the others');
    t.same(cache.stats(), {size: 1, dropped: 0}, 'while the shape is still one entry');
    await cache.close();
});

t.test('the two tenants are bounded independently', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 5, recordLimit: 2});
    for (let index = 0; index < 8; index++) {
        await cache.put(errored(`01E${index.toString().padStart(2, '0')}`, index, `shape${index}`));
    }
    // Either bound reached prunes only its own tenant: a burst of errors must not
    // evict the shapes a reader is resolving, and shapes must not evict the errors.
    t.same(cache.stats(), {size: 5, dropped: 3}, 'the shapes are bounded by `limit`');
    t.same(cache.recordStats(), {size: 2, dropped: 6}, 'the per-emit entries by `recordLimit`');
    t.ok(await cache.get('shape7'), 'the newest shape is retained');
    t.ok(await cache.get('01E07'), 'and the newest error');
    await cache.close();
});

t.test('the index carries the shape of each per-emit record, and the count of a shape', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await cache.put(shaped('01A', 1, 'aa'));
    await cache.put(shaped('01A2', 2, 'aa'));
    await cache.put(errored('01B', 3, 'aa'));
    await cache.close();

    const lines = readFileSync(join(dir, 'order.jsonl'), 'utf8').trim().split('\n');
    type Line = {id?: string; k?: string; s?: string; n?: number};
    const parsed = lines.map(line => JSON.parse(line) as Line);
    t.same(
        parsed[0] as object,
        {id: 'aa', k: 'template'},
        'a shape carries its tenant and nothing else',
    );
    t.same(
        parsed[1] as object,
        {id: 'aa', k: 'template', n: 2},
        'and the count once it stands for more than one',
    );
    t.same(
        parsed[3] as object,
        {id: '01B', k: 'record', s: 'aa'},
        'a per-emit record carries the shape it belongs to',
    );
});

t.test('a payload is never folded: two equal payloads are two payloads', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 3});
    // The same content under two ids. A payload has no shape — nothing decided
    // that its content identifies it — so the two are two entries, and the bound
    // counts them as such.
    await cache.putPayload('01PA', 1, '{"v":1}');
    await cache.putPayload('01PB', 2, '{"v":1}');
    t.same(await cache.getPayload('01PA'), {v: 1}, 'both payloads are retained');
    t.same(await cache.getPayload('01PB'), {v: 1}, 'and both still resolve');
    const listed = (await cacache.ls(dir)) as Record<string, unknown>;
    t.same(
        Object.keys(listed)
            .filter(key => !key.startsWith('__blong_'))
            .sort(),
        ['01PA', '01PB'],
        'the equal content is two entries',
    );
    const lines = readFileSync(join(dir, 'order.jsonl'), 'utf8').trim().split('\n');
    t.equal(lines.length, 2, 'each left its own line in the index');
    await cache.close();
});

t.test('an index that grew past what it holds earns itself a pass', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    // Three retained entries and forty writes: the index holds the lines of
    // everything written and pruned, which is traffic, while the store retains
    // three. Waiting for the daily pass would leave that file to be read at every
    // open, so its own size earns it a pass instead.
    const first = await openCache({dir, limit: 3, sweepIntervalMs: 24 * 60 * 60 * 1000});
    for (let index = 0; index < 40; index++) {
        await first.put(record(`01${index.toString().padStart(22, '0')}`, index));
    }
    await first.close();
    const grown = readFileSync(join(dir, 'order.jsonl'), 'utf8').trim().split('\n').length;
    t.ok(grown > 12, 'the index holds the lines of all of it');

    const second = await openCache({dir, limit: 3, sweepIntervalMs: 24 * 60 * 60 * 1000});
    const compacted = readFileSync(join(dir, 'order.jsonl'), 'utf8').trim().split('\n');
    t.equal(compacted.length, 3, 'the pass rewrote it to what is retained');
    t.same(second.recordStats(), {size: 3, dropped: 0}, 'the store holds the bound it did');
    await second.close();
});

t.test('two stores writing one directory see each other', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));

    // Two processes, each with its own store over one shared directory — which is
    // what the pino transport and this store are to each other. Neither sees the
    // other's writes while it runs, and both append to the same file.
    const first = await openCache({dir, limit: 100});
    const second = await openCache({dir, limit: 100});
    await first.put(record('01AAA', 1));
    await second.put(record('01BBB', 2));
    await first.put(record('01CCC', 3));
    await second.put(record('01DDD', 4));
    await first.close();
    await second.close();

    // A third reader opens the file they both appended to and finds everything:
    // appends interleave, they do not overwrite.
    const third = await openCache({dir, limit: 100});
    t.same(third.recordStats(), {size: 4, dropped: 0}, 'both writers are in the index');
    t.same(await storedIds(dir), ['01AAA', '01BBB', '01CCC', '01DDD'], 'the store holds all four');
    await third.close();
});

t.test('a torn line in the index is skipped, not fatal', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await cache.put(record('01A', 1));
    await cache.close();

    // A crash between an append and its flush.
    appendFileSync(join(dir, 'order.jsonl'), '{"id":"01TORN"');
    const reopened = await openCache({dir, limit: 10});
    t.equal(reopened.recordStats().size, 1, 'the complete lines still say what they said');
    t.equal((await reopened.get('01A'))?.msg, 'm-01A');
    await reopened.close();
});

t.test('a directory with no index falls back to reading the truth', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    // Entries written the way a store that keeps no index leaves them.
    await cacache.put(dir, '01PLAIN', JSON.stringify(record('01PLAIN', 4)), {
        metadata: {timestamp: 4, kind: 'record'},
    });
    await cacache.put(dir, '01PAYLOAD', JSON.stringify({value: 1}), {
        metadata: {timestamp: 5, kind: 'payload'},
    });

    const cache = await openCache({dir, limit: 10});
    t.same(
        cache.recordStats(),
        {size: 1, dropped: 0},
        'the record surface was adopted from the truth',
    );
    t.same(cache.payloadStats(), {size: 1, dropped: 0}, 'and so was the payload surface');
    t.ok(existsSync(join(dir, 'order.jsonl')), 'an index was written for the next open');
    await cache.close();
});

t.test('a read-only open never writes the index', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    await cacache.put(dir, '01PLAIN', JSON.stringify(record('01PLAIN', 4)), {
        metadata: {timestamp: 4, kind: 'record'},
    });

    const cache = await openCache({dir, limit: 10, readOnly: true});
    t.equal(cache.recordStats().size, 1, 'the inspector still sees what is retained');
    t.notOk(existsSync(join(dir, 'order.jsonl')), 'and wrote nothing');
    await cache.close();
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
    t.same(narrow.recordStats(), {size: 2, dropped: 2}, 'and the pruning is still counted');
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

    const readOnly = await openCache({
        dir,
        limit: 10,
        readOnly: true,
        sweepIntervalMs: 0,
        now: () => 1,
    });
    t.equal(
        readOnly.recordStats().size,
        1,
        'the counts are adopted from the index without pruning',
    );
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
