import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * testS3BucketList — integration test for the commander explore vocabulary of
 * `adapter.s3`:
 *   `storage.bucket.list` → enumerate buckets on the endpoint
 */
export default handler(({lib: {group}, handler: {storageBucketList}}) => ({
    testS3BucketList: ({name = 's3 bucket explore list'}: {name?: string}) =>
        group(name)([
            async function listBuckets(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const result = await storageBucketList({}, $meta);
                const items = (result as {items?: unknown[]}).items ?? [];
                assert.ok(Array.isArray(items), 'bucket.list should return items');
                return result;
            },
        ]),
}));
