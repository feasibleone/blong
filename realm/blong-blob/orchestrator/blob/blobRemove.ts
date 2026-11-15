import type {IBlobMeta, IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

/**
 * `blob.blob.remove` — the bytes, the record and every variant derived from them.
 *
 * A variant is a blob of its own, stored under the key its record names, so removing the original
 * leaves it behind unless it is removed too; the record is what says which keys exist (@@D-844). The
 * answer counts the bytes freed, because a caller of a sweep wants to report what it reclaimed rather
 * than how many keys it touched.
 */
export default handler(({errors, handler: {storageBlobHead, storageBlobRemove}}) => ({
    async blobBlobRemove(
        params: {namespace: string; key: string},
        $meta: IMeta,
    ): Promise<{removed: boolean; bytes: number}> {
        const meta = (await storageBlobHead(
            {namespace: params.namespace, key: params.key},
            $meta,
        )) as IBlobMeta | null;
        if (!meta) {
            throw errors['blob.notFound']({params: {namespace: params.namespace, key: params.key}});
        }

        let bytes = 0;
        for (const variant of Object.values(meta.variants ?? {})) {
            const head = (await storageBlobHead(
                {namespace: params.namespace, key: variant.key},
                $meta,
            )) as IBlobMeta | null;
            const answer = (await storageBlobRemove(
                {namespace: params.namespace, key: variant.key},
                $meta,
            )) as {removed?: boolean};
            if (answer?.removed) bytes += head?.size ?? 0;
        }
        const answer = (await storageBlobRemove(
            {namespace: params.namespace, key: params.key},
            $meta,
        )) as {removed?: boolean};
        if (answer?.removed) bytes += meta.size ?? 0;
        return {removed: answer?.removed === true, bytes};
    },
}));
