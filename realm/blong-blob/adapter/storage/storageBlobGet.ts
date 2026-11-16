import type {IBlobMeta} from '@feasibleone/blong';
import type {Readable} from 'node:stream';

import {cacheGet} from '../../store/storageCache.ts';
import {handler} from './handlerGroup.ts';

/**
 * Answer one blob's metadata and its content as a stream.
 *
 * The metadata comes from the index entry, so a caller that may not read the bytes pays for one small
 * read and nothing more; the stream is opened lazily, so a caller that abandons the answer has read
 * no content at all (@@D-837).
 */
export default handler(({lib: {storageDirectory, storageMetaFromEntry}}) => ({
    async storageBlobGet(
        params: {namespace: string; key: string},
        $meta?: unknown,
    ): Promise<{meta: IBlobMeta; stream: Readable} | null> {
        void $meta;
        const hit = await cacheGet(storageDirectory(this.config, params.namespace), params.key);
        if (!hit) return null;
        return {meta: storageMetaFromEntry(params.namespace, hit.entry), stream: hit.stream};
    },
}));
