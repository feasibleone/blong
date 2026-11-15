import t from 'tap';
import {createHash} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

import type {IBlobMeta} from '@feasibleone/blong';

import {cacheGet, cacheHead, cacheMetaPut, cachePut, cacheRemove} from '../../store/storageCache.ts';
import {storageMetaFromEntry} from '../../adapter/storage/storageLib.ts';
import {decryptStream, encryptStream} from '../../store/storageCipher.ts';
import {digestTap, digestVerify} from '../../store/storageDigest.ts';
import uploadWrite from './blobUploadWrite.ts';

/** The error layer, as the framework hands it to a handler: one factory per type. */
const errors = new Proxy(
    {},
    {
        get:
            (_target, type: string) =>
            ({params}: {params?: Record<string, unknown>} = {}) =>
                Object.assign(new Error(type), {type, ...params}),
    },
) as Record<string, (options?: {params?: Record<string, unknown>}) => Error>;

/**
 * `blob.upload.write` — the stream a `PUT` hands the handler, and the record it leaves behind.
 *
 * The handler is called the way the framework calls it, with the store's real cache functions over a
 * temporary directory and the realm's real cipher and digest, so the assertion is about the file on
 * disk rather than about a stub.
 */
function subject(directory: string) {
    const handler = {
        storageBlobHead: async (params: {namespace: string; key: string}) => {
            const entry = await cacheHead(`${directory}/${params.namespace}`, params.key);
            return entry ? storageMetaFromEntry(params.namespace, entry) : null;
        },
        storageBlobPut: async (params: {
            namespace: string;
            key: string;
            body: Readable;
            metadata: IBlobMeta;
        }) => {
            await cachePut(
                `${directory}/${params.namespace}`,
                params.key,
                params.body,
                params.metadata,
            );
        },
        storageBlobMetaPut: async (params: {
            namespace: string;
            key: string;
            metadata: IBlobMeta;
        }) => ({
            updated: await cacheMetaPut(
                `${directory}/${params.namespace}`,
                params.key,
                params.metadata,
            ),
        }),
    };
    const lib = {blobDigest: digestTap, blobEncrypt: () => encryptStream(KEY)};
    return {
        handler,
        methods: (
            uploadWrite as unknown as (api: unknown) => {
                blobUploadWrite: (
                    params: {namespace: string; uploadId: string; body: NodeJS.ReadableStream},
                    meta: object,
                ) => Promise<null>;
            }
        )({errors, config: {upload: {maxBytes: 16 * 1024 * 1024}}, handler, lib}),
    };
}

const KEY = '130a3f71f4f8560e786ff4c8839fecde6273b94b54ced6efbd0cec5281b4471a';

t.test('eight megabytes stream through the upload and land in the record', async t => {
    const directory = mkdtempSync(join(tmpdir(), 'blong-blob-upload-'));
    const {handler, methods} = subject(directory);
    const key = 'upload-1';
    const pending: IBlobMeta = {
        key,
        namespace: 'party',
        contentType: 'video/mp4',
        size: 0,
        digest: '',
        createdAt: new Date(0).toISOString(),
        scopes: ['party:person:1'],
        scopeMode: 'any',
        state: 'pending',
        temporary: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await handler.storageBlobPut({
        namespace: 'party',
        key,
        body: Readable.from(Buffer.alloc(0)),
        metadata: pending,
    });

    const content = Buffer.alloc(8 * 1024 * 1024, 3);
    const meta = {httpResponse: undefined as unknown};
    await methods.blobUploadWrite(
        {namespace: 'party', uploadId: key, body: Readable.from(content)},
        meta,
    );
    t.equal((meta.httpResponse as {code?: number})?.code, 204, 'the write answers 204');

    const after = await handler.storageBlobHead({namespace: 'party', key});
    t.equal(after?.size, content.length, 'the record names the size that arrived');
    t.equal(after?.digest, createHash('sha256').update(content).digest('hex'), 'and its digest');
    t.equal(after?.state, 'pending', 'and it is still waiting for a commit');

    const hit = await cacheGet(`${directory}/party`, key);
    const stored: Buffer[] = [];
    for await (const chunk of hit!.stream as AsyncIterable<Buffer>) stored.push(chunk);
    const back: Buffer[] = [];
    await pipeline(
        Readable.from(Buffer.concat(stored)),
        decryptStream(KEY, after!.crypto!),
        digestVerify(after!.digest),
        async function* (source: AsyncIterable<Buffer>) {
            for await (const chunk of source) back.push(chunk as Buffer);
        },
    );
    t.ok(Buffer.concat(back).equals(content), 'and the bytes come back unchanged');
    await cacheRemove(`${directory}/party`, key);
});
