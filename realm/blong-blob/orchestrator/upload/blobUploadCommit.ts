import type {IBlobMeta, IMeta} from '@feasibleone/blong';
import {blobUriFormat} from '@feasibleone/blong/blob';

import {handler} from './handlerGroup.ts';
import {storageMetaMerge} from '../../adapter/storage/storageLib.ts';
import {blobUploadRefusal} from '../../blob/blobUploadRules.ts';
import {blobPortConfig, blobSettings} from '../../blob/blobSettings.ts';

/**
 * Promote a pending upload to a stored blob.
 *
 * The bytes were written by the upload route, which also recorded their digest and size; this is the
 * step that refuses to pretend it happened when it did not — an abandoned form is `expired`, a write
 * that never landed is `incomplete` (@@D-840). What it changes is the record, never the content.
 */
export default handler(
    ({errors, config, handler: {storageBlobHead, storageBlobMetaPut}, lib: {uploadVariants}}) => ({
        async blobUploadCommit(
            params: {
                namespace: string;
                key: string;
                scopes?: string[];
                temporary?: boolean;
                cacheControl?: string;
                /** The variants to derive besides the thumbnail, by name: `normal`, `crop`. */
                variants?: string[];
            },
            $meta: IMeta,
        ): Promise<{key: string; namespace: string; uri: string; size: number; digest: string}> {
            const meta = (await storageBlobHead(
                {namespace: params.namespace, key: params.key},
                $meta,
            )) as IBlobMeta | null;
            if (!meta) {
                throw errors['blob.notFound']({params: {namespace: params.namespace, key: params.key}});
            }
            const refusal = blobUploadRefusal(meta);
            if (refusal === 'expired') {
                throw errors['blob.uploadExpired']({params: {key: params.key, expiresAt: meta.expiresAt}});
            }
            if (refusal === 'incomplete') {
                throw errors['blob.uploadIncomplete']({params: {key: params.key}});
            }

            const temporary = params.temporary ?? meta.temporary;
            const stored = storageMetaMerge(meta, {
                state: 'stored',
                scopes: params.scopes ?? meta.scopes,
                temporary,
                cacheControl: params.cacheControl ?? meta.cacheControl,
                // A committed blob has no lifetime: the expiry the prepare step wrote is the window in
                // which bytes may arrive, and keeping it would leave a stored photograph for the
                // cleanup sweep to remove (@@D-840).
                expiresAt: temporary ? meta.expiresAt : null,
            });
            // The record is promoted before the images are derived, so a failure in the image library
            // leaves a served blob rather than an upload that never becomes one (@@D-844).
            await storageBlobMetaPut(
                {namespace: params.namespace, key: params.key, metadata: stored},
                $meta,
            );
            const variants = await uploadVariants(
                {
                    namespace: params.namespace,
                    key: params.key,
                    meta: stored,
                    settings: blobSettings(config, blobPortConfig(this)),
                    requested: params.variants,
                },
                $meta,
            );
            const next = variants ? storageMetaMerge(stored, {variants}) : stored;
            if (variants) {
                await storageBlobMetaPut(
                    {namespace: params.namespace, key: params.key, metadata: next},
                    $meta,
                );
            }
            return {
                key: params.key,
                namespace: params.namespace,
                uri: blobUriFormat({namespace: params.namespace, key: params.key}),
                size: next.size,
                digest: next.digest,
            };
        },
    }),
);
