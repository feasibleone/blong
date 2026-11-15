import type {IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';
import type {IS3StorePort} from './s3StoreLib.ts';

/**
 * `storage.blob.remove` — the bytes and the record beside them.
 *
 * Deleting the object and leaving the sidecar is a record that names nothing; deleting the sidecar and
 * leaving the object is a file nobody can find or account for. So both go, the record last, and the
 * answer says whether the content was there at all (@@D-838).
 */
export default handler(({lib: {s3StoreContentKey, s3StoreExec, s3StoreMetaKey, s3StoreNamespaceCheck}}) => ({
    async storageBlobRemove(
        params: {namespace: string; key: string},
        $meta?: IMeta,
    ): Promise<{removed: boolean}> {
        s3StoreNamespaceCheck(params.namespace);
        const port = this as unknown as IS3StorePort;
        const contentKey = s3StoreContentKey(params.namespace, params.key);
        const present = await s3StoreExec(port, {key: contentKey}, $meta as IMeta, 'head')
            .then(() => true)
            .catch(() => false);
        await s3StoreExec(port, {key: contentKey}, $meta as IMeta, 'remove').catch(() => null);
        await s3StoreExec(
            port,
            {key: s3StoreMetaKey(params.namespace, params.key)},
            $meta as IMeta,
            'remove',
        ).catch(() => null);
        return {removed: present};
    },
}));
