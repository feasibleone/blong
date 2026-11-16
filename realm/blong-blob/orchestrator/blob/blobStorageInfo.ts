import type {IMeta} from '@feasibleone/blong';

import {blobPortConfig, blobSettings} from '../../blob/blobSettings.ts';
import type {IStorageInfo} from '../../adapter/storage/storageInfo.ts';
import {handler} from './handlerGroup.ts';

/** What a deployment probe and a client are told about the store in front of them. */
export interface IBlobStorageInfo extends IStorageInfo {
    /** The largest payload this realm accepts inside a JSON call, which is its own limit. */
    base64Ceiling: number;
}

/**
 * `blob.storage.info` — which backend answers, what it can do, and what went wrong last.
 *
 * The answer comes from the backend itself, because it is the only thing that knows: the filesystem
 * streams and slices, an object store does both natively, and a deployment may have replaced either with
 * something narrower. A caller decides between a streamed upload and a base64 call with this — so the
 * realm adds its own ceiling, which no store can see (@@D-838 @@D-849).
 *
 * A process with no store configured at all is a real answer too: it is a realm that was carried but never
 * given a place to put bytes, and the error says which block to write.
 */
export default handler(({errors, config, handler}) => ({
    async blobStorageInfo(_params: object, $meta: IMeta): Promise<IBlobStorageInfo> {
        const info = (handler as Record<string, unknown>)['storageInfo'] as
            | ((p: object, m: IMeta) => Promise<IStorageInfo | null>)
            | undefined;
        if (typeof info !== 'function') {
            throw errors['blob.configurationError']({
                params: {
                    reason:
                        'no store is configured — name blob.store.blob (filesystem) or ' +
                        'blob.s3Store (object store) and set the other to false',
                },
            });
        }
        const answer = await info({}, $meta);
        if (!answer) {
            throw errors['blob.configurationError']({
                params: {reason: 'the configured store does not report its capabilities'},
            });
        }
        return {
            ...answer,
            base64Ceiling: blobSettings(config, blobPortConfig(this)).upload.base64MaxBytes,
        };
    },
}));
