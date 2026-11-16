import type {IBlobMeta} from '@feasibleone/blong';
import type {Readable} from 'node:stream';

import {cachePut} from '../../store/storageCache.ts';
import {handler} from './handlerGroup.ts';

/**
 * Write one blob's content, with its metadata, into its namespace's store.
 *
 * The body stays a stream: the cache writes it to a content-addressed file as it arrives, so a
 * 200 MiB upload costs a few kilobytes of memory rather than the file's size (@@D-838). The metadata
 * rides in the index entry written beside the content, which is what makes `head` a metadata read.
 */
export default handler(({lib: {storageDirectory}}) => ({
    async storageBlobPut(
        params: {namespace: string; key: string; body: Readable; metadata: IBlobMeta},
        $meta?: unknown,
    ): Promise<{key: string; size: number}> {
        void $meta;
        await cachePut(
            storageDirectory(this.config, params.namespace),
            params.key,
            params.body,
            params.metadata,
        );
        return {key: params.key, size: params.metadata.size};
    },
}));
