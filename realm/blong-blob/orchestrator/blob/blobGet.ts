import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

import type {IBlobMeta, IMeta} from '@feasibleone/blong';
import {blobUriFormat} from '@feasibleone/blong/blob';

import {blobPortConfig, blobSettings} from '../../blob/blobSettings.ts';
import {handler} from './handlerGroup.ts';

/** A pass-through for a blob that was stored without encryption. */
const plain = () =>
    new Transform({transform: (chunk, _encoding, callback) => callback(null, chunk)});

/**
 * Answer a blob's metadata, and its content when the caller asks for it embedded.
 *
 * The default answer is the record: `HEAD` and the scope check read it and nothing else. `content:
 * 'base64'` adds the bytes, decrypted and digest-checked on the way out, which is the shape a small
 * payload takes when it travels in a JSON call (@@D-840).
 */
export default handler(
    ({
        errors,
        config,
        handler: {storageBlobGet, storageBlobHead},
        lib: {blobDecrypt, blobDigestVerify},
    }) => ({
        async blobBlobGet(
            params: {namespace: string; key: string; content?: 'base64'},
            $meta: IMeta,
        ): Promise<(IBlobMeta & {uri: string; content?: string}) | null> {
            const meta = (await storageBlobHead(
                {namespace: params.namespace, key: params.key},
                $meta,
            )) as IBlobMeta | null;
            if (!meta)
                throw errors['blob.notFound']({
                    params: {namespace: params.namespace, key: params.key},
                });
            const answer = {uri: blobUriFormat({namespace: params.namespace, key: params.key})};
            if (params.content !== 'base64') return {...meta, ...answer};

            const hit = (await storageBlobGet(
                {namespace: params.namespace, key: params.key},
                $meta,
            )) as {meta: IBlobMeta; stream: NodeJS.ReadableStream} | null;
            if (!hit)
                throw errors['blob.notFound']({
                    params: {namespace: params.namespace, key: params.key},
                });

            const settings = blobSettings(config, blobPortConfig(this));
            const limit = settings.upload.base64MaxBytes;
            if (meta.size > limit)
                throw errors['blob.tooLarge']({params: {size: meta.size, limit}});

            const chunks: Buffer[] = [];
            const decrypt = meta.crypto ? blobDecrypt(settings.crypto, meta.crypto) : plain();
            await pipeline(
                hit.stream as unknown as NodeJS.ReadableStream,
                decrypt,
                blobDigestVerify(meta.digest),
                async function* (source: AsyncIterable<Buffer>) {
                    for await (const chunk of source) chunks.push(chunk);
                },
            );
            return {...meta, ...answer, content: Buffer.concat(chunks).toString('base64')};
        },
    }),
);
