import type {IBlobMeta, IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

/**
 * `blob.blob.find` — what one namespace holds, narrowed by a prefix or by an expiry.
 *
 * The listing is the backend's index, not a table: this realm keeps no database, so a namespace is its
 * own directory and the walk is content-addressed order rather than a query plan (@@D-837). The
 * namespace is named explicitly because it belongs to the realm that claimed it, and `expiredBefore`
 * is the question the cleanup handler asks (@@D-840).
 */
export default handler(({handler: {storageBlobFind}}) => ({
    async blobBlobFind(
        params: {namespace: string; prefix?: string; expiredBefore?: string},
        $meta: IMeta,
    ): Promise<{blob: IBlobMeta[]}> {
        const answer = (await storageBlobFind(
            {
                namespace: params.namespace,
                prefix: params.prefix,
                expiredBefore: params.expiredBefore,
            },
            $meta,
        )) as {blob?: IBlobMeta[]};
        return {blob: answer?.blob ?? []};
    },
}));
