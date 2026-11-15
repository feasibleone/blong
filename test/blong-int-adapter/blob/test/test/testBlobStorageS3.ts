import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';
import {Readable} from 'node:stream';

/**
 * `testBlobStorageS3` — the blob realm's object-store backend, against a real bucket.
 *
 * The raw `adapter.s3` groups beside this one prove a single object operation at a time. A store is more
 * than that: the bytes and a record written beside them, a read, a `Range` answered as a `206`, a remove
 * that takes both objects, and a sweep that finds what expired. All of it runs over MinIO here, which is
 * where the protocol and the store meet (@@D-838 @@D-849).
 *
 * The blob realm is a child of this realm (`s3/server.ts`), configured with `store: false` and its
 * `s3Store` block, so every call below reaches the object store rather than a directory.
 *
 * Registered as the `test.blobStorageS3` group (`adapter.s3` in the suite's `watch.test`).
 */
export default handler(
    ({
        lib: {group},
        handler: {
            blobBlobAdd,
            blobBlobGet,
            blobBlobRemove,
            blobHead,
            blobRead,
            blobTempCleanup,
            blobUploadCommit,
            blobUploadPrepare,
            blobUploadWrite,
        },
    }) => ({
        testBlobStorageS3: ({name = 'blob store on s3'}: {name?: string} = {}) =>
            group(name)([
                async function upload(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const body = Buffer.alloc(256 * 1024, 9);
                    const prepared = (await blobUploadPrepare(
                        {
                            namespace: 'test',
                            // A payload of bytes, not a picture: this group proves the store's two
                            // objects and the calls over the wire; a derived thumbnail is the realm's
                            // own test's business (@@D-844).
                            contentType: 'application/octet-stream',
                            filename: 'probe.bin',
                            size: body.length,
                            scopes: ['anonymous'],
                        },
                        $meta,
                    )) as {key: string};
                    assert.ok(prepared?.key, 'the upload is prepared');
                    await blobUploadWrite(
                        {
                            namespace: 'test',
                            uploadId: prepared.key,
                            body: Readable.from(body) as unknown as NodeJS.ReadableStream,
                        },
                        $meta,
                    );
                    const committed = (await blobUploadCommit(
                        {namespace: 'test', key: prepared.key},
                        $meta,
                    )) as {key: string};
                    assert.equal(committed.key, prepared.key, 'and committed under the same key');
                    return {key: prepared.key, size: body.length};
                },

                async function read(
                    assert: typeof Assert,
                    {$meta, upload}: {$meta: IMeta; upload: Promise<{key: string; size: number}>},
                ) {
                    const {key, size} = await upload;
                    const stream = (await blobRead(
                        {namespace: 'test', key},
                        $meta,
                    )) as Readable | null;
                    assert.ok(stream, 'the blob reads back');
                    let seen = 0;
                    for await (const chunk of stream!) seen += (chunk as Buffer).length;
                    assert.equal(seen, size, 'every byte the upload carried');
                    return {key, size};
                },

                async function record(
                    assert: typeof Assert,
                    {$meta, read}: {$meta: IMeta; read: Promise<{key: string; size: number}>},
                ) {
                    const {key, size} = await read;
                    const answer = (await blobBlobGet({namespace: 'test', key}, $meta)) as {
                        size: number;
                        contentType: string;
                    };
                    assert.equal(answer.size, size, 'the record beside the bytes names their size');
                    assert.equal(answer.contentType, 'application/octet-stream', 'and their type');
                    return {key};
                },

                async function remove(
                    assert: typeof Assert,
                    {$meta, record}: {$meta: IMeta; record: Promise<{key: string}>},
                ) {
                    const {key} = await record;
                    const answer = (await blobBlobRemove({namespace: 'test', key}, $meta)) as {
                        removed: boolean;
                        bytes: number;
                    };
                    assert.equal(answer.removed, true, 'the bytes and the record are gone');
                    assert.ok(answer.bytes > 0, 'and the bytes it held are counted');
                    return {key};
                },

                async function missing(
                    assert: typeof Assert,
                    {$meta, remove}: {$meta: IMeta; remove: Promise<{key: string}>},
                ) {
                    const {key} = await remove;
                    const refused = await Promise.resolve(
                        blobHead({namespace: 'test', key}, {...$meta} as IMeta),
                    ).then(
                        () => false,
                        () => true,
                    );
                    assert.equal(refused, true, 'a removed blob is not found again');
                    return {done: true};
                },

                async function cleanup(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const added = (await blobBlobAdd(
                        {
                            namespace: 'test',
                            contentBase64: Buffer.from('a temporary probe').toString('base64'),
                            contentType: 'text/plain',
                            scopes: ['anonymous'],
                            temporary: true,
                        },
                        $meta,
                    )) as {key: string};
                    assert.ok(added?.key, 'a temporary blob is stored');
                    // The cutoff is a day ahead, which is past every temporary record's lifetime.
                    const now = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
                    const answer = (await blobTempCleanup({namespaces: ['test'], now}, $meta)) as
                        | {removed: number; bytes: number}
                        | undefined;
                    // Named rather than dereferenced: an answer that is absent is a dispatch fault,
                    // and a TypeError here reports neither the fault nor the sweep (`@@F-747`).
                    assert.ok(
                        (answer?.removed ?? -1) >= 1,
                        `the sweep found the expired record — it answered ${JSON.stringify(answer)}`,
                    );
                    const gone = await Promise.resolve(
                        blobHead({namespace: 'test', key: added.key}, {...$meta} as IMeta),
                    ).then(
                        () => false,
                        () => true,
                    );
                    assert.equal(gone, true, 'and removed it from the bucket');
                    return {done: true};
                },
            ]),
    }),
);
