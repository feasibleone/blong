/**
 * Fixture data for S3 integration tests.
 * Used by testS3ObjectCrud to seed and verify CRUD operations on the S3 bucket.
 */

export const objects = [
    {
        key: 'test/blong-text.txt',
        body: 'blong integration test text content',
        contentType: 'text/plain',
    },
    {
        key: 'test/blong-json.json',
        body: JSON.stringify({blongTest: true, sequence: 1}),
        contentType: 'application/json',
    },
] as const;

export const objectWithMetadata = {
    key: 'test/blong-with-meta.txt',
    body: 'object with custom metadata for blong integration test',
    contentType: 'text/plain',
    metadata: {
        'blong-test': 'true',
        'test-source': 'blong-integration',
    },
} as const;

/** Destination key used in copy tests. */
export const copiedKey = 'test/blong-copy.txt';

/** Prefix used to scope all test objects for listing and cleanup. */
export const PREFIX = 'test/blong';
