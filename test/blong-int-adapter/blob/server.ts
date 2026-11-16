import {realm} from '@feasibleone/blong';

/** Where the harness's MinIO answers; the CI node port is 30009 and the local one is 9000. */
const ENDPOINT = process.env['S3_ENDPOINT'] ?? 'http://localhost:9000';

/**
 * The blob realm against a real bucket.
 *
 * A realm of its own rather than a group inside `s3/`: both the raw adapter and the store answer the one
 * namespace `storage` (@@D-849), so a process carrying both would have two ports claiming every
 * `storage.blob.*` call and the one that did not hold the group would answer it as an unknown object
 * operation. One store per run keeps that from happening by construction.
 *
 * The blob realm keeps no group of its own for this: its tests must stay runnable on a laptop with no
 * service, so the proof that the store works over the wire belongs here.
 */
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        './test',
        async function blob() {
            return import('@feasibleone/blong-blob/server.ts');
        },
    ],
    config: {
        default: {},
        microservice: {
            adapter: true,
        },
        'adapter.blob': {
            adapter: true,
            test: true,
            blob: {
                // The object store is the backend this run exists for; the filesystem one is skipped the
                // way a deployment that wants S3 skips it.
                store: false as const,
                s3Store: {
                    namespaces: {test: {}},
                    prefix: 'int-adapter',
                    bucket: {Bucket: 'blong-integration'},
                    s3: {
                        region: 'us-east-1',
                        endpoint: ENDPOINT,
                        credentials: {accessKeyId: 'blong-admin', secretAccessKey: 'password'},
                        forcePathStyle: true,
                    },
                },
                blobDispatch: {
                    crypto: {
                        key: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
                    },
                    cookie: {secret: 'int-adapter-cookie-secret', ttl: 600},
                },
            },
        },
    },
}));
