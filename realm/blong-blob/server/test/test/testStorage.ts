import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {Readable} from 'node:stream';

import type {IBlobMeta} from '@feasibleone/blong';

/** Deterministic bytes, so a round trip is compared rather than eyeballed. */
function bytes(size: number): Buffer {
    const buffer = Buffer.alloc(size);
    for (let index = 0; index < size; index += 1) buffer[index] = (index * 31 + 7) % 256;
    return buffer;
}

async function readAll(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
}

function metaOf(namespace: string, key: string, size: number): IBlobMeta {
    return {
        key,
        namespace,
        contentType: 'image/png',
        size,
        digest: 'not-the-point-of-this-test',
        createdAt: new Date(0).toISOString(),
        scopes: ['anonymous'],
        scopeMode: 'any',
        state: 'stored',
        temporary: false,
    };
}

/**
 * `test.storage` — the filesystem store round-trips a byte, a block and a megabyte.
 *
 * The three sizes are the three shapes a stream can end on: a partial final block, a whole one, and a
 * body large enough that no implementation accidentally buffers it. `head` is compared with `get`'s
 * metadata because a read path that answers `HEAD` from a different source is a read path that can
 * disagree with itself.
 *
 * Registered as the `test.storage` group (`integration.watch.test` in index.ts).
 */
/** The backend this run configured; `blob.storage.info` must report the same one. */
const EXPECTED_BACKEND = process.env['BLOB_BACKEND'] === 's3' ? 's3' : 'cacache';

export default handler(
    ({lib: {group}, handler: {blobStorageInfo, storageBlobPut, storageBlobGet, storageBlobHead, storageBlobRemove}}) => ({
        testStorage: () =>
            group('storage')([
                async function roundTrip(assert: IAssert) {
                    for (const size of [1, 16, 1024 * 1024]) {
                        const key = `round-trip-${size}`;
                        const content = bytes(size);
                        await storageBlobPut(
                            {
                                namespace: 'test',
                                key,
                                body: Readable.from(content),
                                metadata: metaOf('test', key, size),
                            },
                            {} as IMeta,
                        );
                        const read = (await storageBlobGet({namespace: 'test', key}, {} as IMeta)) as {
                            meta: IBlobMeta;
                            stream: Readable;
                        } | null;
                        assert.ok(read, `the store answers ${size} bytes back`);
                        if (!read) return {done: false};
                        const back = await readAll(read.stream);
                        assert.equal(back.length, size, `${size} bytes arrive`);
                        assert.ok(back.equals(content), `${size} bytes arrive unchanged`);
                        assert.equal(read.meta.size, size, 'the metadata names the size');
                        assert.equal(read.meta.contentType, 'image/png', 'and the content type');

                        const head = (await storageBlobHead(
                            {namespace: 'test', key},
                            {} as IMeta,
                        )) as IBlobMeta | null;
                        assert.ok(head, 'head answers what get answered');
                        assert.deepEqual(head?.scopes, read.meta.scopes, 'including the scopes');
                        assert.equal(head?.digest, read.meta.digest, 'and the digest');
                        await storageBlobRemove({namespace: 'test', key}, {} as IMeta);
                    }
                    return {done: true};
                },

                async function unknownNamespaceIsRefused(assert: IAssert) {
                    let refused: unknown;
                    try {
                        await storageBlobPut(
                            {
                                namespace: 'nobody',
                                key: 'k',
                                body: Readable.from(Buffer.alloc(1)),
                                metadata: metaOf('nobody', 'k', 1),
                            },
                            {} as IMeta,
                        );
                    } catch (error) {
                        refused = error;
                    }
                    assert.ok(refused, 'a namespace the configuration does not name is refused');
                    assert.match(
                        String((refused as Error).message),
                        /nobody/,
                        'and the refusal names it',
                    );
                },

                async function theStoreReportsItself(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const info = (await blobStorageInfo({}, $meta)) as {
                        backend: string;
                        streams: boolean;
                        ranges: boolean;
                        base64Ceiling: number;
                    };
                    assert.equal(info.backend, EXPECTED_BACKEND, 'the backend the run configured');
                    assert.equal(info.streams, true, 'a stream is what an upload becomes');
                    assert.equal(info.ranges, true, 'and a range is what a read may ask for');
                    assert.ok(info.base64Ceiling > 0, 'a JSON call carries a bounded payload');
                    return {done: true};
                },

                async function missingBlobAnswersNull(assert: IAssert) {
                    assert.equal(
                        await storageBlobHead({namespace: 'test', key: 'absent'}, {} as IMeta),
                        null,
                        'head of a key nobody wrote is null rather than a failure',
                    );
                    assert.equal(
                        await storageBlobGet({namespace: 'test', key: 'absent'}, {} as IMeta),
                        null,
                        'and so is get',
                    );
                },
            ]),
    }),
);
