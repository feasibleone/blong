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
import {inspect, parseInspectArgs, toId} from '../bin/semantic-log-inspect.ts';
import {openCache, type RecordCache} from '../src/cache.ts';
import type {LogRecord} from '../src/record.ts';

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

t.test(
    'a pruned record is only distinguishable when the caller asserts it was retained',
    async t => {
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
    },
);

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

t.test('a cache that cannot be opened is a usage error, not a crash', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-cli-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    // A read-only open lays nothing out, so the only thing left that can fail is
    // the store reporting a failure of its own. That is mocked rather than
    // provoked: provoking it would mean asserting an errno belonging to `cacache`
    // rather than to this program, which is not the property under test.
    const {inspect: inspectFailing} = await t.mockImport<
        typeof import('../bin/semantic-log-inspect.ts')
    >('../bin/semantic-log-inspect.ts', {
        '../src/cache.ts': {
            openCache: async () => {
                throw new Error('store unavailable');
            },
            cacheRecordIds: async () => [],
        },
    });
    const {err, io} = sink();
    t.equal(await inspectFailing(['--cache', dir, ID], io), 3);
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
        t.equal(
            await inspect(['--cache', dir, '--json', `semantic-log://payload/${PAYLOAD_ID}`], io),
            0,
        );
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
        t.equal(
            code,
            2,
            'a payload the caller expects to be retained reports the same as a record',
        );
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

// --- the diagram verb (R22/R23) ---------------------------------------------

const FLOW = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

/**
 * The unit a fixture's leg names first.
 *
 * The legs here are written the way they were before the caller became a field of its own
 * (`payer.quote.rates`), and the fixture states the caller from one so the records stay
 * shaped like the wire and the expectations read as they always did.
 */
function callerOf(leg: string | undefined): string | undefined {
    if (leg === undefined) return undefined;
    const at = leg.search(/[./]/);
    return at < 0 ? leg : leg.slice(0, at);
}

/** A record that belongs to one call, with what only the local store knows. */
function callRecord(
    id: string,
    leg: string | undefined,
    flow: {
        id?: string;
        kind?: string;
        from?: string;
        to?: string;
        seq?: string;
        step?: string;
        service?: string;
    },
    extra: Partial<LogRecord> = {},
): LogRecord {
    return {
        ...record(id),
        // The emitter: `payer` by default, and `hub` for the *receipt* of a call the payer made.
        service: flow.service ?? 'payer',
        flow: {
            id: flow.id ?? FLOW,
            kind: flow.kind ?? 'transfer.single',
            ...(leg === undefined ? {} : {leg, legFrom: flow.from ?? callerOf(leg)}),
            ...(flow.to === undefined ? {} : {legTo: flow.to}),
            ...(flow.seq === undefined ? {} : {legSeq: flow.seq}),
            ...(flow.step === undefined ? {} : {step: flow.step}),
        },
        ...extra,
    };
}

t.test('the diagram verb draws one execution from the store alone (R23)', async t => {
    // No service, no ledger, no network: what a developer has left after the run is the store, and
    // it is enough to see the call the records were about — plus the two things the service can
    // never see, the branch rationale and the withheld categories (R10/R11).
    const records = [
        callRecord(
            ID,
            'payer.quote.rates',
            {to: 'hub', seq: '1', step: 'quote'},
            {
                decision: {
                    discriminator: 'quote-acceptable',
                    candidates: ['reject', 'accept'],
                    chosen: 'accept',
                    values: {},
                },
                fields: {withheld: [{time: 1, fields: {routing: {fxp: 'fxp-primary'}}}]},
            },
        ),
        callRecord(OLDER_ID, 'payer.quote.rates', {seq: '1', step: 'quote', service: 'hub'}),
        // A record of the flow that carries no call: it is a participant, not an arrow.
        callRecord(NEWER_ID, undefined, {id: FLOW, service: 'hub'}),
    ];
    await withCache(async dir => {
        const {out, io} = sink();
        t.equal(await inspect(['diagram', '--cache', dir, FLOW], io), 0, 'the execution was drawn');
        const drawn = out.join('');
        t.match(
            drawn,
            /^%% [^\n]*\nsequenceDiagram\n/,
            'as a mermaid sequence diagram, headed by what one store cannot know',
        );
        t.match(
            drawn,
            /Note over payer: decision: quote-acceptable → accept/,
            'with the rationale the wire never carried',
        );
        t.match(
            drawn,
            /Note over payer: withheld: routing/,
            'and the categories that were withheld',
        );
        t.match(drawn, /payer->>hub: payer\.quote\.rates/, 'one arrow for the call');
        t.equal(
            drawn.split('\n').filter(line => line.startsWith('    participant ')).length,
            2,
            'and both participants, the record without a call included',
        );
    }, records);
});

t.test('the diagram verb draws a kind, and refuses a reference nothing matches (R23)', async t => {
    const records = [
        callRecord(ID, 'payer.quote.rates', {to: 'hub', seq: '1'}),
        callRecord(OLDER_ID, 'payer.quote.rates', {seq: '1', service: 'hub'}),
    ];
    await withCache(async dir => {
        const {out, io} = sink();
        t.equal(
            await inspect(['diagram', '--cache', dir, 'transfer.single'], io),
            0,
            'the kind was drawn',
        );
        t.match(out.join(''), /payer->>hub: payer\.quote\.rates/);

        const {err, io: missing} = sink();
        t.equal(
            await inspect(['diagram', '--cache', dir, 'transfer.inter'], missing),
            1,
            'an unobserved kind is exit 1',
        );
        t.match(err.join(''), /no records for kind transfer\.inter/);

        const {err: unknownFlowError, io: unknownFlow} = sink();
        t.equal(
            await inspect(['diagram', '--cache', dir, '01ARZ3NDEKTSV4RRFFQ69G5FAZ'], unknownFlow),
            1,
        );
        t.match(unknownFlowError.join(''), /no records for flow/);
    }, records);
});

t.test('the diagram verb drops a leg the grammar rejects, exactly as the wire does', async t => {
    // A hand-edited or older store must not be able to put a label into a diagram that the code
    // could not have produced: the same rule the ingest applies to a peer's value.
    const records = [
        callRecord(ID, 'payer.quote.rates', {to: 'hub', seq: '1'}),
        callRecord(OLDER_ID, 'payer.quote.rates', {seq: '1', service: 'hub'}),
        callRecord(NEWER_ID, 'not a leg!', {to: 'hub', seq: '2'}),
    ];
    await withCache(async dir => {
        const {out, io} = sink();
        t.equal(await inspect(['diagram', '--cache', dir, FLOW], io), 0);
        t.notMatch(out.join(''), /not a leg!/, 'the malformed id is not in the diagram');
        t.match(out.join(''), /payer->>hub: payer\.quote\.rates/, 'while the call beside it is');
    }, records);
});

t.test('the diagram verb prints a machine-readable envelope with --json', async t => {
    const records = [
        callRecord(ID, 'payer.quote.rates', {to: 'hub', seq: '1'}),
        callRecord(OLDER_ID, 'payer.quote.rates', {seq: '1', service: 'hub'}),
    ];
    await withCache(async dir => {
        const {out, io} = sink();
        t.equal(await inspect(['diagram', '--cache', dir, '--json', FLOW], io), 0);
        const body = JSON.parse(out.join('')) as {
            id: string;
            source: string;
            observed: {legs: string[]};
            diagram: string;
        };
        t.equal(body.id, FLOW, 'the envelope names what it drew');
        t.same(body.observed.legs, ['payer.quote.rates'], 'and the calls it drew');
        t.match(
            body.diagram,
            /^%% [^\n]*\nsequenceDiagram\n/,
            'with the diagram and the one-store caveat',
        );
        t.equal(body.source, 'cache', 'and the envelope says which store it came from');
    }, records);
});

t.test('the diagram verb takes a verb where a verb goes, and rejects the rest (usage)', t => {
    t.same(parseInspectArgs(['diagram', 'transfer.single']).ok, true, 'the verb and its reference');
    t.same(
        (parseInspectArgs(['diagram', 'transfer.single']) as {args: {verb: string}}).args.verb,
        'diagram',
        'read as the diagram verb',
    );
    t.same(
        (parseInspectArgs(['01J8Z9K2M9PQRSTVWXYZ0A1B2C']) as {args: {verb: string}}).args.verb,
        'record',
        'while a bare reference keeps the default verb',
    );
    t.match(
        (parseInspectArgs(['diagram']) as {message: string}).message,
        /a flow id or kind is required/,
        'a verb with nothing to draw is a usage error',
    );
    t.match(
        (parseInspectArgs(['diagram', 'one', 'two']) as {message: string}).message,
        /unexpected argument two/,
        'and two references is one too many',
    );
    t.end();
});

t.test('the diagram verb summarises withheld bags by category, without repeating one', async t => {
    // A withheld bag is attached to whatever record escalates, and several bags can name the same
    // category (the hub withholds `liquidity`, then `liquidity` and `settlement` on a refusal).
    // The note is a label, so a category appears once — and it is drawn over the participant whose
    // record carried the bag, because that is who withheld. A bag attached with no fields names
    // nothing, which is not the same as naming an empty thing.
    const records = [
        callRecord(
            ID,
            'hub.transfer.deliver',
            {to: 'payee', seq: '1', service: 'hub'},
            {
                fields: {
                    withheld: [
                        {time: 1, fields: {liquidity: {reserved: 100}}},
                        {
                            time: 2,
                            fields: {liquidity: {reserved: 100}, settlement: {attempted: 100}},
                        },
                        {time: 3},
                    ],
                },
            },
        ),
        callRecord(OLDER_ID, 'hub.transfer.deliver', {seq: '1', service: 'payee'}),
    ];
    await withCache(async dir => {
        const {out, io} = sink();
        t.equal(await inspect(['diagram', '--cache', dir, FLOW], io), 0);
        t.match(
            out.join(''),
            /Note over hub: withheld: liquidity, settlement/,
            'each category once, in order',
        );
    }, records);
});

t.test('the diagram verb names a kind in its envelope too', async t => {
    const records = [
        callRecord(ID, 'payer.quote.rates', {to: 'hub', seq: '1'}),
        callRecord(OLDER_ID, 'payer.quote.rates', {seq: '1', service: 'hub'}),
    ];
    await withCache(async dir => {
        const {out, io} = sink();
        t.equal(await inspect(['diagram', '--cache', dir, '--json', 'transfer.single'], io), 0);
        const body = JSON.parse(out.join('')) as {kind?: string; id?: string};
        t.equal(body.kind, 'transfer.single', 'a kind is named as a kind, not as an execution');
        t.equal(body.id, undefined, 'and not as an id it does not have');
    }, records);
});
