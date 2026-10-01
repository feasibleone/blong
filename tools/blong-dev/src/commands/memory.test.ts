/**
 * Unit tests for the `blong-dev memory` command layer (commands/memory.ts).
 *
 * The store is injected through `setHindsightStoreFactory`, so nothing here
 * touches a network, and each case runs the command end to end against a
 * throwaway repository whose `rush.json` makes the temp directory the repo root.
 * These are exactly the seams a hand-run used to be the only coverage for: the
 * write hook surviving an unreachable index, the search filters, the search
 * failure, and the prune that also forgets the document.
 */

import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';

import type {IHindsightDocument} from '../memory/hindsight/hindsightDocument.ts';
import {setHindsightStoreFactory} from '../memory/hindsight/hindsightRuntime.ts';
import type {
    IHindsightDocumentRef,
    IHindsightStore,
    IRecallOptions,
} from '../memory/hindsight/hindsightStore.ts';
import {memory} from './memory.ts';

/** What the injected store was asked to do. */
interface IStoreCalls {
    retained: IHindsightDocument[][];
    recalled: Array<{query: string; options: IRecallOptions | undefined}>;
    removed: string[][];
}

interface IFakeBehaviour {
    /** Fail every call — an unreachable server. */
    fail?: string;
    /** Fail only the listing, so a backfill can still succeed. */
    listFail?: string;
    /** What the bank holds. */
    documents?: IHindsightDocumentRef[];
}

/** A store that records instead of talking, and fails on demand. */
function fakeStore(calls: IStoreCalls, behaviour: IFakeBehaviour = {}): IHindsightStore {
    return {
        url: 'http://hindsight.test:8888',
        bank: 'blong',
        retain: async documents => {
            calls.retained.push([...documents]);
            return behaviour.fail ? {ok: false, reason: behaviour.fail} : {ok: true};
        },
        recall: async (query, options) => {
            calls.recalled.push({query, options});
            return behaviour.fail ? {ok: false, reason: behaviour.fail} : {ok: true, hits: []};
        },
        list: async () => {
            const reason = behaviour.listFail ?? behaviour.fail;
            if (reason) return {ok: false, reason};
            const documents = behaviour.documents ?? [];
            return {ok: true, documents, total: documents.length};
        },
        remove: async ids => {
            calls.removed.push([...ids]);
            return behaviour.fail ? {ok: false, reason: behaviour.fail} : {ok: true};
        },
    };
}

/** One document, as a bank listing reports it. */
function bankDocument(
    id: string,
    tags: string[],
    updatedAt = '2026-09-15T00:00:00Z',
): IHindsightDocumentRef {
    return {id, tags, updatedAt, metadata: null};
}

/** A throwaway repository: `rush.json` is what makes the temp directory the root. */
function tempRepo(): {dir: string; restore: () => void} {
    const dir = mkdtempSync(join(tmpdir(), 'blong-dev-memory-'));
    writeFileSync(join(dir, 'rush.json'), '{"projects": []}');
    const previous = process.cwd();
    process.chdir(dir);
    return {
        dir,
        restore: () => {
            process.chdir(previous);
            rmSync(dir, {recursive: true, force: true});
        },
    };
}

/** A minimal documentation tree and skills tree, for the page sources. */
function seedPages(dir: string): void {
    const docs = join(dir, 'docs/blong/docs/patterns');
    const skills = join(dir, '.github/skills/blong-handler');
    mkdirSync(docs, {recursive: true});
    mkdirSync(skills, {recursive: true});
    writeFileSync(join(docs, 'memory.md'), '# Memory files\n\nHow the notes work.\n');
    writeFileSync(
        join(skills, 'SKILL.md'),
        '---\nname: blong-handler\ndescription: Handlers.\n---\n\n# Handlers\n',
    );
}

interface ICaptured {
    out: string;
    err: string;
    /** The exit code the command set, or `undefined` when it set none. */
    code: number | undefined;
}

/**
 * Run a command with its streams captured.
 *
 * The runner's own stdout must not be reached while the patch is installed, so
 * every case that captures is an awaited subtest of one top-level test.
 */
async function capture(run: () => Promise<void>): Promise<ICaptured> {
    const out: string[] = [];
    const err: string[] = [];
    const originalOut = process.stdout.write;
    const originalErr = process.stderr.write;
    const previousCode = process.exitCode;
    process.exitCode = undefined;
    process.stdout.write = ((chunk: unknown): boolean => {
        out.push(String(chunk));
        return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: unknown): boolean => {
        err.push(String(chunk));
        return true;
    }) as typeof process.stderr.write;
    try {
        await run();
        return {out: out.join(''), err: err.join(''), code: process.exitCode};
    } finally {
        process.stdout.write = originalOut;
        process.stderr.write = originalErr;
        process.exitCode = previousCode;
    }
}

t.test('the memory command layer', async t => {
    t.beforeEach(() => {
        // Each case installs its own store; the default is restored so a failing
        // case cannot leak a fake into the next one.
        setHindsightStoreFactory(null);
    });
    t.afterEach(() => setHindsightStoreFactory(null));

    await t.test('a write survives an index that cannot be reached', async t => {
        const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(() => fakeStore(calls, {fail: 'connect ECONNREFUSED'}));

        const {err, code} = await capture(() =>
            memory([
                'add',
                'friction',
                '--title',
                'A write with no server',
                '--area',
                'cross-cutting',
            ]),
        );

        t.equal(code, undefined, 'the exit code is untouched — the file is what matters');
        t.match(err, /hindsight index skipped/, 'the skipped update is reported once');
        t.match(err, /ECONNREFUSED/, 'and the reason names the cause');
        const written = readFileSync(join(repo.dir, '.github/memory/friction.md'), 'utf8');
        t.match(written, /### F-001 — A write with no server/, 'the entry is written anyway');
        t.equal(calls.retained.length, 1, 'the write still tried to queue the entry');
    });

    await t.test('a write queues the entry it touched, keyed by its id', async t => {
        const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(() => fakeStore(calls));

        await capture(() =>
            memory(['add', 'todo', '--title', 'A queued task', '--area', 'cross-cutting']),
        );

        t.equal(calls.retained.length, 1, 'one retain call for the write');
        t.equal(calls.retained[0]!.length, 1, 'carrying the one entry that changed');
        const document = calls.retained[0]![0]!;
        t.equal(document.documentId, 'T-001', 'the entry id is the upsert key');
        t.ok(document.tags.includes('memory'), 'the entry carries the memory tag');
        t.ok(document.tags.includes('kind:todo'), 'the kind is a tag');
        t.ok(document.tags.includes('status:open'), 'the status is a tag');
        t.ok(document.tags.includes('id:T-001'), 'so is the id, for a tag-only reader');
    });

    await t.test('a search that cannot reach the index fails with a start hint', async t => {
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(() =>
            fakeStore(
                {retained: [], recalled: [], removed: []},
                {fail: 'connect ECONNREFUSED 127.0.0.1:8888'},
            ),
        );

        const {err, code} = await capture(() => memory(['search', 'connection pool']));

        t.equal(code, 1, 'a search the caller asked for fails loudly');
        t.match(err, /cannot reach the Hindsight index at/, 'the message names the failure');
        t.match(err, /hindsight\.sh/, 'and points at how to start the server');
    });

    await t.test('search filters become the tags the server can match on', async t => {
        const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(() => fakeStore(calls));

        const {code} = await capture(() =>
            memory([
                'search',
                'connection pool',
                '--kind',
                'friction',
                '--area',
                'cross-cutting',
                '--status',
                'open',
                '--limit',
                '3',
            ]),
        );

        t.equal(code, undefined, 'a search that worked sets no failure');
        t.equal(calls.recalled.length, 1, 'one recall');
        t.equal(calls.recalled[0]!.query, 'connection pool', 'the query reaches the store');
        t.same(
            calls.recalled[0]!.options?.tags,
            ['memory', 'kind:friction', 'area:cross-cutting', 'status:open'],
            'every filter is a tag, in a fixed order',
        );
        t.equal(calls.recalled[0]!.options?.limit, 3, '--limit reaches the store');
    });

    await t.test('an unknown kind is refused before the index is asked', async t => {
        const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(() => fakeStore(calls));

        const {err, code} = await capture(() => memory(['search', 'anything', '--kind', 'nope']));

        t.equal(code, 1, 'the command fails');
        t.match(err, /unknown kind/, 'and says why');
        t.equal(calls.recalled.length, 0, 'nothing was sent to the server');
    });

    await t.test('prune takes the entry out of the bank too', async t => {
        const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(() => fakeStore(calls));

        await capture(() =>
            memory(['add', 'friction', '--title', 'A duplicate', '--area', 'cross-cutting']),
        );
        const {code} = await capture(() =>
            memory(['prune', 'F-001', '--reason', 'duplicated by F-090']),
        );

        t.equal(code, undefined, 'the prune succeeded');
        t.same(calls.removed, [['F-001']], 'the document is forgotten, not just unlinked');
        const written = readFileSync(join(repo.dir, '.github/memory/friction.md'), 'utf8');
        t.notMatch(written, /### F-001/, 'and the entry leaves the file');
    });

    await t.test('a prune that cannot reach the index still removes the entry', async t => {
        const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(null);

        await capture(() =>
            memory(['add', 'friction', '--title', 'Another duplicate', '--area', 'cross-cutting']),
        );
        setHindsightStoreFactory(() => fakeStore(calls, {fail: 'no answer within 5s'}));
        const {err, code} = await capture(() =>
            memory(['prune', 'F-001', '--reason', 'superseded']),
        );

        t.equal(code, undefined, 'an unreachable index does not fail the prune');
        t.match(err, /hindsight index skipped/, 'it is reported instead');
        const written = readFileSync(join(repo.dir, '.github/memory/friction.md'), 'utf8');
        t.notMatch(written, /### F-001/, 'the entry is still gone from the file');
    });

    await t.test('a search for pages asks with the page tag, not the entry tag', async t => {
        const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(() => fakeStore(calls));

        const {code} = await capture(() =>
            memory(['search', 'how do the notes work', '--source', 'docs']),
        );

        t.equal(code, undefined, 'the search succeeded');
        t.same(
            calls.recalled[0]!.options?.tags,
            ['type:documentation'],
            'a page search never carries the entry tag, so it cannot drift back to entries',
        );
        t.end();
    });

    await t.test('a search across sources asks with a tag group', async t => {
        const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(() => fakeStore(calls));

        await capture(() => memory(['search', 'anything', '--source', 'entry,docs']));

        t.same(
            calls.recalled[0]!.options?.tagGroups,
            [{or: [{tags: ['memory']}, {tags: ['type:documentation']}]}],
            'the sources are alternatives — a flat list would be an AND and match nothing',
        );
        t.notOk(calls.recalled[0]!.options?.tags, 'the flat form is not sent beside the tree');
        t.end();
    });

    await t.test('an entry-only filter beside a page source is refused', async t => {
        const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(() => fakeStore(calls));

        const {err, code} = await capture(() =>
            memory(['search', 'anything', '--source', 'docs', '--kind', 'friction']),
        );

        t.equal(code, 1, 'the combination is an error');
        t.match(err, /--kind, --area and --status describe entries/, 'and it says why');
        t.equal(
            calls.recalled.length,
            0,
            'nothing was sent — an empty answer would have hidden it',
        );
        t.end();
    });

    await t.test('a page ingest sends the pages under their own ids and tags', async t => {
        const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
        const repo = tempRepo();
        t.teardown(repo.restore);
        seedPages(repo.dir);
        setHindsightStoreFactory(() => fakeStore(calls));

        const {out, code} = await capture(() =>
            memory(['index', '--semantic', '--sources', 'docs,skill', '--dry-run']),
        );
        t.equal(code, undefined, 'the dry run succeeded');
        t.match(
            out,
            /would ingest 2 document\(s\) — 1 documentation pages, 1 skills/,
            'the count is broken down by stream',
        );
        t.equal(calls.retained.length, 0, 'a dry run touches nothing');

        await capture(() => memory(['index', '--semantic', '--sources', 'docs,skill']));
        const documents = calls.retained.flat();
        t.same(
            documents.map(document => document.documentId).sort(),
            ['doc-patterns-memory', 'skill-blong-handler'],
            'the page ids are the upsert keys',
        );
        const page = documents.find(document => document.documentId === 'doc-patterns-memory')!;
        t.ok(page.tags.includes('type:documentation'), 'a page carries the documentation tag');
        t.notOk(page.tags.includes('memory'), 'and not the entry tag');
        t.end();
    });

    await t.test('a named file that is not a page is refused', async t => {
        const repo = tempRepo();
        t.teardown(repo.restore);
        seedPages(repo.dir);
        setHindsightStoreFactory(() => fakeStore({retained: [], recalled: [], removed: []}));

        const {err, code} = await capture(() =>
            memory(['index', '--semantic', '--sources', 'docs', '--files', 'notes.txt']),
        );

        t.equal(code, 1, 'the run is refused');
        t.match(err, /none of the named files is a documentation page or a skill/, 'and says why');
        t.end();
    });

    await t.test('reopening a decision drops the supersession line it no longer has', async t => {
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(null);

        await capture(() =>
            memory(['add', 'decision', '--title', 'The first choice', '--area', 'cross-cutting']),
        );
        await capture(() =>
            memory(['add', 'decision', '--title', 'The second choice', '--area', 'cross-cutting']),
        );
        await capture(() =>
            memory(['close', 'D-001', '--by', 'D-002', '--reason', 'the union is gone']),
        );
        const closed = readFileSync(join(repo.dir, '.github/memory/decision.md'), 'utf8');
        t.match(closed, /Superseded by `D-002`\./, 'closing records the successor');

        const {out, code} = await capture(() => memory(['reopen', 'D-001']));

        t.equal(code, undefined, 'the reopen succeeded');
        t.match(out, /no longer claims a successor/, 'and says the line was dropped');
        const reopened = readFileSync(join(repo.dir, '.github/memory/decision.md'), 'utf8');
        t.notMatch(reopened, /Superseded by `D-002`\./, 'the active entry claims no successor');
        t.match(reopened, /### D-001/, 'the entry itself survives');
        t.match(
            reopened,
            /the union is gone/,
            'the free-text reason stays — it is prose an author wrote',
        );
        t.end();
    });

    await t.test(
        'a backfill reports the bank beside the tree, and --stats names the drift',
        async t => {
            const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
            const repo = tempRepo();
            t.teardown(repo.restore);
            setHindsightStoreFactory(null);
            await capture(() =>
                memory(['add', 'friction', '--title', 'A kept entry', '--area', 'cross-cutting']),
            );
            calls.retained.length = 0;
            setHindsightStoreFactory(() =>
                fakeStore(calls, {
                    documents: [
                        bankDocument('F-900', ['memory', 'kind:friction']),
                        bankDocument('doc-patterns-memory', ['type:documentation']),
                    ],
                }),
            );

            const {out, code} = await capture(() => memory(['index', '--semantic', '--stats']));

            t.equal(code, undefined, 'a report is not a failure');
            t.match(
                out,
                /bank holds 1 document\(s\) of this source, tree holds 1/,
                'only the documents of this source are compared',
            );
            t.match(
                out,
                /# stale: F-900 \(2026-09-15, friction\)/,
                '--stats names the bank-only document',
            );
            t.notMatch(out, /doc-patterns-memory/, 'a document of another source is not touched');
            t.same(calls.removed, [], '--stats deletes nothing');
        },
    );

    await t.test('--prune deletes the bank documents the tree no longer holds', async t => {
        const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
        const repo = tempRepo();
        t.teardown(repo.restore);
        setHindsightStoreFactory(null);
        await capture(() =>
            memory(['add', 'friction', '--title', 'A kept entry', '--area', 'cross-cutting']),
        );
        setHindsightStoreFactory(() =>
            fakeStore(calls, {
                documents: [
                    bankDocument('F-900', ['memory', 'kind:friction']),
                    bankDocument('F-001', ['memory', 'kind:friction']),
                ],
            }),
        );

        const {out, code} = await capture(() => memory(['index', '--semantic', '--prune']));

        t.equal(code, undefined, 'the prune succeeded');
        t.same(calls.removed, [['F-900']], 'only the document the tree no longer holds is deleted');
        t.match(out, /# pruned F-900/, 'and each removal is named');
    });

    await t.test(
        'a prune that cannot read the bank fails rather than reporting nothing',
        async t => {
            const calls: IStoreCalls = {retained: [], recalled: [], removed: []};
            const repo = tempRepo();
            t.teardown(repo.restore);
            setHindsightStoreFactory(null);
            await capture(() =>
                memory(['add', 'friction', '--title', 'A kept entry', '--area', 'cross-cutting']),
            );
            setHindsightStoreFactory(() => fakeStore(calls, {listFail: 'no answer within 30s'}));

            const {err, code} = await capture(() => memory(['index', '--semantic', '--prune']));

            t.equal(code, 1, 'a repair that did not happen is a failure');
            t.match(err, /hindsight index skipped/, 'and the reason is reported');
            t.same(calls.removed, [], 'nothing was deleted on a partial read');
        },
    );
});
