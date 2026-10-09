import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {ARTIFACT_READY, fetchCommand} from '../../../artifact.ts';

/**
 * server/test/test/testArtifactFetch.ts — placing the artifact the operator plans from.
 *
 * The operator does not hold the code for the suite it reconciles: the plan comes from that suite's
 * own artifact, loaded in a short-lived child (D-395, T-234). Before the child runs, the artifact
 * has to be on disk, which is this handler's whole job — and the properties that matter are the
 * ones a cluster exercises every interval: a local artifact is read where it is, and a cached one is
 * not downloaded again.
 *
 * Nothing here reaches the network: a `path` artifact and a cache hit are both local states.
 *
 * Registered as the `test.artifact.fetch` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}, handler: {kustomizeArtifactFetch}}) => ({
    testArtifactFetch: ({name = 'artifact fetch'}: {name?: string} = {}) =>
        group(name)([
            async function aPathArtifactIsUsedWhereItIs(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const dir = mkdtempSync(join(tmpdir(), 'kustomize-artifact-'));
                try {
                    const suiteDir = join(dir, 'suite');
                    mkdirSync(suiteDir, {recursive: true});
                    writeFileSync(join(suiteDir, 'create-links.js'), '// link script');
                    const answer = (await kustomizeArtifactFetch(
                        {
                            suite: 'demo',
                            version: '1',
                            artifact: {source: 'path', path: suiteDir},
                        },
                        $meta,
                    )) as {dir: string; fetched: boolean; source: string};
                    assert.equal(answer.dir, suiteDir, 'a local artifact is read where it is');
                    assert.equal(answer.fetched, false, 'and nothing is copied for it');
                    assert.equal(answer.source, 'path', 'which the answer says');
                } finally {
                    rmSync(dir, {recursive: true, force: true});
                }
            },

            async function aCachedArtifactIsNotFetchedAgain(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                // A cache hit is what keeps a watch event and the interval behind it from downloading
                // the same archive twice: the marker says the unpack and the link step both finished.
                // Not a file from the archive — `create-links.js` is unpacked early, so a directory
                // that has it may still be missing the suite it is supposed to hold (F-406).
                const root = mkdtempSync(join(tmpdir(), 'kustomize-cache-'));
                try {
                    const cached = join(root, 'demo', '2');
                    mkdirSync(cached, {recursive: true});
                    writeFileSync(join(cached, ARTIFACT_READY), '');
                    writeFileSync(join(cached, 'create-links.js'), '// link script');
                    const answer = (await kustomizeArtifactFetch(
                        {
                            suite: 'demo',
                            version: '2',
                            artifact: {source: 'url', url: 'http://example.invalid/suite.zip'},
                            cacheDir: root,
                        },
                        $meta,
                    )) as {dir: string; fetched: boolean};
                    assert.equal(answer.dir, cached, 'the cached directory is the one handed back');
                    assert.equal(answer.fetched, false, 'and no fetch command ran for it');
                } finally {
                    rmSync(root, {recursive: true, force: true});
                }
            },

            async function aVersionIsPartOfTheCacheKey(assert: IAssert, {$meta}: {$meta: IMeta}) {
                // Two versions of one suite are two directories: a deployment that rolls back has to read
                // the artifact it rolled back to, not whichever one a sibling path happens to hold.
                // Nothing is cached for version 4, so the fetch runs — against a closed port, so it fails
                // at once and without a name to resolve, which is all this case needs.
                const root = mkdtempSync(join(tmpdir(), 'kustomize-cache-'));
                try {
                    const cached = join(root, 'demo', '3');
                    mkdirSync(cached, {recursive: true});
                    writeFileSync(join(cached, ARTIFACT_READY), '');
                    writeFileSync(join(cached, 'create-links.js'), '// link script');
                    await assert.rejects(
                        async () =>
                            kustomizeArtifactFetch(
                                {
                                    suite: 'demo',
                                    version: '4',
                                    artifact: {source: 'url', url: 'http://127.0.0.1:9/suite.zip'},
                                    cacheDir: root,
                                },
                                $meta,
                            ),
                        /curl|connect/i,
                        'another version fetches rather than reusing a sibling directory',
                    );
                } finally {
                    rmSync(root, {recursive: true, force: true});
                }
            },

            async function anArtifactIsPartOfTheCacheKey(assert: IAssert, {$meta}: {$meta: IMeta}) {
                // The same version, different files: a dev cluster redeploys under an unchanged version
                // all the time, and a rebuild is a *new* artifact. Keyed by suite and version alone the
                // marker from the first fetch answered the second, so the operator went on planning from
                // the archive it had already seen while the CLI published a tree nothing kept (F-452).
                // The key now carries the artifact's identity, which is the name its volume gets too.
                const root = mkdtempSync(join(tmpdir(), 'kustomize-cache-'));
                try {
                    const cached = join(root, 'demo', '5-a1b2c3d4');
                    mkdirSync(cached, {recursive: true});
                    writeFileSync(join(cached, ARTIFACT_READY), '');
                    writeFileSync(join(cached, 'create-links.js'), '// link script');
                    const same = (await kustomizeArtifactFetch(
                        {
                            suite: 'demo',
                            version: '5',
                            artifact: {
                                source: 'url',
                                url: 'http://127.0.0.1:9/suite.zip',
                                digest: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
                            },
                            cacheDir: root,
                        },
                        $meta,
                    )) as {dir: string; fetched: boolean};
                    assert.equal(
                        same.dir,
                        cached,
                        'the artifact names the directory it is cached in',
                    );
                    assert.equal(same.fetched, false, 'so the same artifact is not fetched twice');
                    // Another artifact of the same version is a different directory, and the older one's
                    // marker does not stand in for it — so the fetch runs. Against a closed port, so it
                    // fails at once and without a name to resolve, which is all this case needs.
                    await assert.rejects(
                        async () =>
                            kustomizeArtifactFetch(
                                {
                                    suite: 'demo',
                                    version: '5',
                                    artifact: {
                                        source: 'url',
                                        url: 'http://127.0.0.1:9/suite.zip',
                                        digest: '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
                                    },
                                    cacheDir: root,
                                },
                                $meta,
                            ),
                        /curl|connect/i,
                        'a rebuilt artifact of one version fetches rather than reusing its sibling',
                    );
                } finally {
                    rmSync(root, {recursive: true, force: true});
                }
            },

            async function aFetchPrunesOnlyWhenToldHowManyToKeep(assert: IAssert) {
                // One directory per published artifact is one full unpack, so a cache that only grows
                // eventually fills the claim it lives on (T-286). The count is the volume's own, and it
                // is optional because the other caller of this command — the `shared` backend's seed Job —
                // fills a claim at its mount point, where the neighbours are not ours to remove.
                const artifact = {source: 'url', url: 'http://127.0.0.1:9/suite.zip'} as const;
                const target = '/cache/demo/1.0.0-a1b2c3d4';
                const pruned = fetchCommand(artifact, target, 3);
                assert.ok(
                    pruned.includes('cd "/cache/demo"') && pruned.includes('tail -n +4'),
                    'a fetch with a count keeps the newest three directories beside its target',
                );
                assert.ok(
                    !pruned.includes('cd "/cache"'),
                    'and prunes the suite directory rather than the whole cache root',
                );
                const unpruned = fetchCommand(artifact, target);
                assert.ok(!unpruned.includes('tail -n +'), 'a fetch with no count removes nothing');
            },

            async function anArtifactWithNoSourceIsRefused(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                // A CR that names neither a url nor a path is a generation nobody can satisfy, and it has
                // to say so rather than plan from whatever happens to be in the cache.
                await assert.rejects(
                    async () => kustomizeArtifactFetch({suite: 'demo', version: '1'}, $meta),
                    /names no artifact/,
                    'an artifact with no source is refused',
                );
            },
        ]),
}));
