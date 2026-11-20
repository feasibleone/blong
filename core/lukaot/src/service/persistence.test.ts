/**
 * The JSON snapshot: what survives a restart, and what a bad file may not cost.
 *
 * The rules pinned here are the ones a loader has to get right or the service starts empty over a
 * real file: a missing file is nothing to restore, every other read failure is reported, and a file
 * that parses but is not a ledger is refused rather than half-read.
 */

import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import type {FlowUnion} from './flowLedger.ts';
import type {SignalEntry} from './ledger.ts';
import {loadSnapshot, saveSnapshot, SnapshotError} from './persistence.ts';

const entry: SignalEntry = {
    ref: 'agentTicketSkipped',
    message: 'ticket was not claimed',
    service: 'agent',
    level: 30,
    levelName: 'warn',
    count: 2,
    firstSeen: 100,
    lastSeen: 200,
    exemplars: [],
    intents: [],
    declared: true,
};

const union: FlowUnion = {kind: 'transfer.single', executions: 2, services: ['agent'], legs: []};

async function directory(t: {teardown: (fn: () => Promise<void>) => void}): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), 'lukaot-snapshot-'));
    t.teardown(async () => {
        await import('node:fs/promises').then(fs => fs.rm(path, {recursive: true, force: true}));
    });
    return path;
}

void t.test('a saved snapshot is read back as it was written', async t => {
    const path = join(await directory(t), 'snapshot.json');
    await saveSnapshot(path, {entries: [entry], kinds: [union]});

    const loaded = await loadSnapshot(path);
    t.same(loaded?.entries, [entry], 'the ledger came back');
    t.same(loaded?.kinds, [union], 'and the per-kind union with it');
    t.end();
});

void t.test('a missing file is nothing to restore, not a fault', async t => {
    const path = join(await directory(t), 'absent.json');
    t.equal(await loadSnapshot(path), undefined);
    t.end();
});

void t.test('the write is atomic, so no temp file is left behind', async t => {
    const path = join(await directory(t), 'snapshot.json');
    await saveSnapshot(path, {entries: [entry], kinds: []});
    const fs = await import('node:fs/promises');
    const names = await fs.readdir(join(path, '..'));
    t.same(names, ['snapshot.json'], 'one file, named for what it is');
    t.end();
});

void t.test('concurrent saves settle on the last one asked for', async t => {
    const path = join(await directory(t), 'snapshot.json');
    // The second save is handed a *different* entry: whichever rename finished last, the file must
    // describe the snapshot taken last, not the one the filesystem happened to settle on.
    await Promise.all([
        saveSnapshot(path, {entries: [entry], kinds: []}),
        saveSnapshot(path, {entries: [{...entry, ref: 'second'}], kinds: []}),
    ]);
    const loaded = await loadSnapshot(path);
    t.equal(loaded?.entries[0]?.ref, 'second', 'the later snapshot won');
    t.end();
});

void t.test('a file that is not JSON is quarantined as corrupt', async t => {
    const path = join(await directory(t), 'snapshot.json');
    await writeFile(path, 'not json at all');
    const failure = await loadSnapshot(path).catch((error: unknown) => error);
    t.type(failure, SnapshotError);
    t.equal((failure as SnapshotError).fault, 'corrupt');
    t.end();
});

void t.test('a snapshot from another version is unsupported, not corrupt', async t => {
    const path = join(await directory(t), 'snapshot.json');
    await writeFile(path, JSON.stringify({version: 99, entries: [], kinds: []}));
    const failure = await loadSnapshot(path).catch((error: unknown) => error);
    t.equal(
        (failure as SnapshotError).fault,
        'unsupported',
        'a valid file from a version we do not read',
    );
    t.end();
});

void t.test('a file that parses but is not a ledger is refused', async t => {
    const path = join(await directory(t), 'snapshot.json');
    for (const body of [
        [],
        7,
        {version: 1, entries: 'nope', kinds: []},
        {version: 1, entries: [null], kinds: []},
        {version: 1, entries: [], kinds: [{kind: 'x'}]},
    ]) {
        await writeFile(path, JSON.stringify(body));
        const failure = await loadSnapshot(path).catch((error: unknown) => error);
        t.equal((failure as SnapshotError).fault, 'corrupt', `refused: ${JSON.stringify(body)}`);
    }
    t.end();
});

void t.test(
    'an entry with no reference is refused, because the key would be undefined',
    async t => {
        const path = join(await directory(t), 'snapshot.json');
        await writeFile(
            path,
            JSON.stringify({version: 1, entries: [{service: 'agent', count: 1}], kinds: []}),
        );
        const failure = await loadSnapshot(path).catch((error: unknown) => error);
        t.match((failure as Error).message, /no string reference/);
        t.end();
    },
);

void t.test('the written file names no embedding provider', async t => {
    const path = join(await directory(t), 'snapshot.json');
    await saveSnapshot(path, {entries: [entry], kinds: []});
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    t.same(
        Object.keys(parsed).sort(),
        ['entries', 'kinds', 'version'],
        'there is no vector to explain',
    );
    t.equal(parsed.version, 1);
    t.end();
});
