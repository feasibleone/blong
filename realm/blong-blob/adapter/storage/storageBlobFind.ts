import type {IBlobMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';
import {cacheFind} from '../../store/storageCache.ts';

/**
 * List what one namespace holds, optionally narrowed by a key prefix or by an expiry.
 *
 * The namespace is its own cache directory, so the listing is already scoped and no record of another
 * realm's blobs can appear in it (@@D-845). `expiredBefore` is what the cleanup handler asks for: a
 * timestamp, and only the records whose `expiresAt` is behind it come back.
 */
export default handler(({lib: {storageDirectory, storageMetaFromEntry}}) => ({
    async storageBlobFind(
        params: {namespace: string; prefix?: string; expiredBefore?: string},
        $meta?: unknown,
    ): Promise<{blob: IBlobMeta[]}> {
        void $meta;
        const entries = await cacheFind(storageDirectory(params.namespace));
        const cutoff = params.expiredBefore ? Date.parse(params.expiredBefore) : undefined;
        const blob = entries
            .filter(entry => !params.prefix || entry.key.startsWith(params.prefix))
            .map(entry => storageMetaFromEntry(params.namespace, entry))
            .filter(meta =>
                cutoff === undefined
                    ? true
                    : meta.expiresAt
                      ? Date.parse(meta.expiresAt) <= cutoff
                      : false,
            );
        return {blob};
    },
}));
