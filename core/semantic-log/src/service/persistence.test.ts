import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t, {type Test} from 'tap';
import type {FlowUnion} from './flowLedger.ts';
import {loadSnapshot, saveSnapshot, SnapshotError, type Snapshot} from './persistence.ts';
import {providerIdentity} from './provider.ts';
import type {TemplateEntry} from './registry.ts';

/** The identity the running service embeds with, in these tests. */
const PROVIDER = providerIdentity({kind: 'offline'});

/** Another one, for the snapshot that must not be restored here. */
const OTHER = providerIdentity({kind: 'local'});

const entry: TemplateEntry = {
    ref: 'ffff0000ffff',
    fingerprint: 'ffff0000ffff0000ffff0000ffff0000',
    signature: 'sig',
    service: 'hub',
    count: 3,
    firstSeen: 1,
    lastSeen: 9,
    exemplars: ['01A'],
    alerts: {noveltyAt: 1},
    intents: ['User_Transfer'],
    centroid: [0.5, 0.5],
};

/** One observed kind, as the ledger publishes it. */
const union: FlowUnion = {
    kind: 'transfer.single',
    executions: 2,
    services: ['payer', 'hub'],
    legs: [
        {
            leg: 'payer.quote.rates',
            count: 2,
            first: 1,
            last: 9,
            step: 'quote',
            seq: '1',
            services: ['payer', 'hub'],
            ends: [{caller: 'payer', callee: 'hub', count: 2, observed: 2}],
        },
    ],
};

/** A throwaway directory, removed when the test ends. */
async function scratch(t: Test): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-persist-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    return dir;
}

/** Write a snapshot the way the service does. */
function save(path: string, snapshot: Partial<Snapshot> = {}): Promise<void> {
    return saveSnapshot(path, {provider: PROVIDER, entries: [entry], kinds: [union], ...snapshot});
}

/** A snapshot body as JSON, for the files a writer did not produce. */
function body(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        version: 2,
        provider: PROVIDER,
        entries: [entry],
        kinds: [union],
        ...overrides,
    });
}

/**
 * The fault a load reports, for the cases whose *reason* is the assertion.
 *
 * Not `t.rejects` with a validator: that form compares the error rather than running a
 * check on it, so an assertion written this way fails with tap's own `instanceof` error
 * instead of reporting which fault it saw.
 */
async function faultOf(t: Test, path: string): Promise<string | undefined> {
    try {
        const loaded = await loadSnapshot(path, PROVIDER);
        t.fail(`the snapshot was loaded: ${JSON.stringify(loaded)}`);
        return undefined;
    } catch (error) {
        if (error instanceof SnapshotError) {
            return error.fault;
        }
        t.fail(`the snapshot failed for a reason that is not a fault: ${String(error)}`);
        return undefined;
    }
}

t.test('a snapshot round-trips (PRD R4 durability)', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await save(path);
    t.same(await loadSnapshot(path, PROVIDER), {
        provider: PROVIDER,
        entries: [entry],
        kinds: [union],
    });
});

t.test('the observed calls survive a restart with the registry (D17)', async t => {
    // The unions are the one diagram surface a restart cannot re-derive: one
    // execution's steps are of interest only while it is recent, while a kind's calls
    // are what every execution of it added up to.
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await save(path);
    const loaded = await loadSnapshot(path, PROVIDER);
    t.same(loaded?.kinds, [union], 'the unions, whole');
    t.same(loaded?.kinds[0]?.legs[0]?.services, ['payer', 'hub'], 'including who logged each call');
});

t.test('a missing snapshot is nothing to restore, not an error', async t => {
    const dir = await scratch(t);
    t.equal(await loadSnapshot(join(dir, 'nope.json'), PROVIDER), undefined);
});

t.test('a corrupt snapshot is reported, not silently ignored', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await writeFile(path, '{not json');
    await t.rejects(loadSnapshot(path, PROVIDER), /snapshot is not valid JSON/);
});

t.test('a snapshot that is not a registry object is reported', async t => {
    const dir = await scratch(t);
    // Valid JSON, wrong shape. Each is reported rather than read as an empty
    // registry: an empty answer would be saved back over the file on the next
    // write, destroying whatever it actually held.
    for (const [name, raw] of [
        ['null', 'null'],
        ['a string', '"templates"'],
        ['an array', '[]'],
    ] as const) {
        const path = join(dir, `${name.replace(/ /g, '-')}.json`);
        await writeFile(path, raw);
        await t.rejects(loadSnapshot(path, PROVIDER), /snapshot/, `${name} is reported`);
    }
});

t.test('a version 1 file is quarantined, not migrated (D19)', async t => {
    // Its shape has no identity, so there is nothing to check its vectors against,
    // and the one thing it holds can be rebuilt by the traffic it describes.
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await writeFile(path, JSON.stringify({version: 1, entries: [entry]}));
    t.equal(await faultOf(t, path), 'unsupported', 'and the fault says which file it is');
    await t.rejects(loadSnapshot(path, PROVIDER), /version 1 is not version 2/);
});

t.test('a file that names no provider is reported', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    for (const raw of [body({provider: undefined}), body({provider: {kind: 'offline'}})]) {
        await writeFile(path, raw);
        t.equal(
            await faultOf(t, path),
            'corrupt',
            'a file with no identity is not a file from another provider',
        );
        await t.rejects(loadSnapshot(path, PROVIDER), /names no embedding provider/);
    }
});

t.test('a snapshot from another provider is not restored (D26)', async t => {
    // The numbers would parse, restore and mean nothing: the same text embedded by
    // `sha256-hash` and by a real model shares no geometry at all, and two widths of
    // one provider do not even share a dimension.
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await writeFile(path, body({provider: OTHER}));
    t.equal(
        await faultOf(t, path),
        'provider',
        'a file from another provider is valid, and is not this one',
    );
    await t.rejects(
        loadSnapshot(path, PROVIDER),
        /written by local\/Xenova\/all-MiniLM-L6-v2\/384 and this service embeds with offline\/sha256-hash\/64/,
    );
    // The width alone is enough to make it unusable, and that is the same fault.
    await writeFile(
        path,
        body({provider: {kind: 'offline', model: 'sha256-hash', dimension: 128}}),
    );
    t.equal(await faultOf(t, path), 'provider', 'a different width is a different space');
});

t.test('a snapshot whose entries are not entries is reported', async t => {
    const dir = await scratch(t);
    // Four arrays of "valid JSON, entries shaped wrong". Each is reported rather
    // than read as a registry: `replaceAll` keys by `entry.ref`, so a `null` or
    // a `ref`-less object would install an entry under the key `undefined` and
    // answer a template read with it (FIX 8).
    for (const [name, entries] of [
        ['a null entry', [null]],
        ['a ref-less entry', [{}]],
        ['a numeric ref', [{ref: 42}]],
        ['one good and one bad', [entry, null]],
    ] as const) {
        const path = join(dir, `${name.replace(/ /g, '-')}.json`);
        await writeFile(path, body({entries}));
        await t.rejects(loadSnapshot(path, PROVIDER), /no string reference/, `${name} is reported`);
    }
});

t.test('entries and kinds that are not lists are reported', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await writeFile(path, body({entries: 'templates'}));
    await t.rejects(loadSnapshot(path, PROVIDER), /entries is not an array/);
    await writeFile(path, body({kinds: 'transfer.single'}));
    await t.rejects(loadSnapshot(path, PROVIDER), /kinds is not an array/);
});

t.test('a kind the ledger could not restore is reported', async t => {
    // The bar is safety, not completeness: `restore` builds a Set from each service
    // list and a Map from each end list, so a union whose lists are not lists would
    // throw during boot — the one outcome this module exists to avoid.
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    for (const [name, kinds] of [
        ['a kind with no name', [{services: [], legs: []}]],
        ['a kind with no service list', [{kind: 'transfer.single', legs: []}]],
        ['a kind with no call list', [{kind: 'transfer.single', services: []}]],
        ['a call with no name', [{kind: 'transfer.single', services: [], legs: [{}]}]],
        [
            'a call with no service list',
            [{kind: 'transfer.single', services: [], legs: [{leg: 'a.b', ends: []}]}],
        ],
        [
            'a call with no end list',
            [{kind: 'transfer.single', services: [], legs: [{leg: 'a.b', services: ['p']}]}],
        ],
        ['a null kind', [{kind: 'transfer.single', services: [], legs: [null]}]],
        ['a null entry in kinds', [null]],
    ] as const) {
        await writeFile(path, body({kinds}));
        t.equal(await faultOf(t, path), 'corrupt', `${name} is reported`);
    }
});

t.test('a snapshot that cannot be read is rethrown, not read as empty', async t => {
    const dir = await scratch(t);
    // A directory is the read failure that is not "missing": reporting it as an
    // empty registry would be the data-loss path (the next save overwrites it).
    await t.rejects(loadSnapshot(dir, PROVIDER), {code: 'EISDIR'});
});

t.test('a loaded snapshot belongs to the caller (no cache behind a read)', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await save(path);
    const first = await loadSnapshot(path, PROVIDER);
    first?.entries[0]?.exemplars.push('smuggled');
    first?.entries[0]?.centroid?.push(9);
    first?.kinds[0]?.services.push('smuggled');
    t.same(
        await loadSnapshot(path, PROVIDER),
        {provider: PROVIDER, entries: [entry], kinds: [union]},
        'a mutation through one read is not visible to the next',
    );
});

t.test('a later save cannot be reverted by an earlier one that finishes late (FIX 7)', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    // The first save is deliberately huge, so its filesystem write takes far
    // longer than the small save submitted behind it. Without the per-path
    // queue both writes race and the *earlier* snapshot's rename lands last,
    // reverting the file; with it, completion order cannot reorder the saves.
    const older: TemplateEntry[] = Array.from({length: 20_000}, (_, index) => ({
        ...entry,
        ref: `older${index}`,
        fingerprint: `older${index}`,
    }));
    const newer: TemplateEntry[] = [{...entry, ref: 'newest', fingerprint: 'newest'}];
    const first = save(path, {entries: older});
    const second = save(path, {entries: newer});
    await Promise.all([first, second]);

    const loaded = await loadSnapshot(path, PROVIDER);
    t.equal(
        loaded?.entries.length,
        1,
        'the file holds the last snapshot submitted, not the last one to finish',
    );
    t.equal(loaded?.entries[0]?.ref, 'newest');
});

t.test('a failed publish leaves the previous snapshot intact (FIX 2: atomicity)', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await save(path);

    // Fault-inject only the *publish* step: the temp write is real, the rename
    // that would replace the snapshot fails. Both the rejection and the
    // intact-file assertion go red the moment the atomic write is replaced by a
    // direct `writeFile(path, …)`: the destination would already be truncated
    // and rewritten with the new bytes, and no rename would be attempted at all.
    const realFs = await import('node:fs/promises');
    const {saveSnapshot: saveWithBrokenRename} = await t.mockImport<
        typeof import('./persistence.ts')
    >('./persistence.ts', {
        'node:fs/promises': {
            ...realFs,
            rename: async (): Promise<void> => {
                throw new Error('injected rename failure');
            },
        },
    });

    await t.rejects(
        saveWithBrokenRename(path, {
            provider: PROVIDER,
            entries: [{...entry, count: 99}],
            kinds: [],
        }),
        /injected rename failure/,
        'the save reports its failure',
    );
    t.same(
        (await loadSnapshot(path, PROVIDER))?.entries,
        [entry],
        'the previous snapshot is still intact and loadable',
    );
});

t.test('a failed save does not poison the saves queued behind it (FIX 7)', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await save(path);

    const realFs = await import('node:fs/promises');
    let attempts = 0;
    const {saveSnapshot: saveWithFlakyRename} = await t.mockImport<
        typeof import('./persistence.ts')
    >('./persistence.ts', {
        'node:fs/promises': {
            ...realFs,
            rename: async (from: string, to: string): Promise<void> => {
                attempts++;
                if (attempts === 1) {
                    throw new Error('injected transient rename failure');
                }
                await realFs.rename(from, to);
            },
        },
    });

    await t.rejects(
        saveWithFlakyRename(path, {provider: PROVIDER, entries: [{...entry, count: 2}], kinds: []}),
        /injected transient rename failure/,
    );
    // The queue stores the settlement-tolerant form, so the second save — which
    // takes the rejected one's place at the head of the chain — still lands.
    await saveWithFlakyRename(path, {
        provider: PROVIDER,
        entries: [{...entry, count: 3}],
        kinds: [],
    });
    t.equal(
        (await loadSnapshot(path, PROVIDER))?.entries[0]?.count,
        3,
        'the save behind the rejection ran and won',
    );
});
