/**
 * The inspect CLI (PRD R19, R21).
 *
 * Everything the CLI decides is exercised through `inspect`, which takes its
 * destinations as an argument precisely so a test can drive it in process. The
 * entry point is not covered from here: it runs only as a separate program, and
 * a child spawned from a test process is instrumented by the runner's coverage
 * collector in a way that corrupts the suite's report. The spawned-process
 * acceptance test (`test/spawn.test.ts`) exercises it end to end instead.
 */

import {mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {homedir, tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import {openCache, type RecordCache} from '../src/cache.ts';
import type {LogRecord} from '../src/record.ts';
import {inspect, parseInspectArgs, toId} from '../bin/semantic-log-inspect.ts';

const ID = '01J8Z9K2M9PQRSTVWXYZ0A1B2C';
const OLDER_ID = '01J8Z9K2M9PQRSTVWXYZ0A1B2D';
const NEWER_ID = '01J8Z9K2M9PQRSTVWXYZ0A1B2E';

function record(id: string, time = 1757765472345): LogRecord {
    return {
        id,
        time,
        level: 50,
        levelName: 'error',
        msg: 'connection timeout',
        service: 'hub',
        refs: {record: id},
    };
}

/** Run `fn` against a fresh cache holding `records` (oldest first). The cache is
 * closed before `fn` runs; `stats()` stays readable, so `fn` can assert on what
 * the puts left behind. */
async function withCache(
    fn: (dir: string, cache: RecordCache) => Promise<void>,
    records: LogRecord[] = [record(ID)],
    limit = 10,
): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-cli-'));
    try {
        const cache = await openCache({dir, limit});
        for (const entry of records) {
            await cache.put(entry);
        }
        await cache.close();
        await fn(dir, cache);
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
}

interface Sink {
    out: string[];
    err: string[];
    io: {out: (text: string) => void; err: (text: string) => void};
}

/** Collect what the CLI writes, so a test can assert on it. */
function sink(): Sink {
    const out: string[] = [];
    const err: string[] = [];
    return {out, err, io: {out: text => void out.push(text), err: text => void err.push(text)}};
}

t.test('a record reference resolves and prints', async t => {
    await withCache(async dir => {
        const {out, io} = sink();
        const code = await inspect(['--cache', dir, `semantic-log://record/${ID}`], io);
        t.equal(code, 0);
        t.match(out.join(''), /connection timeout/);
    });
});

t.test('a bare id works as well as a uri', async t => {
    await withCache(async dir => {
        const {out, io} = sink();
        t.equal(await inspect(['--cache', dir, ID], io), 0);
        t.match(out.join(''), /connection timeout/);
    });
});

t.test('--json prints the stored record verbatim', async t => {
    await withCache(async dir => {
        const {out, io} = sink();
        await inspect(['--cache', dir, '--json', ID], io);
        t.equal((JSON.parse(out.join('')) as LogRecord).service, 'hub');
    });
});

t.test('an unknown reference exits 1 and says so', async t => {
    await withCache(async dir => {
        const {err, io} = sink();
        t.equal(await inspect(['--cache', dir, '01J0000000000000000000000000'], io), 1);
        t.match(err.join(''), /unknown reference/);
    });
});

t.test('a pruned record is only distinguishable when the caller asserts it was retained', async t => {
    // `older` really was retained and then pruned by the bound. The store keeps
    // no trace of it, so no lookup can recover the fact: without an assertion
    // the CLI must report the same thing it reports for an id that never existed
    // (exit 1). `--expect-retained` is the caller stating what the store cannot
    // know, and it is the only route to exit 2.
    const older = record(OLDER_ID, 1);
    const newer = record(NEWER_ID, 2);
    await withCache(
        async (dir, cache) => {
            // The premise the test's name claims: both writes landed and the
            // bound evicted one of them. `dropped` is what separates a prune
            // from the second `put` having silently done nothing — in that case
            // the single entry would fit the bound and `dropped` would be 0.
            t.same(cache.stats(), {size: 1, dropped: 1}, 'older was retained and then pruned');

            const {err, io} = sink();
            t.equal(await inspect(['--cache', dir, OLDER_ID], io), 1);
            t.match(err.join(''), /unknown reference/);

            t.equal(await inspect(['--cache', dir, '--expect-retained', OLDER_ID], io), 2);
            t.match(err.join(''), /not retained/);

            // The assertion does not change the answer for a record still held.
            t.equal(await inspect(['--cache', dir, '--expect-retained', NEWER_ID], io), 0);
        },
        [older, newer],
        1,
    );
});

t.test('a missing cache directory is a usage error, not a crash', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-cli-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const {err, io} = sink();
    const code = await inspect(['--cache', join(dir, 'nested', 'missing'), ID], io);
    t.equal(code, 3);
    t.match(err.join(''), /cache not found/);
});

t.test('a cache path that is not a directory is a usage error, not a crash', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-cli-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const file = join(dir, 'not-a-cache');
    await writeFile(file, 'not a directory');
    const {err, io} = sink();
    // The path exists, so an existence check alone accepts it; passing it to the
    // store would reject with ENOTDIR and land the process on exit 1.
    t.equal(await inspect(['--cache', file, ID], io), 3);
    t.match(err.join(''), /cache path is not a directory/);
});

t.test('a cache path that cannot be inspected is a usage error, not a crash', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-cli-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    // A symlink pointing at itself. Resolving it raises ELOOP for every user,
    // whether or not the suite runs as root — unlike a `chmod 000` directory,
    // which a root-owned process reads anyway. `throwIfNoEntry: false` suppresses
    // ENOENT only, so this throw is what the guard around `statSync` must hold.
    const loop = join(dir, 'loop');
    await symlink(loop, loop);
    const {err, io} = sink();
    t.equal(await inspect(['--cache', loop, ID], io), 3);
    t.match(err.join(''), /cannot inspect cache path/);
});

t.test('a cache that cannot be laid out is a usage error, not a crash', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-cli-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    // A plain file where `records/` must go makes the store's `mkdir` reject.
    await writeFile(join(dir, 'records'), 'not a directory');
    const {err, io} = sink();
    t.equal(await inspect(['--cache', dir, ID], io), 3);
    t.match(err.join(''), /cannot open cache/);
});

t.test('an unknown option is a usage error', async t => {
    const {err, io} = sink();
    t.equal(await inspect(['--nope', ID], io), 3);
    t.match(err.join(''), /unknown option/);
});

t.test('a bare --cache is a usage error', async t => {
    const {err, io} = sink();
    t.equal(await inspect(['--cache'], io), 3);
    t.match(err.join(''), /needs a directory/);
});

t.test('a command line with no reference is a usage error', async t => {
    const {err, io} = sink();
    t.equal(await inspect([], io), 3);
    t.match(err.join(''), /a reference or id is required/);
    // The usage text explains what `--expect-retained` asserts, because that flag
    // is what decides between the unknown (1) and pruned (2) answers.
    t.match(err.join(''), /--expect-retained\s+the reference was retained/);
});

t.test('toId strips a scheme prefix and leaves anything else alone', t => {
    t.equal(toId(ID), ID, 'a bare id is already an id');
    t.equal(toId(`semantic-log://record/${ID}`), ID, 'a record uri yields its id');
    t.equal(toId('semantic-log://record'), 'record', 'a kind with no id yields the kind');
    t.end();
});

t.test('parseInspectArgs resolves the defaults and the flags', t => {
    const plain = parseInspectArgs([ID]);
    t.ok(plain.ok, 'a bare reference parses');
    if (plain.ok) {
        t.equal(plain.args.reference, ID);
        t.equal(plain.args.dir, join(homedir(), '.semantic-log', 'cache'));
        t.equal(plain.args.json, false);
        t.equal(plain.args.expectRetained, false);
    }

    const flagged = parseInspectArgs(['--json', '--expect-retained', '--cache', '/tmp/cache', ID]);
    t.ok(flagged.ok, 'flags parse');
    if (flagged.ok) {
        t.equal(flagged.args.json, true);
        t.equal(flagged.args.expectRetained, true);
        t.equal(flagged.args.dir, '/tmp/cache');
    }
    t.end();
});

/** The payload the reference cases resolve, and an id no store holds. */
const PAYLOAD_ID = '01J8Z9K2M9PQRSTVWXYZ0A1B2E';
const ABSENT_ID = '01J8Z9K2M9PQRSTVWXYZ0A1B2F';
const PAYLOAD_VALUE = {endpoint: 'https://example.test/quotes', retries: 3};

/** A store holding payloads, laid out the way the logger leaves them. */
async function withPayloads(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-cli-'));
    try {
        const cache = await openCache({dir, limit: 10});
        await cache.putPayload(PAYLOAD_ID, 1, JSON.stringify(PAYLOAD_VALUE));
        await cache.close();
        await fn(dir);
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
}

t.test('a payload reference resolves through the payload half of the store', async t => {
    await withPayloads(async dir => {
        const {out, io} = sink();
        const code = await inspect(['--cache', dir, `semantic-log://payload/${PAYLOAD_ID}`], io);
        t.equal(code, 0, 'a retained payload resolves');
        // The value itself is printed, indented — the same value the HTTP
        // surface returns, so the two surfaces carry the same detail.
        t.match(out.join(''), /example\.test/, 'the payload body is printed');
        t.match(out.join(''), /\n {2}"retries"/, 'the readable mode is indented');
    });
});

t.test('--json prints a payload compactly, not indented', async t => {
    await withPayloads(async dir => {
        const {out, io} = sink();
        t.equal(await inspect(['--cache', dir, '--json', `semantic-log://payload/${PAYLOAD_ID}`], io), 0);
        t.same(JSON.parse(out.join('')), PAYLOAD_VALUE, 'the value parses back unchanged');
        t.notMatch(out.join(''), /\n {2}"/, 'nothing is indented in the machine-readable mode');
    });
});

t.test('an unknown payload exits 1, and 2 when it was expected to be retained', async t => {
    await withPayloads(async dir => {
        const {err, io} = sink();
        t.equal(await inspect(['--cache', dir, `semantic-log://payload/${ABSENT_ID}`], io), 1);
        t.match(err.join(''), /unknown reference/);

        const expected = sink();
        const code = await inspect(
            ['--cache', dir, '--expect-retained', `semantic-log://payload/${ABSENT_ID}`],
            expected.io,
        );
        t.equal(code, 2, 'a payload the caller expects to be retained reports the same as a record');
        t.match(expected.err.join(''), /not retained/);
    });
});

t.test('a scheme with no kind keeps the record kind', async t => {
    await withPayloads(async dir => {
        const {err, io} = sink();
        // `semantic-log://<id>` names no kind, so the id keeps the record kind
        // and is never read out of the payload store — which here holds only
        // `PAYLOAD_ID`, so an id it does not hold is simply unknown.
        const code = await inspect(['--cache', dir, `semantic-log://${ID}`], io);
        t.equal(code, 1, 'a reference with no kind resolves as an unknown record');
        t.match(err.join(''), /unknown reference/);
    });
});
