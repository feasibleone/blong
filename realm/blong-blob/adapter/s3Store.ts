import {adapter} from '@feasibleone/blong';

import type {IStorageNamespaceConfig} from './store.ts';

/**
 * `adapter/s3Store.ts` — the same storage API, backed by an S3-compatible bucket.
 *
 * The adapter and its handler group share this name (`adapter/s3Store.ts` beside `adapter/s3Store/`), which
 * is the one config key the backend is addressed by — the pattern `blong-server` uses for its `db` adapter.
 *
 * Both backends answer the one namespace the realm's orchestrator calls (`storage.blob.*`, @@D-849), so
 * nothing above this file knows which one a process loaded: the deployment names the block of the
 * backend it wants and sets the other to `false` (the loader skips a port whose config is `false`).
 *
 * The protocol is the framework's `s3` adapter — `extends: 'adapter.s3'` — so the client, its retries
 * and its error mapping are not repeated here; this file adds the one thing an object store cannot do
 * by itself: a **sidecar** record. Every blob is two objects, `<prefix><namespace>/<key>` for the bytes
 * and the same name with `.meta.json` for the metadata, so one head and one get answer a read
 * (@@D-838).
 *
 * `forcePathStyle` is on: MinIO addresses a bucket as a path, and a real endpoint tolerates it.
 */
export interface IS3StoreConfig {
    /** What every key is prefixed with, so one bucket may hold more than this realm. */
    prefix?: string;
    /** The namespaces this process serves. A namespace absent here is refused (@@D-845). */
    namespaces?: Record<string, IStorageNamespaceConfig>;
    s3?: {
        region?: string;
        endpoint?: string;
        credentials?: {accessKeyId: string; secretAccessKey: string};
        forcePathStyle?: boolean;
    };
    bucket?: {Bucket?: string};
}

export default adapter<IS3StoreConfig>(() => ({
    extends: 'adapter.s3',
    activation: {
        default: {
            // The namespace the orchestrator calls, not the backend's name (@@D-849).
            namespace: 'storage',
            // The handler group this instance serves: `adapter/s3/` is the registration `blob.s3`, and
            // without this the adapter loads and answers nothing (@@D-838).
            // The handler group this instance serves: `adapter/s3Store/` is the registration
            // `blob.s3Store`, and without this the adapter loads and answers nothing (@@D-838).
            imports: [/\.s3Store$/],
            prefix: '',
            namespaces: {},
            s3: {
                region: 'us-east-1',
                forcePathStyle: true,
            },
        },
    },
    start() {
        super.connect();
        return super.start();
    },
}));
