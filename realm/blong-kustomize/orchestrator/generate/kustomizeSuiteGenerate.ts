import {handler, type IMeta} from '@feasibleone/blong';
import {execFile} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {artifactEntry, readKustomizeTree, type KustomizeTree} from '../../generator.ts';
import {OPERATOR_ENV} from '../../operator.ts';
import {DEFAULT_RETENTION, type IBlongDeploymentSpec, type IPlanConfig} from '../../plan.ts';
const run = promisify(execFile);

/** How long a generation may take before the pass reports it rather than waiting on it. */
const GENERATE_TIMEOUT_MILLIS = 180_000;

/** Where generated trees live: a directory per suite (the realm config's `generationRoot` wins). */
const generationRoot = (configured?: string): string =>
    configured ?? join(homedir(), '.blong', 'generations');

/**
 * kustomize.suite.generate — write the tree for a CR, by loading that suite's artifact.
 *
 * This is the piece that lets one operator serve every tenant (D-395, T-234). The plan for a suite
 * is derived from *that suite's* registry — which realms it loads, which layers they expose, which
 * namespaces they answer for — so the process that plans it has to be running that suite's code.
 * The operator does not, and must not: it is installed once per cluster, while the suite it
 * reconciles arrives as an artifact. So the work happens in a short-lived child: this process
 * fetches the artifact (D-398), writes the CR's spec beside it, and runs the framework's own CLI
 * over it with the `k8s` intent, which is the intent that introspects a registry, writes a tree and
 * exits.
 *
 * The child is the CLI this process was launched with (`process.argv[1]`) rather than a name looked
 * up on `PATH`, so the operator generates with the framework version it is running, and not with
 * whatever else is installed beside it. That is the right entry for every process the framework
 * starts — a suite entry, re-run with a different suite and the `k8s` intent.
 *
 * It is the wrong one for the realm's own CLI, whose `argv[1]` is a *realm* command line and not a
 * framework entry: re-running it with a suite entry as its first positional answers with the realm's
 * usage text, so a pass run through `blong-kustomize reconcile --from=cr` fetched its artifact and
 * then died in the child. Hence the override: the CLI names the framework bin it is built on, and
 * everything else keeps the version it was launched with.
 */
export const CHILD_ENTRY_ENV = 'KUSTOMIZE_CHILD_ENTRY';

export default handler(({handler}) => ({
    async kustomizeSuiteGenerate(
        params: {
            spec: IBlongDeploymentSpec;
            /** Where the tree is written; under the realm's `generationRoot` when it is omitted. */
            outputDir?: string;
            /**
             * The tenant: the namespace the CR was declared in. A CR carries it in `metadata`, not in
             * `spec`, so the caller passes it beside the spec — and it is what the tree deploys into,
             * rather than the namespace the operator happens to be configured for.
             */
            namespace?: string;
            /**
             * The suite, which is the CR's own `metadata.name`. Passed beside the spec for the same
             * reason as the namespace, and handed to the child as an argument so a spec file carries
             * no identity at all (Q4).
             */
            name?: string;
            cacheDir?: string;
        },
        $meta: IMeta,
    ): Promise<{outputDir: string; tree: KustomizeTree; artifact: string; files: string[]}> {
        const self = this as unknown as {config?: IPlanConfig};
        const {spec, cacheDir} = params;
        // The suite is the CR's own name, passed beside the namespace it was declared in: neither is
        // in `spec`, because both belong to the object the operator is holding (Q4).
        const suite = params.name ?? '';
        const version = spec.version ?? 'latest';
        const outputDir =
            params.outputDir ?? join(generationRoot(self.config?.generationRoot), suite || 'suite');
        const fetched = (await handler.kustomizeArtifactFetch(
            {
                suite,
                version,
                artifact: spec.suiteVolume?.artifact,
                cacheDir,
                // The same number the volumes are kept by, because the two caches hold the same thing and
                // an operator's cache is per suite (D-471, T-286).
                retention: spec.suiteVolume?.retention ?? DEFAULT_RETENTION,
            },
            $meta,
        )) as {dir: string};

        mkdirSync(outputDir, {recursive: true});
        // Beside the tree, not inside it: the child replaces its output directory when it writes, and
        // a spec living there would be deleted by the very run that is reading it.
        const specFile = `${outputDir}-spec.json`;
        writeFileSync(specFile, JSON.stringify(spec, null, 4));

        const entry = artifactEntry(fetched.dir, spec.entry);
        // The artifact's own entry point, the intent that writes a tree and exits, and the two
        // settings that reach `IPlanConfig`: the spec to plan from and where to put the result.
        const args = [
            entry,
            'k8s',
            `--kustomize.deploy.specFile=${specFile}`,
            `--kustomize.deploy.outputDir=${outputDir}`,
            ...(params.namespace ? [`--kustomize.deploy.suite.namespace=${params.namespace}`] : []),
            ...(params.name ? [`--kustomize.deploy.suite.name=${params.name}`] : []),
        ];
        try {
            // The child is a *generation* run, so it must not inherit the loop. This process is the
            // operator, and the environment that switched its loop on would switch one on in the
            // child as well: a `k8s` run with an interval starts reconciling — it opened a
            // cluster-wide watch of every `BlongDeployment`, failed on it (`listClusterCustomObject`
            // of an undefined client, because a generation run builds no cluster client) and threw,
            // which took the pass down and the operator process with it (T-229's family: a rejected
            // dispatch ends the process rather than failing the call). Strip the keys rather than
            // pass a curated environment: the child needs the pod's environment for everything else
            // — the namespace it resolves names in, the release files it reads.
            const env = {...process.env};
            for (const name of Object.values(OPERATOR_ENV)) delete env[name];
            const child = env[CHILD_ENTRY_ENV]?.trim() || process.argv[1] || '';
            await run(process.execPath, [child, ...args], {
                cwd: fetched.dir,
                env,
                maxBuffer: 32 * 1024 * 1024,
                timeout: GENERATE_TIMEOUT_MILLIS,
            });
        } catch (error) {
            const failure = error as {stdout?: string; stderr?: string; message?: string};
            throw new Error(
                `generating the tree for ${suite}@${version} failed: ${failure.message ?? ''}` +
                    `\n${(failure.stderr ?? '').split('\n').slice(-12).join('\n')}` +
                    `\n${(failure.stdout ?? '').split('\n').slice(-5).join('\n')}`,
            );
        }
        const tree = readKustomizeTree(outputDir);
        return {outputDir, tree, artifact: fetched.dir, files: [...tree.keys()]};
    },
}));
