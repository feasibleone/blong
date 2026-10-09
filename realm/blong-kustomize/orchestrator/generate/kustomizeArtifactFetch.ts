import {handler} from '@feasibleone/blong';
import {execFile} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {artifactDir, artifactReady, fetchCommand} from '../../artifact.ts';
import type {IPlanConfig, ISuiteArtifact} from '../../plan.ts';

const run = promisify(execFile);

/**
 * Fetches in flight, by target directory.
 *
 * The watch and the interval both trigger passes, so two of them can want the same artifact at the
 * same time — and two fetches into one directory are two `rm -rf`s and two `unzip`s racing over the
 * same tree, which is how a generation read a half-written artifact (F-407). A caller that arrives
 * while a fetch is running waits for it instead of starting a second one; the map is per process,
 * which is enough because the operator is the only writer of its own cache.
 */
const inFlight = new Map<string, Promise<{dir: string; fetched: boolean; source: 'url'}>>();

/**
 * kustomize.artifact.fetch — place the artifact a CR names, and say where it is.
 *
 * The operator reconciles a CR it does not hold the code for: the plan for a suite comes from *that
 * suite's* artifact, loaded in a short-lived child (D-395, T-234). This is the step before the
 * child: the artifact is fetched once and cached, keyed the way the volume is — by suite, version and
 * the artifact's own identity.
 *
 * The cache used to be keyed by suite and version, and that made a rebuilt artifact invisible: the
 * marker from the first fetch answered the second, so an operator went on planning from the archive it
 * had already seen while the CLI that published the new one applied a tree nothing would keep (F-452).
 * A cache key that names the artifact is what makes "the same version, different files" two
 * directories rather than one (D-468).
 *
 * A `path` artifact is used where it is (a runbook that unpacks by hand, or a node-local volume);
 * a `url` artifact is fetched with the same command the tree's own Job runs, which is also why the
 * cache directory is a mount in a cluster and a directory under `$HOME` on a developer's machine.
 *
 * The fetch also prunes, when it is told how many directories to keep: one directory per published
 * artifact is one full unpack, so a cache that only ever grows is a cache that eventually fills the
 * claim it lives on (T-286).
 */
export default handler(() => ({
    async kustomizeArtifactFetch(params: {
        suite: string;
        version: string;
        artifact?: ISuiteArtifact;
        /** Where artifacts are cached; the realm config's `artifactCacheDir` when absent. */
        cacheDir?: string;
        /** How many artifact directories this suite's cache keeps; nothing is pruned without it. */
        retention?: number;
    }) {
        const self = this as unknown as {config?: IPlanConfig};
        const {suite, version, artifact, cacheDir, retention} = params;
        if (artifact?.source === 'path' && artifact.path) {
            return {dir: artifact.path, fetched: false, source: 'path' as const};
        }
        if (!artifact?.url) {
            throw new Error(
                `the CR names no artifact for ${suite}@${version}: ` +
                    'a url to fetch or a path to read',
            );
        }
        const root =
            cacheDir ?? self.config?.artifactCacheDir ?? join(homedir(), '.blong', 'artifacts');
        const dir = artifactDir(root, suite, version, artifact);
        if (artifactReady(dir)) return {dir, fetched: false, source: 'url' as const};
        const running = inFlight.get(dir);
        if (running) return running;
        // The tree's own fetch, run here rather than in a Job: `curl` and `unzip` are in the
        // framework image for exactly this.
        const fetching = (async () => {
            try {
                await run('sh', ['-c', fetchCommand(artifact, dir, retention)], {
                    maxBuffer: 1024 * 1024,
                });
            } finally {
                inFlight.delete(dir);
            }
            return {dir, fetched: true, source: 'url' as const};
        })();
        inFlight.set(dir, fetching);
        return fetching;
    },
}));
