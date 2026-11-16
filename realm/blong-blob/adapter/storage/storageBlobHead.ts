import type {IBlobMeta} from '@feasibleone/blong';

import {cacheHead} from '../../store/storageCache.ts';
import {handler} from './handlerGroup.ts';

/**
 * Answer one blob's metadata without opening its content.
 *
 * This is what a `HEAD` and a scope check call: the index entry alone, so the answer costs one small
 * read whatever the blob's size is (@@D-837).
 */
export default handler(({lib: {storageDirectory, storageMetaFromEntry}}) => ({
    async storageBlobHead(
        params: {namespace: string; key: string},
        $meta?: unknown,
    ): Promise<IBlobMeta | null> {
        void $meta;
        const entry = await cacheHead(storageDirectory(this.config, params.namespace), params.key);
        return entry ? storageMetaFromEntry(params.namespace, entry) : null;
    },
}));
