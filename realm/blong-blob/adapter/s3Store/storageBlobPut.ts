import {Readable} from 'node:stream';

import type {IBlobMeta, IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';
import type {IS3StorePort} from './s3StoreLib.ts';

/**
 * `storage.blob.put` — the bytes and their record, as two objects.
 *
 * The bytes go first: a record that names a key nobody can read is worse than an object nobody has a
 * record for, because the second is invisible and the first is a read that fails. Both are written
 * through the framework's object operations on this same port, so the realm never holds a client of its
 * own (@@D-838).
 */
export default handler(({lib: {s3StoreContentKey, s3StoreExec, s3StoreMetaKey, s3StoreMetaSerialize, s3StoreNamespaceCheck}}) => ({
    async storageBlobPut(
        params: {namespace: string; key: string; body: Readable; metadata: IBlobMeta},
        $meta?: IMeta,
    ): Promise<{key: string; namespace: string}> {
        s3StoreNamespaceCheck(params.namespace);
        const port = this as unknown as IS3StorePort;
        await s3StoreExec(
            port,
            {
                key: s3StoreContentKey(params.namespace, params.key),
                body: params.body,
                contentType: params.metadata?.contentType,
            },
            $meta as IMeta,
            'add',
        );
        await s3StoreExec(
            port,
            {
                key: s3StoreMetaKey(params.namespace, params.key),
                body: s3StoreMetaSerialize(params.metadata),
                contentType: 'application/json',
            },
            $meta as IMeta,
            'add',
        );
        return {key: params.key, namespace: params.namespace};
    },
}));
