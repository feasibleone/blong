import {handler} from '@feasibleone/blong';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {artifactDir, artifactReady, fillArtifact} from '../../artifact.ts';
import type {IPlanConfig, ISuiteArtifact} from '../../plan.ts';

/**
 * Fetches in flight, by target directory.
 *
 * The watch and the interval both trigger passes, so two of them can want the same artifact at the
 * same time — and two fetches into one directory are two `rm -rf`s and two `unzip`s racing over the
 * same tree, which is how a generation read a half-written artifact (@@F-407). A caller that arrives
 * while a fetch is running waits for it instead of starting a second one; the map is per process,
 * which is enough because the operator is the only writer of its own cache.
 */
const inFlight = new Map<string, Promise<{dir: string; fetched: boolean; source: 'url'}>>();

/**
 * kustomize.artifact.fetch — place the artifact a CR names, keyed by its identity, and say where it
 * is (@@D-395 @@F-452 @@D-468 @@D-518).
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
        // In this process rather than in a Job: the module fetches, unpacks and links by itself, which is
        // what lets the framework image drop `curl` and `unzip` (@@D-518).
        const fetching = (async () => {
            try {
                await fillArtifact({
                    source: {url: artifact.url},
                    target: dir,
                    // The cache's own retention, which counts this fetch's directory among the ones that
                    // stay .
                    ...(retention === undefined ? {} : {keep: retention}),
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
