import type {IBlobMeta, IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';
import type {IS3StorePort} from './s3StoreLib.ts';

/**
 * `storage.blob.meta.put` — replace one blob's record, leaving its bytes alone.
 *
 * A blob's key is immutable and its bytes never change once written, so every later edit — a promoted
 * upload, a scope change, the variants a commit derived — is a rewrite of the sidecar (@@D-844). The
 * record sits beside the content, so this is one small object written over another.
 */
export default handler(({lib: {s3StoreExec, s3StoreMetaKey, s3StoreMetaSerialize, s3StoreNamespaceCheck}}) => ({
    async storageBlobMetaPut(
        params: {namespace: string; key: string; metadata: IBlobMeta},
        $meta?: IMeta,
    ): Promise<{updated: boolean}> {
        s3StoreNamespaceCheck(params.namespace);
        const port = this as unknown as IS3StorePort;
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
        return {updated: true};
    },
}));
