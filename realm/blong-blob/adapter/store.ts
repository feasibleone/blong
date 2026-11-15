import {adapter} from '@feasibleone/blong';
import type {IComponentK8sContribution} from '@feasibleone/blong/types';

/**
 * `adapter/storage.ts` — the filesystem store, one directory per namespace.
 *
 * The backend is `cacache`: content-addressed, index-based, and able to stream both ways without ever
 * holding a whole file, which is what a video upload needs (@@D-838). Nothing here is protocol
 * specific, so the group in `adapter/storage/` is the whole API: put, get, head, find, remove.
 *
 * The adapter keeps no database and no clock. Its directory is the mount a consuming realm declared —
 * `blob-storage` is not a claim this realm can make for itself (@@D-845) — and each namespace is a
 * subdirectory of it, so a suite that lands in one process keeps its realms' files apart.
 */
export interface IStorageNamespaceConfig {
    /** The ceiling a namespace's blobs may reach, as the deployment spells it (`10Gi`). */
    size?: string;
}

export interface IStorageConfig {
    /** The base directory; a namespace's own store is `<directory>/<namespace>`. */
    directory: string;
    /** The namespaces this process serves. A namespace absent here is refused. */
    namespaces: Record<string, IStorageNamespaceConfig>;
}

/**
 * The claim and the address the store declares (`@@D-854`).
 *
 * One claim rather than one per realm: the store is a companion, so every process that carries it has
 * the same directory, and what separates two realms' files is the namespace subdirectory inside it. A
 * deployment that mounts nothing writes into the container's layer, which is why the claim is declared
 * here — by the component that owns the mount — rather than by each realm that stores something.
 */
export default adapter<IStorageConfig & IComponentK8sContribution>(() => ({
    activation: {
        default: {
            namespace: 'storage',
            // The handler group this instance serves: `adapter/storage/` is the namespace
            // `blob.storage`, and without this the adapter loads and answers nothing (@@D-838).
            imports: [/\.storage$/],
            directory: '/var/lib/blong/blob',
            namespaces: {},
            /**
             * What a cluster mounts and serves for the store (`@@D-854`). The size is a starting point a
             * deployment overrides; the path is the directory above, because a namespace is a
             * subdirectory of the claim rather than a claim of its own.
             *
             * The key is the claim's name, and a claim's name is an RFC 1123 subdomain: `blobStorage`
             * is refused by the API server with `a lowercase RFC 1123 subdomain must consist of lower
             * case alphanumeric characters, '-' or '.'` and the whole install tree stops there
             * (`@@D-868`). The ingress key is free-shaped because its entry names itself in `name`.
             */
            k8sVolumes: {'blob-storage': {size: '2Gi', mountPath: '/var/lib/blong/blob'}},
            k8sIngresses: {blobStore: {name: 'blob-store', path: '/a', pathType: 'Prefix'}},
        },
    },
    start() {
        super.connect();
        return super.start();
    },
}));
