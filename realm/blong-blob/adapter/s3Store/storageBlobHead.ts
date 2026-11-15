import type {IBlobMeta, IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';
import type {IS3StorePort} from './s3StoreLib.ts';

/**
 * `storage.blob.head` — the record alone, which is one small object and no bytes.
 *
 * This is the read a write path makes before it writes and the one a serve makes before it streams, so it
 * is deliberately just the sidecar: an S3 `head` on the content would answer a length and a type, and
 * neither is the record a caller decides with (@@D-838).
 */
export default handler(({lib: {s3StoreExec, s3StoreMetaKey, s3StoreMetaParse, s3StoreNamespaceCheck}}) => ({
    async storageBlobHead(
        params: {namespace: string; key: string},
        $meta?: IMeta,
    ): Promise<IBlobMeta | null> {
        s3StoreNamespaceCheck(params.namespace);
        const port = this as unknown as IS3StorePort;
        const record = (await s3StoreExec(
            port,
            {key: s3StoreMetaKey(params.namespace, params.key)},
            $meta as IMeta,
            'get',
        ).catch(() => null)) as {body?: Uint8Array} | null;
        if (!record?.body) return null;
        return s3StoreMetaParse(record.body, params.namespace, params.key);
    },
}));
