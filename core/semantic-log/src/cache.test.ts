import {readFileSync} from 'node:fs';
import {appendFile, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
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

async function recordFileCount(dir: string): Promise<number> {
    return (await readdir(join(dir, 'records'))).length;
}

t.test('a stored record is retrievable by id', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await cache.put(record('01A', 1));
    const found = await cache.get('01A');
    t.equal(found?.msg, 'm-01A');
    t.equal(await cache.get('missing'), undefined);
    // An id that could never name a record file is a miss, not an exception:
    // `get` must never fail a lookup, whatever it is handed.
    t.equal(await cache.get('../escape'), undefined);
    t.equal(await cache.get(''), undefined);
    await cache.close();
});

t.test('lookup reads one file, not the directory (PRD R21 acceptance)', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));

    // Intercept the module's `readdir` so an enumeration on the lookup path is
    // observable. Only the cache's own instance is mocked; the assertions below
    // control for the interception being live.
    const realFs = await import('node:fs/promises');
    const enumerated: string[] = [];
    const mockedFs = {
        ...realFs,
        readdir: (...args: unknown[]): Promise<string[]> => {
            enumerated.push('readdir');
            return (realFs.readdir as (...rest: unknown[]) => Promise<string[]>)(...args);
        },
    };
    const {openCache: openMockedCache, cacheRecordIds: mockedRecordIds} = await t.mockImport<
        typeof import('./cache.ts')
    >('./cache.ts', {'node:fs/promises': mockedFs});

    // The bound is set above the 25 records so that the record under test is
    // retained: this test is about the lookup path, not about pruning.
    const cache = await openMockedCache({dir, limit: 100});
    await Promise.all(ids(0, 25).map((id, index) => cache.put(record(id, index))));

    enumerated.length = 0;
    const found = await cache.get('0107');
    t.equal(found?.msg, 'm-0107');
    t.equal(enumerated.length, 0, 'no directory enumeration on the lookup path');

    // Control: the interception is wired, so the assertion above is not vacuous.
    await mockedRecordIds(dir);
    t.ok(enumerated.length > 0, 'the readdir interception is live');
    await cache.close();
});

t.test('the cache is bounded and prunes the oldest records', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 5});
    for (let i = 0; i < 12; i++) {
        await cache.put(record(`01${i.toString().padStart(2, '0')}`, i));
    }
    const files = await readdir(join(dir, 'records'));
    t.ok(files.length <= 5, `bounded to 5, found ${files.length}`);
    t.equal(await cache.get('0100'), undefined, 'oldest pruned');
    t.ok(await cache.get('0111'), 'newest retained');
    t.same(cache.stats(), {size: 5, dropped: 7}, 'the accounting matches the pruning');
    // Publishing the rewritten index must not leave its temporary sibling behind.
    t.equal(
        (await readdir(dir)).filter(name => name.endsWith('.tmp')).length,
        0,
        'no temporary index file is left over',
    );
    await cache.close();
});

t.test('concurrent writes stay bounded', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await Promise.all(ids(0, 25).map((id, index) => cache.put(record(id, index))));
    t.ok((await recordFileCount(dir)) <= 10, 'a concurrent burst is still bounded');
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
    t.equal(second.stats().size, 1, 'the index was read back');
    await second.close();
});

t.test('a torn index line is skipped instead of breaking the cache', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const first = await openCache({dir, limit: 10});
    await first.put(record('01A', 1));
    await first.put(record('01B', 2));
    await first.close();
    // A crash between `appendFile` and the next rewrite leaves a partial line.
    await appendFile(join(dir, 'index.jsonl'), '{"id":"01TORN"');

    const second = await openCache({dir, limit: 3});
    t.equal(second.stats().size, 2, 'the torn line is not an index entry');
    t.equal((await second.get('01A'))?.msg, 'm-01A', 'the records around it survive');
    for (const [index, id] of ids(2, 6).entries()) {
        await second.put(record(id, 100 + index));
    }
    // Had the torn line been adopted as an entry it would have been pruned
    // first, and the oldest real record would still be here.
    t.equal(await second.get('01A'), undefined, 'the oldest real record was pruned');
    t.ok(await second.get('0105'), 'the newest record survived the pruning');
    t.equal(second.stats().size, 3, 'the bound still holds');
    await second.close();
});

t.test('the record file is written before the index entry', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await cache.put(record('01A', 1));
    // Resolution depends on the record file alone, so a record written just
    // before a crash still resolves even though its index line never landed.
    t.ok((await stat(join(dir, 'records', '01A.json'))).isFile(), 'the record is a file of its own');
    t.equal((await cache.get('01A'))?.id, '01A');
    await cache.close();
});

t.test('putSync retains a record before it returns, with no flush of any kind', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    cache.putSync(record('01S', 7));
    // Every read below is synchronous, with no `await` in between: only a write
    // that completed inside `putSync` can have landed the file this early. A
    // queued asynchronous `put` would still be pending, because the event loop
    // has not turned. This is the property `fatal` depends on — `process.exit`
    // drains no pending I/O — so it is asserted without any flush.
    const raw = readFileSync(join(dir, 'records', '01S.json'), 'utf8');
    t.equal((JSON.parse(raw) as LogRecord).msg, 'm-01S', 'the record file is there the moment putSync returns');
    t.match(readFileSync(join(dir, 'index.jsonl'), 'utf8'), /\{"id":"01S","time":7\}/, 'the index line landed too');
    t.equal(cache.stats().size, 1, 'the in-memory index agrees');
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
    t.same(cache.stats(), {size: 2, dropped: 1}, 'the overflow was pruned synchronously');
    t.equal(await cache.get('01A'), undefined, 'the oldest went first');
    t.ok(await cache.get('01C'), 'the newest is retained');
    t.equal(await recordFileCount(dir), 2, 'the store is bounded on disk');
    // The synchronous prune publishes through its own temporary file, distinct
    // from the queued rewrite's (proved separately below), and leaves no trace.
    t.equal(
        (await readdir(dir)).filter(name => name.endsWith('.tmp')).length,
        0,
        'no temporary index file is left over',
    );
    await cache.close();
});

t.test('a synchronous prune uses its own temporary path, and leaves none behind', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 4});
    for (const [index, id] of ids(0, 4).entries()) {
        cache.putSync(record(id, index));
    }
    // Stand in for a queued rewrite that is in flight: its temporary holds a
    // serialisation of the index as it was before the fatal record arrived. The
    // synchronous prune that runs next must neither overwrite this file nor
    // rename it away, or the two publishes would be settled by whichever
    // `rename` landed last and the fatal record's index line could be reverted.
    const queuedTemporary = `${cachePaths.indexFile(dir)}.tmp`;
    await writeFile(queuedTemporary, 'queued-rewrite-in-flight');
    cache.putSync(record('01F', 6)); // crosses the bound, so this prunes synchronously

    t.equal(
        await readFile(queuedTemporary, 'utf8'),
        'queued-rewrite-in-flight',
        'the queued rewrite’s temporary is neither overwritten nor renamed away',
    );
    t.same(
        (await readdir(dir)).filter(name => name.endsWith('.tmp')),
        [`${cachePaths.index}.tmp`],
        'only the queued temporary remains: the synchronous one was published and is gone',
    );
    // The publish really happened: the oldest entry is out of the index and its
    // file is off disk, while the newest is in both.
    t.equal(await cache.get('0100'), undefined, 'the oldest was pruned');
    t.ok(await cache.get('01F'), 'the newest is retained');
    t.match(readFileSync(cachePaths.indexFile(dir), 'utf8'), /\{"id":"01F","time":6\}/);
    await cache.close();
});

t.test('a synchronous prune whose publish fails leaves no temporary behind', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const realFs = await import('node:fs');
    // Only the *publish* step is broken; the temporary the synchronous rewrite
    // writes is still created for real, so if the failure path leaked it, the
    // directory scan below would see it.
    const mockedFs = {
        ...realFs,
        renameSync: (): void => {
            throw new Error('injected synchronous rename failure');
        },
    };
    const {openCache: openMockedCache} = await t.mockImport<typeof import('./cache.ts')>('./cache.ts', {
        'node:fs': mockedFs,
    });
    const cache = await openMockedCache({dir, limit: 1});
    cache.putSync(record('01A', 1));
    // This put crosses the bound, so it prunes and the publish step fails. The
    // failure is swallowed (refusing to throw is the contract), the temporary is
    // removed, and the entry that `evict` took out of the index still counts as
    // dropped even though its file removal was the last thing that succeeded.
    t.doesNotThrow(() => cache.putSync(record('01B', 2)));
    t.same(
        (await readdir(dir)).filter(name => name.endsWith('.tmp')),
        [],
        'no temporary is left behind by the failed synchronous publish',
    );
    t.same(cache.stats(), {size: 1, dropped: 1}, 'removal from the index is what `dropped` counts');
    const index = readFileSync(cachePaths.indexFile(dir), 'utf8');
    t.match(index, /\{"id":"01A","time":1\}/, 'the index file still holds the appended lines');
    t.match(index, /\{"id":"01B","time":2\}/);
    t.ok(await cache.get('01B'), 'the record file itself was written and resolves');
    await cache.close();
});

t.test('the synchronous write never throws, however it fails', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    // An id that could escape the directory is refused, not thrown: this call
    // runs inside an `uncaughtException` handler, where a throw would abort the
    // process the record exists to report.
    t.doesNotThrow(() => cache.putSync(record('../escape', 1)));
    t.equal(cache.stats().size, 0, 'nothing was retained under an unsafe id');
    // An unwritable destination — here, a records directory that no longer
    // exists — is swallowed exactly as the asynchronous path swallows a
    // rejected `put`. The failed retention is not counted: `dropped` counts
    // entries removed from the index, and nothing was removed here.
    await rm(join(dir, 'records'), {recursive: true, force: true});
    t.doesNotThrow(() => cache.putSync(record('01A', 1)));
    t.same(cache.stats(), {size: 0, dropped: 0}, 'a failed write is neither retained nor counted');
    await cache.close();
});

t.test('cacheRecordIds reports the store, and tolerates a missing directory', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    await cache.put(record('01A', 1));
    await cache.put(record('01B', 2));
    await cache.close();
    t.same((await cacheRecordIds(dir)).sort(), ['01A', '01B']);
    t.same(await cacheRecordIds(join(dir, 'absent')), []);
});

t.test('openCache refuses a cache it could not bound', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    await t.rejects(openCache({dir, limit: 0}), /limit must be a positive integer/);
    await t.rejects(openCache({dir: '', limit: 10}), /a cache directory is required/);

    const cache = await openCache({dir, limit: 10});
    await t.rejects(cache.put(record('../escape', 1)), /unsafe record id/);
    await cache.close();
});

t.test('the canonical paths are the ones the cache actually uses', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    // Callers that must not guess the backing-file names read them from here.
    t.equal(cachePaths.index, 'index.jsonl');
    t.equal(cachePaths.records, 'records');
    t.equal(cachePaths.indexFile(dir), join(dir, cachePaths.index));
    t.equal(cachePaths.recordsDir(dir), join(dir, cachePaths.records));
    // The payload half is reported on the same terms, so a caller resolving a
    // reference never has to know that payloads live beside records.
    t.equal(cachePaths.payloadIndex, 'payloads.jsonl');
    t.equal(cachePaths.payloads, 'payloads');
    t.equal(cachePaths.payloadIndexFile(dir), join(dir, cachePaths.payloadIndex));
    t.equal(cachePaths.payloadsDir(dir), join(dir, cachePaths.payloads));

    const cache = await openCache({dir, limit: 1});
    await cache.put(record('01A', 1));
    await cache.putPayload('01A', 1, '{"p":1}');
    await cache.close();
    t.ok((await stat(cachePaths.indexFile(dir))).isFile(), 'the reported index file is the one written');
    t.ok(
        (await stat(join(cachePaths.recordsDir(dir), '01A.json'))).isFile(),
        'the reported records directory holds the record',
    );
    t.ok((await stat(cachePaths.payloadIndexFile(dir))).isFile(), 'the reported payload index is the one written');
    t.ok(
        (await stat(join(cachePaths.payloadsDir(dir), '01A.json'))).isFile(),
        'the reported payloads directory holds the payload',
    );
});

t.test('putPayloadSync retains a payload before it returns, with no flush of any kind', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    const json = JSON.stringify({hello: 'world'});
    cache.putPayloadSync('01P', 7, json);
    // Every read below is synchronous, with no `await` in between: only a write
    // that completed inside `putPayloadSync` can have landed the file this
    // early. This is the property a `fatal` depends on — its inline payload
    // reference must resolve after the exit that drains no pending I/O — so it
    // is asserted without any flush, exactly as the `putSync` test is.
    const raw = readFileSync(join(dir, cachePaths.payloads, '01P.json'), 'utf8');
    t.equal(raw, json, 'the payload file is there the moment putPayloadSync returns');
    t.match(
        readFileSync(join(dir, cachePaths.payloadIndex), 'utf8'),
        /\{"id":"01P","time":7\}/,
        'the payload index line landed too',
    );
    t.same(cache.payloadStats(), {size: 1, dropped: 0}, 'the in-memory payload index agrees');
    t.same(await cache.getPayload('01P'), {hello: 'world'}, 'the lookup path resolves it');
    await cache.close();
});

t.test('the synchronous payload write never throws, however it fails', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    // An id that could escape the directory is refused, not thrown: this call
    // runs on the `fatal` path, where a throw would abort the process the
    // record and its payload reference exist to report.
    t.doesNotThrow(() => cache.putPayloadSync('../escape', 1, '{}'));
    t.same(cache.payloadStats(), {size: 0, dropped: 0}, 'nothing was retained under an unsafe id');
    // An unwritable destination — here, a payloads directory that no longer
    // exists — is swallowed exactly as the asynchronous path swallows a
    // rejected `putPayload`. The failed retention is not counted: `dropped`
    // counts entries removed from the index, and nothing was removed here.
    await rm(join(dir, cachePaths.payloads), {recursive: true, force: true});
    t.doesNotThrow(() => cache.putPayloadSync('01P', 1, '{}'));
    t.same(cache.payloadStats(), {size: 0, dropped: 0}, 'a failed write is neither retained nor counted');
    await cache.close();
});

t.test('a stored record that is not JSON resolves to undefined rather than throwing', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    // Mirror of the corrupt payload below, for the record half: a record file
    // torn by a crash must answer "not retained" rather than throw out of a
    // lookup. The fixture has to sit at the entry path `read` looks for, suffix
    // and all: a file one name away is simply absent, and never reaches
    // `JSON.parse`, so it would not exercise this branch at all.
    await writeFile(join(dir, cachePaths.records, '01TRUNC.json'), '{"id":');
    t.equal(await cache.get('01TRUNC'), undefined, 'a corrupt record is a miss, not an exception');
    t.same(cache.stats(), {size: 0, dropped: 0}, 'the corrupt entry was never an index entry');
    await cache.close();
});

t.test('a stored payload that is not JSON resolves to undefined rather than throwing', async t => {
    const dir = await tempDir();
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const cache = await openCache({dir, limit: 10});
    // A crash mid-write can leave an entry file truncated at any byte, and a
    // stored payload is only ever handed to `JSON.parse` on the way back out.
    // The lookup must answer "not retained" — the same answer as an absent
    // file — rather than throw out of a resolver that is reading a page. As
    // above, the fixture carries the entry suffix: without it the store sees an
    // absent file and the parser's own refusal is never reached.
    await writeFile(join(dir, cachePaths.payloads, '01TRUNC.json'), '{"a":');
    t.equal(await cache.getPayload('01TRUNC'), undefined, 'a corrupt payload is a miss, not an exception');
    t.same(cache.payloadStats(), {size: 0, dropped: 0}, 'the corrupt entry was never an index entry');
    await cache.close();
});
