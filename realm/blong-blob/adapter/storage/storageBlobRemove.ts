import {cacheRemove} from '../../store/storageCache.ts';
import {handler} from './handlerGroup.ts';

/**
 * Remove one blob's content and its metadata.
 *
 * The content file goes only when no other key refers to it, which is content addressing at work; the
 * index entry always goes. Derived variants are separate keys, removed by the caller that knows what
 * it asked for (@@D-844).
 */
export default handler(({lib: {storageDirectory}}) => ({
    async storageBlobRemove(
        params: {namespace: string; key: string},
        $meta?: unknown,
    ): Promise<{removed: boolean}> {
        void $meta;
        return {
            removed: await cacheRemove(storageDirectory(this.config, params.namespace), params.key),
        };
    },
}));
