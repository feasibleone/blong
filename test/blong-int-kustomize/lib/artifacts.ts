/**
 * scripts/lib/artifacts.ts — the two deploys a cluster is fed, and how they get there.
 *
 * The operator runs *this* realm from its own artifact and the tenant runs the suite from the other
 * one: a fresh `kustomize.zip` alone leaves a tenant's tree as it was, and a fresh `suite.zip` alone
 * leaves the operator planning with the code it already had (D-438's neighbourhood — the two are
 * published separately and both matter).
 *
 * Both arrive the same way a released deployment gets them: a URL the prefetch DaemonSet `curl`s from
 * inside a pod. That is why a local run needs a file server at all, and why it is the smallest thing
 * that works — a deployment, a Service, and two `kubectl cp` calls.
 */
import {createHash} from 'node:crypto';
import {createReadStream, existsSync, readdirSync} from 'node:fs';

import {fail, type IStepIo} from './exec.ts';

/** Deploy one Rush scenario into a folder. The two scenarios are the operator's and the suite's. */
export const rushDeploy = async (
    {root, scenario, targetFolder}: {root: string; scenario: string; targetFolder: string},
    io: IStepIo,
): Promise<void> => {
    await io.run(
        'node',
        [
            `${root}/common/scripts/install-run-rush.js`,
            'deploy',
            '--scenario',
            scenario,
            '--target-folder',
            targetFolder,
            '--overwrite',
        ],
        {allowFailure: false},
    );
};

/**
 * Zip the *contents* of a folder, and answer with the digest of what was written.
 *
 * The digest is what names the volume the artifact lands in and the attempt that runs from it
 * (D-469, D-471), so a publisher that has it hands it on rather than leaving every reader to guess. It
 * is computed from the archive that exists — the bytes a cluster will fetch — not from the folder it
 * was built from, because the archive is what the cluster has.
 *
 * Python rather than a library: the workspace carries no zip dependency, the interpreter is on every
 * machine that runs a Rush build, and hand-rolling the format would be a worse trade than one call to a
 * tool that is already there. A realm that published artifacts for a living would own this — which is
 * where this function is going.
 */
export const zipFolder = async (
    {folder, archive}: {folder: string; archive: string},
    io: IStepIo,
): Promise<string> => {
    await io.run('rm', ['-f', archive]);
    await io.run('python3', [
        '-c',
        `import shutil; shutil.make_archive(${JSON.stringify(archive.replace(/\.zip$/, ''))}, 'zip', ${JSON.stringify(folder)})`,
    ]);
    return digestOf(archive);
};

/** sha256 of a file, streamed: an artifact is hundreds of megabytes and is not read into memory. */
export const digestOf = async (file: string): Promise<string> => {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
    return hash.digest('hex');
};

/** Whether the artifacts' file server is already there, asked without creating anything. */
export const artifactServerExists = async (
    {service, namespace}: {service: string; namespace: string},
    io: IStepIo,
): Promise<boolean> =>
    (
        await io.capture('kubectl', ['-n', namespace, 'get', 'service', service], {
            allowFailure: true,
        })
    ).length > 0;

/**
 * The nginx the artifacts are served from, created once per cluster.
 *
 * Created only after its image is in every node: the Deployment is waited for, and a kubelet with no
 * local copy and no registry to reach would sit in `ImagePullBackOff` until the wait gave up.
 */
export const artifactServerCreate = async (
    {
        service,
        namespace,
        deployment = 'artifact',
    }: {
        service: string;
        namespace: string;
        deployment?: string;
    },
    io: IStepIo,
): Promise<void> => {
    await io.run('kubectl', [
        '-n',
        namespace,
        'create',
        'deployment',
        deployment,
        '--image=nginx:alpine',
    ]);
    await io.run('kubectl', [
        '-n',
        namespace,
        'expose',
        'deployment',
        deployment,
        `--name=${service}`,
        '--port=80',
    ]);
    await io.run('kubectl', [
        '-n',
        namespace,
        'wait',
        '--for=condition=Available',
        `deployment/${deployment}`,
        '--timeout=180s',
    ]);
};

/**
 * The pod an artifact is copied into.
 *
 * The label is the first answer and not the only one: the server may have been created by hand or by
 * an older revision of this file, and a run that refused to publish because a Deployment carried no
 * `app=artifact` label would be refusing for a reason nothing depends on.
 */
export const artifactServerPod = async (
    {service, namespace}: {service: string; namespace: string},
    io: IStepIo,
): Promise<string> => {
    const selectors = ['app=artifact', `app.kubernetes.io/name=${service}`, ''];
    for (const selector of selectors) {
        const args = ['-n', namespace, 'get', 'pods'];
        if (selector) args.push('-l', selector);
        args.push('-o', 'name');
        const listed = await io.capture('kubectl', args, {allowFailure: true});
        const pod = listed
            .split('\n')
            .map(line => line.replace(/^pod\//, '').trim())
            .filter(Boolean)[0];
        if (pod) return pod;
    }
    return fail(`no pod serves the artifacts in ${namespace}: is ${service} there?`);
};

/** Publish one archive into the file server under the name the trees fetch it by. */
export const artifactPublish = async (
    {
        namespace,
        pod,
        archive,
        remoteName,
    }: {
        namespace: string;
        pod: string;
        archive: string;
        remoteName: string;
    },
    io: IStepIo,
): Promise<void> => {
    await io.run('kubectl', [
        '-n',
        namespace,
        'cp',
        archive,
        `${pod}:/usr/share/nginx/html/${remoteName}`,
    ]);
};

/** What a tree zip has to be named by, so a rename is one edit rather than three strings. */
export const SCENARIO_ARCHIVE = (scenario: string, directory = '/tmp'): string =>
    `${directory}/blong-cycle-${scenario}.zip`;

/** The scenario folder a zip is made from, beside its archive. */
export const SCENARIO_FOLDER = (scenario: string, directory = '/tmp'): string =>
    `${directory}/blong-cycle-${scenario}`;

/**
 * Where a tree's *files* are: `base/` in a split tree, the tree itself in a flat one.
 *
 * A split tree carries two halves (D-475): the base is the objects, and the overlay beside it is what
 * replaces the values one deploy owns. A reader that wants to look at the objects therefore wants the
 * base, while an apply wants the overlay — the two are different paths, which is why both are named
 * here rather than spelled at each call site.
 */
export const baseOf = (tree: string): string =>
    existsSync(`${tree}/base`) ? `${tree}/base` : tree;

/** What a caller hands to `kubectl apply -k`: the composed tree, which is the overlay. */
export const overlayOf = (tree: string): string => `${tree}/local`;

/** The suite namespace a tree's nodes live under, as `ls tree/namespaces` would answer it. */
export const namespaceFileNames = (tree: string): string[] => {
    try {
        return readdirSync(`${baseOf(tree)}/namespaces`);
    } catch {
        return [];
    }
};

/** The services a tree carries a folder for, which is the same list the shell runbook `ls` ed. */
export const serviceNames = (tree: string): string[] => {
    try {
        return readdirSync(`${baseOf(tree)}/services`).filter(name => !name.endsWith('.yaml'));
    } catch {
        return [];
    }
};
