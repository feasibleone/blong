import type {IMeta} from '@feasibleone/blong';

import {handler} from '../blob/handlerGroup.ts';

/**
 * Remove an upload, whatever state it reached.
 *
 * A form that cancels calls this, and so does the cleanup sweep for a record nobody came back for.
 * Both want the same thing: the content gone, the index entry gone, and an answer that says whether
 * there was anything to remove (@@D-840).
 */
export default handler(({handler: {storageBlobRemove}}) => ({
    async blobUploadDiscard(
        params: {namespace: string; key: string},
        $meta: IMeta,
    ): Promise<{discarded: boolean}> {
        const {removed} = (await storageBlobRemove(
            {namespace: params.namespace, key: params.key},
            $meta,
        )) as {removed: boolean};
        return {discarded: removed};
    },
}));
