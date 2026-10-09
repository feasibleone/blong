#!/usr/bin/env -S node
/**
 * runbook/runbookMachinePrepare.ts — everything that has to happen outside the cluster.
 *
 * The runbook takes its image and its artifacts from wherever the caller points it; a developer's
 * machine has neither, so this is the half that talks to the machine rather than to the cluster: the
 * cluster itself, the suite's browser bundle, the framework image, the file server the artifacts are
 * fetched from, and the two deploys. It stops before the runbook — `runbook.cycle.run` is what joins
 * the two, which is what keeps each of them callable on its own.
 *
 * Everything it changes on the machine it asks about first (`ASSUME_YES=1` to skip the questions, and
 * `BUILD_SUITE=0` / `BUILD_IMAGE=0` / `PUBLISH_ARTIFACTS=0` to leave a step out).
 */
import {handler} from '@feasibleone/blong';
import {fileURLToPath} from 'node:url';

import {
    artifactPublish,
    artifactServerCreate,
    artifactServerExists,
    artifactServerPod,
    rushDeploy,
    SCENARIO_ARCHIVE,
    SCENARIO_FOLDER,
    zipFolder,
} from '../../lib/artifacts.ts';
import {clusterEnsure, clusterExists, nodeNames} from '../../lib/cluster.ts';
import {confirm, fail, handlerIo, onPath, type IStepIo} from '../../lib/exec.ts';
import {frameworkImagePublish, nginxImagePublish} from '../../lib/images.ts';
import {runbookOptions, type IRunbookOptions, type IRunbookReport} from './runbookSuiteDeploy.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url)).replace(/\/$/, '');

/** The registry reference the file server's image is imported under. */
const NGINX_IMAGE = 'docker.io/library/nginx:alpine';

/** What the machine half needs beyond the runbook's own options. */
export interface ICycleOptions extends IRunbookOptions {
    suitePackage: string;
    localImage: string;
    artifactService: string;
    artifactNamespace: string;
    buildSuite: boolean;
    buildImage: boolean;
    publishArtifacts: boolean;
}

export const cycleOptions = (env = process.env): ICycleOptions => ({
    ...runbookOptions(env),
    suitePackage: env['SUITE_PACKAGE'] ?? 'suite/blong-suite',
    localImage: env['LOCAL_IMAGE'] ?? `localhost/blong-gogo:${env['FRAMEWORK_VERSION'] ?? '1'}`,
    artifactService: env['ARTIFACT_SERVICE'] ?? 'blong-artifact',
    artifactNamespace: env['ARTIFACT_NAMESPACE'] ?? 'default',
    buildSuite: env['BUILD_SUITE'] !== '0',
    buildImage: env['BUILD_IMAGE'] !== '0',
    publishArtifacts: env['PUBLISH_ARTIFACTS'] !== '0',
});

/** The browser bundle the deploy is supposed to carry, built before it is deployed. */
const suiteBundle = async (options: ICycleOptions, io: IStepIo): Promise<void> => {
    if (!options.buildSuite) return;
    io.say('suite bundle');
    await io.run('npm', ['run', 'build'], {cwd: `${root}/${options.suitePackage}`});
};

/**
 * The file server the artifacts are fetched from.
 *
 * The prefetch is `curl` inside a pod, so the artifact has to be reachable by Service name. A cluster
 * that already serves one is left alone; one that does not gets the smallest thing that works — and
 * its image is imported before the Deployment exists, because a kubelet with no local copy and no
 * registry to reach would sit in `ImagePullBackOff` until the wait gave up.
 */
const fileServer = async (options: ICycleOptions, nodes: string[], io: IStepIo): Promise<void> => {
    io.say('file server');
    const where = {service: options.artifactService, namespace: options.artifactNamespace};
    if (await artifactServerExists(where, io)) {
        io.log(`${options.artifactService}.${options.artifactNamespace} exists`);
        return;
    }
    if (!(await confirm(`create an nginx Deployment and Service as ${options.artifactService}`))) {
        fail('create it, or point ARTIFACT_SERVICE at the one that serves artifacts');
    }
    // nginx comes from the registry, which a cluster with no egress cannot reach either: the image is
    // imported the same way the framework's is, from the host's copy.
    await nginxImagePublish({reference: NGINX_IMAGE, nodes, archive: '/tmp/nginx-cycle.tar'}, io);
    await artifactServerCreate(where, io);
};

/** Both scenarios, because the operator and the tenant run from different artifacts (D-438's neighbourhood). */
const artifacts = async (options: ICycleOptions, io: IStepIo): Promise<void> => {
    if (!options.publishArtifacts) return;
    io.say('artifacts');
    const pod = await artifactServerPod(
        {service: options.artifactService, namespace: options.artifactNamespace},
        io,
    );
    for (const [scenario, remoteName, digestEnv] of [
        ['operator', 'kustomize.zip', 'OPERATOR_ARTIFACT_DIGEST'],
        ['suite', 'suite.zip', 'ARTIFACT_DIGEST'],
    ] as Array<[string, string, string]>) {
        await rushDeploy({root, scenario, targetFolder: SCENARIO_FOLDER(scenario)}, io);
        const digest = await zipFolder(
            {folder: SCENARIO_FOLDER(scenario), archive: SCENARIO_ARCHIVE(scenario)},
            io,
        );
        // The digest travels the way the URLs do — through the environment, because the two halves are
        // two handlers and the seam between them is what the machine half leaves behind: what the
        // artifact *is* names the volume it lands in and the attempt that runs from it (D-469, D-471),
        // so a caller that published has to say so, or the tree falls back to the version and a rebuilt
        // artifact under an unchanged version would reuse the directory the previous one filled.
        process.env[digestEnv] = digest;
        io.log(`${remoteName}: ${digest.slice(0, 12)}…`);
        await artifactPublish(
            {
                namespace: options.artifactNamespace,
                pod,
                archive: SCENARIO_ARCHIVE(scenario),
                remoteName,
            },
            io,
        );
    }
    io.log(`published kustomize.zip and suite.zip to ${pod}`);
};

/**
 * runbook.machine.prepare — everything that has to happen outside the cluster.

 */
export default handler(() => ({
    async runbookMachinePrepare(flags: Partial<ICycleOptions> = {}): Promise<IRunbookReport> {
        const io = handlerIo(this);
        const params: ICycleOptions = {
            ...cycleOptions(),
            ...Object.fromEntries(Object.entries(flags).filter(([, value]) => value !== undefined)),
        };
        for (const tool of ['k3d', 'podman', 'kubectl']) {
            if (!onPath(tool)) fail(`${tool} is not on PATH`);
        }

        // The cluster comes first because the host steps below need its nodes: an image has to reach
        // every one of them, and a node added later would run a pod from an empty store. Creating one
        // is asked for rather than assumed — a run that forgot `CLUSTER` used to answer by building a
        // second cluster (F-446).
        io.say(`cluster ${params.cluster}`);
        if (!(await clusterExists(params.cluster, io))) {
            if (!(await confirm(`create it with ${params.agents} agent node(s)`))) {
                fail('create it, or point CLUSTER at one that exists');
            }
            await clusterEnsure({cluster: params.cluster, agents: params.agents, create: true}, io);
        }
        const nodes = await nodeNames(io);

        await suiteBundle(params, io);

        if (params.buildImage) {
            io.say('framework image');
            await frameworkImagePublish(
                {
                    root,
                    dockerfile: `${root}/core/blong-gogo/docker/blong-gogo.Dockerfile`,
                    localImage: params.localImage,
                    frameworkImage: params.frameworkImage,
                    version: params.frameworkVersion,
                    nodes,
                    archive: '/tmp/blong-gogo-cycle.tar',
                },
                io,
            );
        }

        await fileServer(params, nodes, io);
        await artifacts(params, io);

        io.say('the cycle');
        // From the suite's own folder, which is where a tree is generated: the framework reads its
        // configuration relative to the working directory it was started in. The file server's Service
        // name is the artifact URL, because the prefetch that fetches it runs inside a pod.
        process.chdir(`${root}/${params.suitePackage}`);
        const host = `http://${params.artifactService}.${params.artifactNamespace}.svc.cluster.local`;
        process.env['ARTIFACT_URL'] = process.env['ARTIFACT_URL'] ?? `${host}/suite.zip`;
        process.env['OPERATOR_ARTIFACT_URL'] =
            process.env['OPERATOR_ARTIFACT_URL'] ?? `${host}/kustomize.zip`;
        return {
            cluster: params.cluster,
            namespace: params.namespace,
            tree: params.tree,
            prepared: true,
        };
    },
}));
