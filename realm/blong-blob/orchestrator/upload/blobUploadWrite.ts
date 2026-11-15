import {PassThrough, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

import type {IBlobMeta, IMeta} from '@feasibleone/blong';

import {limitBytes} from '@feasibleone/blong/stream';
import {storageMetaMerge} from '../../adapter/storage/storageLib.ts';
import {blobPortConfig, blobSettings} from '../../blob/blobSettings.ts';
import {blobUploadRefusal} from '../../blob/blobUploadRules.ts';
import {handler} from '../blob/handlerGroup.ts';

/** Count the plaintext as it goes past, so the record can name its size. */
function countBytes(): {stream: Transform; size: () => number} {
    let size = 0;
    return {
        stream: new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                size += chunk.length;
                callback(null, chunk);
            },
        }),
        size: () => size,
    };
}

/**
 * Write the bytes of a prepared upload, then record what they were.
 *
 * The stream is counted, hashed and encrypted on its way to the store, so a 200 MiB file costs a few
 * kilobytes of memory (@@D-840). The record is written first because only the end of the stream knows
 * the size and the digest: the store consumes a `PassThrough` while the pipeline fills it, and the
 * index entry is then corrected in place rather than the content being rewritten.
 *
 * The record stays `pending` — `blob.upload.commit` is the step that says the form was submitted, and
 * a record nobody committed is what the cleanup sweep is for.
 */
export default handler(
    ({
        errors,
        config,
        handler: {storageBlobHead, storageBlobMetaPut, storageBlobPut},
        lib: {blobDigest, blobEncrypt},
    }) => ({
        async blobUploadWrite(
            params: {namespace: string; uploadId: string; body: NodeJS.ReadableStream},
            $meta: IMeta,
        ): Promise<null> {
            const settings = blobSettings(config, blobPortConfig(this));
            const max = settings.upload.maxBytes;
            const existing = (await storageBlobHead(
                {namespace: params.namespace, key: params.uploadId},
                $meta,
            )) as IBlobMeta | null;
            if (!existing) {
                throw errors['blob.notFound']({
                    params: {namespace: params.namespace, key: params.uploadId},
                });
            }
            if (existing.state === 'stored') {
                throw errors['blob.uploadAlreadyStored']({params: {key: params.uploadId}});
            }
            if (blobUploadRefusal(existing) === 'expired') {
                throw errors['blob.uploadExpired']({
                    params: {key: params.uploadId, expiresAt: existing.expiresAt},
                });
            }

            const {crypto, stream: cipher} = blobEncrypt(settings.crypto);
            const digest = blobDigest();
            const counter = countBytes();
            const body = new PassThrough();
            const write = storageBlobPut(
                {namespace: params.namespace, key: params.uploadId, body, metadata: existing},
                $meta,
            );
            await pipeline(
                params.body as unknown as NodeJS.ReadableStream,
                limitBytes(max),
                counter.stream,
                digest.stream,
                cipher,
                body,
            );
            await write;

            const next = storageMetaMerge(existing, {
                size: counter.size(),
                digest: await digest.result,
                crypto,
                state: 'pending',
                contentType: existing.contentType,
            });
            await storageBlobMetaPut(
                {namespace: params.namespace, key: params.uploadId, metadata: next},
                $meta,
            );

            $meta.httpResponse = {code: 204};
            return null;
        },
    }),
);
