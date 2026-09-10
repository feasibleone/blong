/**
 * Fixture data for MongoDB integration tests.
 * Used by testMongodbCrud to seed and verify CRUD operations on the `document` collection.
 */

export const documents = [
    {
        docType: 'blong-test',
        docTitle: 'Alpha Document',
        docContent: 'Content of the first blong integration test document',
        docVersion: 1,
    },
    {
        docType: 'blong-test',
        docTitle: 'Beta Document',
        docContent: 'Content of the second blong integration test document',
        docVersion: 1,
    },
    {
        docType: 'blong-test',
        docTitle: 'Gamma Document',
        docContent: 'Content of the third blong integration test document',
        docVersion: 1,
    },
] as const;

export const updatedFields = {
    docTitle: 'Alpha Document Updated',
    docContent: 'Updated content for integration test',
    docVersion: 2,
} as const;

export const mergeDocument = {
    docType: 'blong-test',
    docTitle: 'Merged Document',
    docContent: 'Upserted via merge in integration test',
    docVersion: 1,
} as const;

/** Tag used to isolate and clean up documents created during each test run. */
export const TEST_TAG = 'blong-crud-test';
