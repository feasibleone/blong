import type {IBlobMeta, IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

/**
 * `blob.temp.cleanup` — remove everything whose lifetime has passed, in every namespace.
 *
 * A handler and not a timer: the schedule belongs to the deployment, because a realm that schedules its
 * own cleanup sweeps once per replica, and the replicas would race over the same records (@@D-840). A
 * caller passes `namespaces` when it knows better, and otherwise the store's own configuration answers
 * which namespaces exist.
 *
 * The cutoff is `now`, and it is exclusive at the record's edge: a record whose `expiresAt` is exactly
 * now is expired, because a lifetime nobody can point at is one a reader may already refuse.
 */
export default handler(({handler: {blobBlobFind, blobBlobRemove, storageBlobNamespaceFind}}) => ({
    async blobTempCleanup(
        params: {namespaces?: string[]; now?: string},
        $meta: IMeta,
    ): Promise<{removed: number; bytes: number}> {
        const namespaces = params?.namespaces?.length
            ? params.namespaces
            : ((
                  (await storageBlobNamespaceFind({}, $meta)) as {
                      namespaces?: string[];
                  }
              )?.namespaces ?? []);
        const expiredBefore = params?.now ?? new Date().toISOString();

        let removed = 0;
        let bytes = 0;
        for (const namespace of namespaces) {
            const found = (await blobBlobFind({namespace, expiredBefore}, $meta)) as {
                blob?: IBlobMeta[];
            };
            for (const meta of found?.blob ?? []) {
                // One removal that fails must not stop the sweep: the next run asks again, and a
                // record that refuses to go is the one a reader needs to see.
                try {
                    const answer = (await blobBlobRemove({namespace, key: meta.key}, $meta)) as {
                        removed?: boolean;
                        bytes?: number;
                    };
                    if (answer?.removed) {
                        removed += 1;
                        bytes += answer.bytes ?? 0;
                    }
                } catch {
                    // Counted by the next run rather than reported here; see @@D-840.
                }
            }
        }
        return {removed, bytes};
    },
}));
