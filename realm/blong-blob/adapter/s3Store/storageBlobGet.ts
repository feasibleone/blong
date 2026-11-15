import {Readable} from 'node:stream';

import type {IBlobMeta, IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';
import type {IS3StorePort} from './s3StoreLib.ts';

/**
 * `storage.blob.get` — the record and the bytes, or `null` when the key is not there.
 *
 * The two are read as two objects: the record is small and buffered, the bytes are streamed, so a video
 * never passes through this process's memory (@@D-838). A missing content object and a missing record
 * both answer `null` — a caller that has to tell them apart is a caller that should have used `head`.
 */
export default handler(({lib: {s3StoreContentKey, s3StoreExec, s3StoreMetaKey, s3StoreMetaParse, s3StoreNamespaceCheck}}) => ({
    async storageBlobGet(
        params: {namespace: string; key: string},
        $meta?: IMeta,
    ): Promise<{meta: IBlobMeta; stream: Readable} | null> {
        s3StoreNamespaceCheck(params.namespace);
        const port = this as unknown as IS3StorePort;
        const record = (await s3StoreExec(
            port,
            {key: s3StoreMetaKey(params.namespace, params.key)},
            $meta as IMeta,
            'get',
        ).catch(() => null)) as {body?: Uint8Array} | null;
        if (!record?.body) return null;
        const content = (await s3StoreExec(
            port,
            {key: s3StoreContentKey(params.namespace, params.key)},
            $meta as IMeta,
            'stream',
        ).catch(() => null)) as {body?: Readable} | null;
        if (!content?.body) return null;
        const meta = s3StoreMetaParse(record.body, params.namespace, params.key);
        if (!meta) return null;
        return {meta, stream: content.body};
    },
}));
