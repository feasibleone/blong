import {createHash, randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

import type {IBlobMeta, IMeta} from '@feasibleone/blong';
import {blobUriFormat} from '@feasibleone/blong/blob';

import {
    blobContentTypeMatches,
    blobContentTypeOf,
    blobExtensionAllowed,
    blobExtensionOf,
} from '../../blob/blobContentTypes.ts';
import {blobPortConfig, blobSettings} from '../../blob/blobSettings.ts';
import {handler} from './handlerGroup.ts';

/**
 * Store a small file that arrived inside a JSON call and answer its reference.
 *
 * This is the path for a photograph chosen in a form, not for a video: the payload is base64 in a
 * request body, so it is buffered here and capped at `blob.upload.base64MaxBytes` — anything larger
 * belongs on the streamed upload, where the bytes never become a string (@@D-840).
 *
 * The record is encrypted with the realm's key before it is written, and the digest it keeps is of
 * the *plaintext*, so a reader can prove what it decrypted is what was uploaded (@@D-839).
 */
export default handler(({errors, config, handler: {storageBlobPut}, lib: {blobEncrypt}}) => ({
    async blobBlobAdd(
        params: {
            namespace: string;
            contentBase64: string;
            contentType?: string;
            filename?: string;
            scopes?: string[];
            temporary?: boolean;
            cacheControl?: string;
        },
        $meta: IMeta,
    ): Promise<{key: string; namespace: string; uri: string; size: number; digest: string}> {
        const settings = blobSettings(config, blobPortConfig(this));
        const limit = settings.upload.base64MaxBytes;
        const extension = blobExtensionOf(params.filename);
        if (extension && !blobExtensionAllowed(extension)) {
            throw errors['blob.extensionNotAllowed']({params: {extension}});
        }
        const contentType =
            params.contentType ?? blobContentTypeOf(extension === '' ? 'bin' : extension);
        if (extension && !blobContentTypeMatches(extension, contentType)) {
            throw errors['blob.contentTypeMismatch']({params: {extension, contentType}});
        }

        const plain = Buffer.from(params.contentBase64 ?? '', 'base64');
        if (plain.length === 0) {
            throw errors['blob.uploadIncomplete']({params: {key: 'the payload is empty'}});
        }
        if (plain.length > limit) {
            throw errors['blob.tooLarge']({params: {size: plain.length, limit}});
        }

        const key = randomUUID();
        const digest = createHash('sha256').update(plain).digest('hex');
        const {crypto, stream} = blobEncrypt(settings.crypto);
        const chunks: Buffer[] = [];
        await pipeline(
            Readable.from(plain),
            stream,
            async function* (source: AsyncIterable<Buffer>) {
                for await (const chunk of source) chunks.push(chunk);
            },
        );

        const temporary = params.temporary === true;
        const ttl = settings.upload.tempTtl;
        const meta: IBlobMeta = {
            key,
            namespace: params.namespace,
            contentType,
            size: plain.length,
            digest,
            createdAt: new Date().toISOString(),
            createdBy: ($meta as {auth?: {actorId?: string}})?.auth?.actorId,
            scopes: params.scopes ?? [],
            scopeMode: 'any',
            state: 'stored',
            temporary,
            expiresAt: temporary ? new Date(Date.now() + ttl * 1000).toISOString() : null,
            originalFilename: params.filename,
            cacheControl: params.cacheControl,
            crypto,
        };

        await storageBlobPut(
            {
                namespace: params.namespace,
                key,
                body: Readable.from(Buffer.concat(chunks)),
                metadata: meta,
            },
            $meta,
        );

        return {
            key,
            namespace: params.namespace,
            uri: blobUriFormat({namespace: params.namespace, key}),
            size: plain.length,
            digest,
        };
    },
}));
