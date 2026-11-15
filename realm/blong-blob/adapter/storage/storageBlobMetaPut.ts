import {handler} from './handlerGroup.ts';
import {cacheMetaPut} from '../../store/storageCache.ts';

/**
 * Replace one blob's metadata without touching its content.
 *
 * A commit flips a record's state; an edit changes its scopes. Neither touches the bytes, and the
 * index entry is what carries both, so the content stays where it is (@@D-838).
 */
export default handler(({lib: {storageDirectory}}) => ({
    async storageBlobMetaPut(
        params: {namespace: string; key: string; metadata: Parameters<typeof cacheMetaPut>[2]},
        $meta?: unknown,
    ): Promise<{updated: boolean}> {
        void $meta;
        return {
            updated: await cacheMetaPut(
                storageDirectory(params.namespace),
                params.key,
                params.metadata,
            ),
        };
    },
}));
