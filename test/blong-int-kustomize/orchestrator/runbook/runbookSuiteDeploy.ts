#!/usr/bin/env -S node
/**
 * runbook/runbookSuiteDeploy.ts — deploy a suite's generated kustomize tree to a multi-node k3d
 * cluster and check the result.
 *
 * The runbook, as a handler: `blong-int-kustomize suite deploy` is the CLI's way in, the developer's
 * cycle composes it with the machine half, and a caller that has its own image and artifacts reaches
 * it through the framework. It builds nothing and fetches nothing — its image and its artifacts come
 * from wherever the caller points it — and it never creates a cluster it did not find, because a run
 * pointed at one that is not there has to say so rather than build a second (F-446).
 *
 * The cluster is created only if it is missing, and the framework image must already be pullable by it
 * — a build needs a container runtime the CI runner owns rather than the cluster, which is the other
 * half of the pair (`runbookMachinePrepare`).
 */
import {handler} from '@feasibleone/blong';
import {fileURLToPath} from 'node:url';

import {overlayOf} from '../../lib/artifacts.ts';
import {
    backingServicesCheck,
    externalNameAliasReport,
    migrationStepRan,
    noSemlogReference,
    podsOnNodesReport,
    portalChecks,
    suiteVersionDirectoryReport,
} from '../../lib/checks.ts';
import {
    applyTree,
    clusterEnsure,
    nodeNames,
    rolloutRestart,
    rolloutStatus,
    waitForWorkloads,
} from '../../lib/cluster.ts';
import {fail, handlerIo, type IStepIo} from '../../lib/exec.ts';
import {keysEnsure, keysEnsureAroundRollout} from '../../lib/keys.ts';
import {artifactSourceError} from '../../lib/rules.ts';
import {operatorTreeGenerate, suiteTreeGenerate} from '../../lib/trees.ts';

/** The repository root, taken from where this file is rather than from `git`. */
const root = fileURLToPath(new URL('../../../..', import.meta.url)).replace(/\/$/, '');

export interface IRunbookOptions {
    cluster: string;
    namespace: string;
    /** The suite's entry, relative to the working directory the tree is generated in. */
    suiteEntry: string;
    /** Where the suite's tree is written, relative to the working directory. */
    tree: string;
    agents: number;
    serviceOff?: string;
    frameworkImage: string;
    frameworkVersion: string;
    /** Where the operator's own install tree is written; the tenant tree is `tree`. */
    operatorTree: string;
    operatorArtifactUrl?: string;
    /**
     * What the published artifacts *are*, as opposed to where they are.
     *
     * The publisher computes them (the machine half has just written the archives) and the tree turns
     * them into the names a volume and an attempt are given (D-469, D-471). An artifact nobody stamped
     * falls back to its version, which is what a released deployment whose CR names no digest gets.
     */
    suiteDigest?: string;
    operatorDigest?: string;
    /** Drop the caches and restart everything, so the cluster runs what was just published. */
    refresh: boolean;
    /** Whether this run may create its cluster: CI says so with `CREATE_CLUSTER=1`. */
    createCluster: boolean;
    /** The credential the login round trip is checked with, when the cluster was seeded with one. */
    credentials?: {user?: string; password?: string};
}

export const runbookOptions = (env = process.env): IRunbookOptions => ({
    cluster: env['CLUSTER'] ?? 'blong-e2e',
    namespace: env['NAMESPACE'] ?? 'blong-suite',
    suiteEntry: env['SUITE_ENTRY'] ?? './index.ts',
    tree: env['TREE'] ?? 'system/kustomize',
    agents: Number(env['AGENTS'] ?? 1),
    serviceOff: env['SERVICE_OFF'] || undefined,
    frameworkImage: env['FRAMEWORK_IMAGE'] ?? 'docker.io/library/blong-gogo',
    frameworkVersion: env['FRAMEWORK_VERSION'] ?? '1',
    operatorTree: env['OPERATOR_TREE'] ?? `${root}/realm/blong-kustomize/system/operator`,
    operatorArtifactUrl: env['OPERATOR_ARTIFACT_URL'] || undefined,
    suiteDigest: env['ARTIFACT_DIGEST'] || undefined,
    operatorDigest: env['OPERATOR_ARTIFACT_DIGEST'] || undefined,
    refresh: env['REFRESH'] !== '0',
    createCluster: env['CREATE_CLUSTER'] === '1',
    credentials: {user: env['BLONG_TEST_USER'], password: env['BLONG_TEST_PASSWORD']},
});

/**
 * The half a running cluster keeps: the pods a published artifact replaces.
 *
 * A cluster keeps what it already fetched *and* what it already started: a pod keeps executing the code
 * it began with, so a pod that does not restart keeps serving the previous artifact even after the
 * directory beside it changed. There is nothing to re-fetch — the volume is named after the artifact, so
 * a changed one is a *different* directory and a fill Job the tree itself applies (D-469, D-470) — which
 * is why this restarts the processes and nothing else. On an empty cluster it is a no-op, which is why
 * it runs unconditionally rather than behind a flag; `REFRESH=0` is for a run that only wants the
 * objects applied.
 */
const workloadRefresh = async (options: IRunbookOptions, io: IStepIo): Promise<void> => {
    if (!options.refresh) return;
    io.say('refresh');
    await rolloutRestart({namespace: 'blong-system', resource: 'deployment/blong-operator'}, io);
    await rolloutRestart({namespace: options.namespace, resource: 'deployment'}, io);
    await rolloutStatus({namespace: 'blong-system', resource: 'deployment/blong-operator'}, io);
};

/** The whole run, from the cluster to the last assertion. */
export const runK3dE2e = async (options: IRunbookOptions, io: IStepIo): Promise<void> => {
    io.say(`cluster ${options.cluster}`);
    await clusterEnsure(
        {
            cluster: options.cluster,
            agents: options.agents,
            create: options.createCluster,
        },
        io,
    );
    await nodeNames(io);
    await runK3dE2eGenerated(options, io);
};

/**
 * The part a caller that already published its artifacts runs.
 *
 * Split out because that is exactly the split the two halves have: a developer's cycle brings its own
 * image and artifacts and then runs this, and a CI job that installed this revision a moment ago runs
 * this alone. Nothing here talks to `podman`, `rush` or the host.
 */
export const runK3dE2eGenerated = async (options: IRunbookOptions, io: IStepIo): Promise<void> => {
    io.say(`generate ${options.tree}`);
    await suiteTreeGenerate(
        {
            root,
            entry: options.suiteEntry,
            tree: options.tree,
            serviceOff: options.serviceOff,
            digest: options.suiteDigest,
        },
        io,
    );

    io.say('install the operator');
    // One operator per cluster (Phase 15 A): its tree carries the Deployment, the cluster-scoped rights
    // and the CRD, which a suite tree deliberately does not. Regenerated here rather than applied from
    // the repository, because the committed tree names the published framework image while a CI cluster
    // is given its own.
    await operatorTreeGenerate(
        {
            root,
            outputDir: options.operatorTree,
            frameworkImage: options.frameworkImage,
            version: options.frameworkVersion,
            artifactUrl: options.operatorArtifactUrl,
            digest: options.operatorDigest,
        },
        io,
    );
    // The pair a namespace shares is written *before* the pods that read it: the operator would create
    // it on its own reconcile pass, but its pod serves the deployment UI from its first start, and a
    // tenant's Deployments applied a moment before that pass would run on the framework's per-process
    // fallback until they restarted. Written again after the rollout, because an operator pod from the
    // previous revision keeps reconciling until it is gone (T-252, T-278).
    await keysEnsureAroundRollout(
        {
            root,
            namespace: 'blong-system',
            rollout: async () => {
                // The overlay, not the tree: a split tree's `local/` is what composes the base with the
                // values this deploy owns (D-475).
                await applyTree({tree: overlayOf(options.operatorTree)}, io);
                await rolloutStatus(
                    {namespace: 'blong-system', resource: 'deployment/blong-operator'},
                    io,
                );
            },
        },
        io,
    );

    io.say('apply');
    // The Secret goes in before the pods that read it, and the write makes its own namespace first: a
    // Secret cannot be written into one that is not there yet, and the tree applied next carries that
    // Namespace too, so the create is the same object arriving a moment early.
    await keysEnsure({root, namespace: options.namespace}, io);
    await applyTree({tree: overlayOf(options.tree)}, io);
    await workloadRefresh(options, io);

    io.say('wait');
    await waitForWorkloads({namespace: options.namespace}, io);

    io.say('the release step ran');
    await migrationStepRan({namespace: options.namespace}, io);

    io.say('portals');
    await portalChecks({namespace: options.namespace, credentials: options.credentials}, io);

    io.say('pods on which nodes');
    await podsOnNodesReport({namespace: options.namespace}, io);

    io.say('a released process renders no semlog reference');
    await noSemlogReference({namespace: options.namespace}, io);

    io.say('services');
    await io.run('kubectl', ['-n', options.namespace, 'get', 'services']);
    io.say('external name alias');
    await externalNameAliasReport({namespace: options.namespace}, io);

    io.say('the services the deployment brought with it');
    await backingServicesCheck(
        {namespace: options.namespace, tree: options.tree, serviceOff: options.serviceOff},
        io,
    );

    io.say('suite version directory on each node');
    await suiteVersionDirectoryReport({namespace: options.namespace}, io);
};

/** What a run reports back: where it went, and that it finished. */
export interface IRunbookReport {
    cluster: string;
    namespace: string;
    tree: string;
    done?: boolean;
    prepared?: boolean;
}

/**
 * runbook.suite.deploy — the runbook, as one handler.
 *
 * What it reports is what it was pointed at; what it *says* travels through the framework's logger, so
 * a run is read in the log viewer rather than only in a scrollback.
 */
export default handler(() => ({
    async runbookSuiteDeploy(params: Partial<IRunbookOptions> = {}): Promise<IRunbookReport> {
        const io = handlerIo(this);
        // A flag is an override, not the only way in: the environment carries what CI sets, and what
        // the command line names is applied over it.
        const options: IRunbookOptions = {
            ...runbookOptions(),
            ...Object.fromEntries(
                Object.entries(params).filter(([, value]) => value !== undefined),
            ),
        };
        const wrongSource = artifactSourceError({
            artifactUrl: process.env['ARTIFACT_URL'],
            artifactPath: process.env['ARTIFACT_PATH'],
        });
        if (wrongSource) fail(wrongSource, 2);
        await runK3dE2e(options, io);
        io.log(`tear down with: k3d cluster delete ${options.cluster}`);
        return {
            cluster: options.cluster,
            namespace: options.namespace,
            tree: options.tree,
            done: true,
        };
    },
}));
