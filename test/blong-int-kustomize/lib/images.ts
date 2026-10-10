/**
 * scripts/lib/images.ts — getting an image into a cluster that cannot pull it.
 *
 * A k3d node is a container: it has no path to the host's image store and, on a machine that built the
 * image a moment ago, no need for a registry either. So the image is built (or pulled), saved, copied
 * into every node and imported there by hand — every node, because the fill runs one Job per node
 * and a kubelet uses what it has locally.
 *
 * The two traps this file exists to keep in one place are in the header of the shell runbook it
 * replaces: `podman save` writes exactly the reference it was given, so the import lands beside the
 * name the manifests use rather than replacing it, and a build leaves its intermediate stages behind
 * as dangling images — which are also the layer cache, so they are pruned by age rather than wholesale
 * (F-379, F-425).
 */
import type {IStepIo} from './exec.ts';

export const podmanImageExists = async (reference: string, io: IStepIo): Promise<boolean> =>
    (await io.capture('podman', ['image', 'exists', reference], {allowFailure: true})).length > 0;

export const podmanPull = async (reference: string, io: IStepIo): Promise<void> => {
    await io.run('podman', ['pull', reference]);
};

export const podmanBuild = async (
    {dockerfile, context, tag}: {dockerfile: string; context: string; tag: string},
    io: IStepIo,
): Promise<void> => {
    await io.run('podman', ['build', '-f', dockerfile, '-t', tag, context]);
};

export const podmanTag = async (
    {from, to}: {from: string; to: string},
    io: IStepIo,
): Promise<void> => {
    await io.run('podman', ['tag', from, to]);
};

/**
 * Copy one archived image into every node and import it there.
 *
 * `ctr -n k8s.io images import` names the containerd namespace the kubelet reads, and the archive is
 * removed after the loop because it is a copy of an image that is already in the store.
 */
export const imagePublishToNodes = async (
    {nodes, reference, archive}: {nodes: string[]; reference: string; archive: string},
    io: IStepIo,
): Promise<void> => {
    await io.run('podman', ['save', reference, '-o', archive]);
    for (const node of nodes) {
        await io.run('podman', ['cp', archive, `${node}:${archive}`]);
        await io.run('podman', ['exec', node, 'ctr', '-n', 'k8s.io', 'images', 'import', archive], {
            allowFailure: false,
        });
        io.log(`imported ${reference} into ${node}`);
    }
    await io.run('rm', ['-f', archive]);
};

/**
 * Drop the build generations an earlier run left behind, and keep the one just built.
 *
 * Every build leaves its stage images behind — the base image, the context copies, the workspace
 * install and the deploy tree, about 6 GB — and nothing else removes them: five such chains had
 * accumulated while `podman system df` reported 25.86 GB reclaimable (F-379). They are the layer cache
 * as well, so dropping all of them made every later build re-run `rush install` and `rush deploy`:
 * four cache hits and 138 seconds cold, against seventy-two and 9 seconds (F-425). A generation older
 * than this run is one the next build cannot reuse, so `until` takes exactly those, and prune leaves
 * alone whatever the chain just built still references.
 */
export const imagePruneOlderThan = async (
    {startedAt}: {startedAt: number},
    io: IStepIo,
): Promise<void> => {
    const seconds = Math.max(1, Math.floor(Date.now() / 1000) - startedAt);
    await io.run('podman', [
        'image',
        'prune',
        '-f',
        '--filter',
        'dangling=true',
        '--filter',
        `until=${seconds}s`,
    ]);
};

/** The framework image a tree names, built here and imported into every node. */
export const frameworkImagePublish = async (
    {
        root,
        dockerfile,
        localImage,
        frameworkImage,
        version,
        nodes,
        archive,
    }: {
        root: string;
        dockerfile: string;
        /** The host reference the build produces (`localhost/…`). */
        localImage: string;
        /** The reference the generated trees name (`docker.io/library/…`). */
        frameworkImage: string;
        version: string;
        nodes: string[];
        archive: string;
    },
    io: IStepIo,
): Promise<void> => {
    // Taken first, because the retention after the import loop has to tell the layers this run creates
    // from the ones it inherited.
    const startedAt = Math.floor(Date.now() / 1000);
    await podmanBuild({dockerfile, context: root, tag: localImage}, io);
    await podmanTag({from: localImage, to: `${frameworkImage}:${version}`}, io);
    await imagePublishToNodes({nodes, reference: `${frameworkImage}:${version}`, archive}, io);
    await imagePruneOlderThan({startedAt}, io);
};

/** The file server's own image, which comes from the registry the cluster cannot reach either. */
export const nginxImagePublish = async (
    {reference, nodes, archive}: {reference: string; nodes: string[]; archive: string},
    io: IStepIo,
): Promise<void> => {
    if (!(await podmanImageExists(reference, io))) await podmanPull(reference, io);
    await imagePublishToNodes({nodes, reference, archive}, io);
};
