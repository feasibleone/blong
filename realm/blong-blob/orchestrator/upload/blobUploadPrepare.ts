import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

import type {IBlobMeta, IMeta} from '@feasibleone/blong';
import {BLOB_SCOPE_AUTHENTICATED, blobUriFormat} from '@feasibleone/blong/blob';

import {
    blobContentTypeMatches,
    blobContentTypeOf,
    blobExtensionAllowed,
    blobExtensionOf,
} from '../../blob/blobContentTypes.ts';
import {blobPortConfig, blobSettings} from '../../blob/blobSettings.ts';
import {handler} from '../blob/handlerGroup.ts';

/**
 * Reserve a key, record what is coming, and answer where to put it.
 *
 * The record is written before any byte arrives, so a browser that abandons the form leaves something
 * the cleanup sweep can find (@@D-840). It starts as an empty pending record: the upload route
 * replaces it with the real content and the real digest, and `commit` is what promotes it.
 */
export default handler(({errors, config, handler: {storageBlobPut}, lib: {blobEncrypt}}) => ({
    async blobUploadPrepare(
        params: {
            namespace: string;
            contentType?: string;
            filename?: string;
            size?: number;
            scopes?: string[];
            temporary?: boolean;
        },
        $meta: IMeta,
    ): Promise<{
        key: string;
        namespace: string;
        uri: string;
        uploadUrl: string;
        expiresAt: string;
    }> {
        const settings = blobSettings(config, blobPortConfig(this));
        const max = settings.upload.maxBytes;
        if (params.size !== undefined && params.size > max) {
            throw errors['blob.tooLarge']({params: {size: params.size, limit: max}});
        }
        const extension = blobExtensionOf(params.filename);
        if (extension && !blobExtensionAllowed(extension)) {
            throw errors['blob.extensionNotAllowed']({params: {extension}});
        }
        const contentType =
            params.contentType ?? blobContentTypeOf(extension === '' ? 'bin' : extension);
        if (extension && !blobContentTypeMatches(extension, contentType)) {
            throw errors['blob.contentTypeMismatch']({params: {extension, contentType}});
        }

        const key = randomUUID();
        const ttl = settings.upload.tempTtl;
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
        const {crypto, stream} = blobEncrypt(settings.crypto);
        const actorId = $meta?.auth?.actorId === undefined ? undefined : String($meta.auth.actorId);
        const meta: IBlobMeta = {
            key,
            namespace: params.namespace,
            contentType,
            size: 0,
            digest: '',
            createdAt: new Date().toISOString(),
            createdBy: actorId,
            // No scope asked for means the caller's own authority, never nobody's: a record with an
            // empty list matches no cookie at all (`blobScopeMatch`), so a page that uploaded a file
            // would be refused the right to draw it — and the widget has no way to know which
            // tokens its session cookie carries (`@@D-836`). A signed-in caller is `authenticated`,
            // which is exactly what `blobScopeCollect` puts in the cookie for it.
            scopes: params.scopes?.length
                ? params.scopes
                : actorId
                  ? [BLOB_SCOPE_AUTHENTICATED]
                  : [],
            scopeMode: 'any',
            state: 'pending',
            temporary: params.temporary === true,
            expiresAt: params.temporary === true ? expiresAt : null,
            originalFilename: params.filename,
            crypto,
        };
        // The placeholder holds the cipher's padding block and nothing else; the upload replaces
        // both the record and the content in one write.
        const chunks: Buffer[] = [];
        await pipeline(Readable.from(Buffer.alloc(0)), stream, async function* (source) {
            for await (const chunk of source) chunks.push(chunk as Buffer);
        });
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
            uploadUrl: `/a/${params.namespace}/u/${key}`,
            expiresAt,
        };
    },
}));
