import type {IStorageInfo} from '../storage/storageInfo.ts';

import {handler} from './handlerGroup.ts';

/**
 * What the object store can do, and what went wrong last.
 *
 * A bucket streams and ranges natively — a `GET` with a `Range` header comes back as a `206` — and its
 * records are objects, so the ceiling a caller has to respect is the deployment's own, not the
 * backend's. The failure it reports is the last one its port saw, which is what a probe reads when a
 * deployment's storage is unreachable but the process is up (@@D-838).
 */
export default handler(() => ({
    async storageInfo(): Promise<IStorageInfo> {
        const context = (this.config as {context?: {lastFailure?: IStorageInfo['lastFailure']}})
            ?.context;
        return {
            backend: 's3',
            streams: true,
            ranges: true,
            metadataCeiling: null,
            lastFailure: context?.lastFailure ?? null,
        };
    },
}));
