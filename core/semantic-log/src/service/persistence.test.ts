import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t, {type Test} from 'tap';
import {loadSnapshot, saveSnapshot} from './persistence.ts';
import type {TemplateEntry} from './registry.ts';

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

/** A throwaway directory, removed when the test ends. */
async function scratch(t: Test): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-persist-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    return dir;
}

t.test('a snapshot round-trips (PRD R4 durability)', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await saveSnapshot(path, [entry]);
    t.same(await loadSnapshot(path), [entry]);
});

t.test('a missing snapshot is an empty registry, not an error', async t => {
    const dir = await scratch(t);
    t.same(await loadSnapshot(join(dir, 'nope.json')), []);
});

t.test('a corrupt snapshot is reported, not silently ignored', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await writeFile(path, '{not json');
    await t.rejects(loadSnapshot(path), /snapshot is not valid JSON/);
});

t.test('a snapshot that is not a registry object is reported', async t => {
    const dir = await scratch(t);
    // Four kinds of "valid JSON, wrong shape". Each is reported rather than
    // read as an empty registry: an empty answer would be saved back over the
    // file on the next write, destroying whatever it actually held.
    for (const [name, body] of [
        ['null', 'null'],
        ['a string', '"templates"'],
        ['an array', '[]'],
        ['entries that is not an array', '{"version":1,"entries":"templates"}'],
    ] as const) {
        const path = join(dir, `${name.replace(/ /g, '-')}.json`);
        await writeFile(path, body);
        await t.rejects(loadSnapshot(path), /snapshot/, `${name} is reported`);
    }
});

t.test('a snapshot with no entries field is an empty registry', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await writeFile(path, '{"version":1}');
    t.same(await loadSnapshot(path), []);
});

t.test('a snapshot whose entries are not entries is reported', async t => {
    const dir = await scratch(t);
    // Four arrays of "valid JSON, entries shaped wrong". Each is reported rather
    // than read as a registry: `replaceAll` keys by `entry.ref`, so a `null` or
    // a `ref`-less object would install an entry under the key `undefined` and
    // answer a template read with it (FIX 8).
    for (const [name, body] of [
        ['a null entry', '{"version":1,"entries":[null]}'],
        ['a ref-less entry', '{"version":1,"entries":[{}]}'],
        ['a numeric ref', '{"version":1,"entries":[{"ref":42}]}'],
        ['one good and one bad', JSON.stringify({version: 1, entries: [entry, null]})],
    ] as const) {
        const path = join(dir, `${name.replace(/ /g, '-')}.json`);
        await writeFile(path, body);
        await t.rejects(loadSnapshot(path), /no string reference/, `${name} is reported`);
    }
});

t.test('a snapshot that cannot be read is rethrown, not read as empty', async t => {
    const dir = await scratch(t);
    // A directory is the read failure that is not "missing": reporting it as an
    // empty registry would be the data-loss path (the next save overwrites it).
    await t.rejects(loadSnapshot(dir), {code: 'EISDIR'});
});

t.test('a loaded snapshot belongs to the caller (no cache behind a read)', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await saveSnapshot(path, [entry]);
    const first = await loadSnapshot(path);
    first[0].exemplars.push('smuggled');
    first[0].centroid?.push(9);
    t.same(await loadSnapshot(path), [entry], 'a mutation through one read is not visible to the next');
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
    const first = saveSnapshot(path, older);
    const second = saveSnapshot(path, newer);
    await Promise.all([first, second]);

    const loaded = await loadSnapshot(path);
    t.equal(loaded.length, 1, 'the file holds the last snapshot submitted, not the last one to finish');
    t.equal(loaded[0].ref, 'newest');
});

t.test('a failed publish leaves the previous snapshot intact (FIX 2: atomicity)', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await saveSnapshot(path, [entry]);

    // Fault-inject only the *publish* step: the temp write is real, the rename
    // that would replace the snapshot fails. Both the rejection and the
    // intact-file assertion go red the moment the atomic write is replaced by a
    // direct `writeFile(path, …)`: the destination would already be truncated
    // and rewritten with the new bytes, and no rename would be attempted at all.
    const realFs = await import('node:fs/promises');
    const {saveSnapshot: saveWithBrokenRename} = await t.mockImport<typeof import('./persistence.ts')>(
        './persistence.ts',
        {
            'node:fs/promises': {
                ...realFs,
                rename: async (): Promise<void> => {
                    throw new Error('injected rename failure');
                },
            },
        },
    );

    await t.rejects(
        saveWithBrokenRename(path, [{...entry, count: 99}]),
        /injected rename failure/,
        'the save reports its failure',
    );
    t.same(await loadSnapshot(path), [entry], 'the previous snapshot is still intact and loadable');
});

t.test('a failed save does not poison the saves queued behind it (FIX 7)', async t => {
    const dir = await scratch(t);
    const path = join(dir, 'registry.json');
    await saveSnapshot(path, [entry]);

    const realFs = await import('node:fs/promises');
    let attempts = 0;
    const {saveSnapshot: saveWithFlakyRename} = await t.mockImport<typeof import('./persistence.ts')>(
        './persistence.ts',
        {
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
        },
    );

    await t.rejects(saveWithFlakyRename(path, [{...entry, count: 2}]), /injected transient rename failure/);
    // The queue stores the settlement-tolerant form, so the second save — which
    // takes the rejected one's place at the head of the chain — still lands.
    await saveWithFlakyRename(path, [{...entry, count: 3}]);
    t.equal((await loadSnapshot(path))[0].count, 3, 'the save behind the rejection ran and won');
});
