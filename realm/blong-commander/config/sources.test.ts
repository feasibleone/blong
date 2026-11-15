/**
 * The S3 source's row filter.
 *
 * The exclusion is the fix for a page whose contents depended on what another suite had stored: the
 * blob realm keeps its records in the same bucket, so every integration run left hundreds of
 * `blob-test/test/<uuid>` keys and their variants in the tree, and the screenshot of a dev backend
 * drifted with them (`@@D-866`). The pattern is asserted here so an edit to the source has to keep
 * the seeded object and keep dropping the store's probes.
 */

import {test} from 'tap';

import {levelRowsSelect} from '../branch/levelRowsSelect.ts';
import {sources} from './sources.ts';

const objectLevel = (): Parameters<typeof levelRowsSelect>[0] => {
    const s3 = sources.find(source => source.name === 's3-dev');
    if (!s3) throw new Error('the s3-dev source is gone');
    const level = s3.levels.find(candidate => candidate.resourceType === 'object');
    if (!level) throw new Error('the s3-dev source has no object level');
    return level;
};

const keys = (rows: string[]): string[] =>
    (
        levelRowsSelect(
            objectLevel(),
            rows.map(Key => ({Key})),
        ) as Array<{Key: string}>
    ).map(row => row.Key);

test('the S3 object level drops the blob store’s probe records and keeps the seeded object', t => {
    t.same(
        keys([
            'commander/hello.txt',
            'blob-test/test/027b6637-736e-4394-91b3-6633d2addd10',
            'blob-test/test/0c87c734-1edf-4c22-80de-09c7d9573447-normal',
            'blob-test/test/0c87c734-1edf-4c22-80de-09c7d9573447.meta.json',
            'blob-test/party/avatar.png',
        ]),
        ['commander/hello.txt', 'blob-test/party/avatar.png'],
        'a probe in the store’s test namespace is noise; a deployment’s own namespace is content',
    );
    t.end();
});

test('the filter is on the key the level displays, so a bucket name is never mistaken for one', t => {
    const bucketLevel = sources
        .find(source => source.name === 's3-dev')
        ?.levels.find(level => level.resourceType === 'bucket');
    t.equal(bucketLevel?.exclude, undefined, 'the bucket level lists every bucket');
    t.end();
});
