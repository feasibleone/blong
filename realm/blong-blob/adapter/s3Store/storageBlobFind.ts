import type {IBlobMeta, IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';
import type {IS3StorePort} from './s3StoreLib.ts';
import {S3_META_SUFFIX} from './s3StoreLib.ts';

/**
 * `storage.blob.find` — what one namespace holds, narrowed by a key prefix or by an expiry.
 *
 * The listing is the bucket's own: one `find` with the namespace's prefix, then the record beside each
 * object, because the metadata a caller filters on lives in the sidecar rather than in the object's own
 * short-string metadata. Records are skipped, not returned as blobs (@@D-838).
 *
 * A bucket answers at most a page at a time, so the loop follows the continuation token until the
 * namespace is read out: a caller that asked for every expired record must not get the first thousand.
 */
export default handler(({lib: {s3StoreExec, s3StoreMetaKey, s3StoreMetaParse, s3StoreNamespaceCheck, s3StoreNamespacePrefix}}) => ({
    async storageBlobFind(
        params: {namespace: string; prefix?: string; expiredBefore?: string},
        $meta?: IMeta,
    ): Promise<{blob: IBlobMeta[]}> {
        s3StoreNamespaceCheck(params.namespace);
        const port = this as unknown as IS3StorePort;
        const namespacePrefix = s3StoreNamespacePrefix(params.namespace);
        const cutoff = params.expiredBefore ? Date.parse(params.expiredBefore) : undefined;
        const keys: Array<{key: string; size?: number}> = [];
        let token: string | undefined;
        do {
            const page = (await s3StoreExec(
                port,
                {
                    prefix: namespacePrefix,
                    ...(token ? {continuationToken: token} : {}),
                },
                $meta as IMeta,
                'find',
            )) as {
                contents?: Array<{Key?: string; Size?: number}>;
                Contents?: Array<{Key?: string; Size?: number}>;
                isTruncated?: boolean;
                IsTruncated?: boolean;
                nextContinuationToken?: string;
                NextContinuationToken?: string;
            };
            for (const item of page?.contents ?? page?.Contents ?? []) {
                const key = item.Key;
                if (!key || key.endsWith(S3_META_SUFFIX)) continue;
                keys.push({key: key.slice(namespacePrefix.length), size: item.Size});
            }
            token = (page?.isTruncated ?? page?.IsTruncated)
                ? (page.nextContinuationToken ?? page.NextContinuationToken)
                : undefined;
        } while (token);

        const blob: IBlobMeta[] = [];
        for (const entry of keys) {
            if (params.prefix && !entry.key.startsWith(params.prefix)) continue;
            const record = (await s3StoreExec(
                port,
                {key: s3StoreMetaKey(params.namespace, entry.key)},
                $meta as IMeta,
                'get',
            ).catch(() => null)) as {body?: Uint8Array} | null;
            const meta = record?.body
                ? s3StoreMetaParse(record.body, params.namespace, entry.key, entry.size)
                : null;
            if (!meta) continue;
            if (cutoff !== undefined) {
                if (!meta.expiresAt) continue;
                if (Date.parse(meta.expiresAt) > cutoff) continue;
            }
            blob.push(meta);
        }
        return {blob};
    },
}));
