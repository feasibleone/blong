import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {documents, mergeDocument, TEST_TAG, updatedFields} from '../fixtures/document.ts';

type DocResult = {
    documentId?: unknown;
    docType?: string;
    docTitle?: string;
    docContent?: string;
    docVersion?: number;
    testTag?: string;
    _id?: unknown;
};

type InsertResult = {insertedId: unknown; acknowledged?: boolean};
type InsertManyResult = {insertedCount: number; acknowledged?: boolean};
type UpdateResult = {modifiedCount: number; matchedCount?: number};
type DeleteResult = {deletedCount: number; acknowledged?: boolean};
type StepMeta = {$meta: Record<string, unknown>};

/**
 * testMongodbCrud — integration test covering all mongodb adapter CRUD operations:
 * add, get, find, edit, remove, merge, insert, update, delete.
 *
 * Steps run in a sequential dependency chain using the `document` collection.
 * All test documents are tagged with TEST_TAG for targeted cleanup.
 *
 * Dependency chain:
 *   cleanData → addDocument → getDocument → editDocument → mergeDocumentUpsert
 *                           ↘ findDocuments                → removeDocument
 *                           ↘ findWithLimit               → insertDocuments
 *                                                           → verifyInsert
 *                                                           → updateDocuments
 *                                                           → deleteDocuments
 *                                                           → verifyDelete
 */
export default handler(
    ({
        lib: {group},
        handler: {
            mongoDocumentAdd,
            mongoDocumentGet,
            mongoDocumentFind,
            mongoDocumentEdit,
            mongoDocumentRemove,
            mongoDocumentMerge,
            mongoDocumentInsert,
            mongoDocumentUpdate,
            mongoDocumentDelete,
        },
    }) => ({
        testMongodbCrud: ({name = 'mongodb CRUD'}: {name?: string}) =>
            group(name)([
                // ── 1. Cleanup any leftover test documents ────────────────
                async function cleanData(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await mongoDocumentDelete({testTag: TEST_TAG}, $meta);
                    assert.ok(result !== undefined, 'Initial cleanup delete returned a result');
                    return {cleaned: true};
                },

                // ── 2. add — insert a single document ────────────────────
                async function addDocument(
                    assert: typeof Assert,
                    {$meta, cleanData}: StepMeta & {cleanData: Promise<unknown>},
                ) {
                    await cleanData;
                    const result = await mongoDocumentAdd(
                        {...documents[0], testTag: TEST_TAG},
                        $meta,
                    );
                    assert.ok(result, 'add returned a result');
                    assert.ok(
                        (result as InsertResult).insertedId,
                        'add returned an insertedId',
                    );
                    assert.strictEqual(
                        (result as InsertResult).acknowledged,
                        true,
                        'add was acknowledged',
                    );
                    return result as InsertResult;
                },

                // ── 3. get — fetch the inserted document by _id ───────────
                async function getDocument(
                    assert: typeof Assert,
                    {$meta, addDocument}: StepMeta & {addDocument: Promise<InsertResult>},
                ) {
                    const {insertedId} = await addDocument;
                    const result = await mongoDocumentGet({documentId: insertedId}, $meta);
                    assert.ok(result, 'get returned a result');
                    assert.strictEqual(
                        (result as DocResult).docTitle,
                        documents[0].docTitle,
                        'get returned the correct docTitle',
                    );
                    assert.strictEqual(
                        (result as DocResult).docType,
                        documents[0].docType,
                        'get returned the correct docType',
                    );
                    return result as DocResult & {_id: unknown};
                },

                // ── 4. find — query documents with a filter ───────────────
                async function findDocuments(
                    assert: typeof Assert,
                    {$meta, addDocument}: StepMeta & {addDocument: Promise<InsertResult>},
                ) {
                    await addDocument;
                    const result = await mongoDocumentFind({testTag: TEST_TAG}, $meta);
                    assert.ok(Array.isArray(result), 'find returned an array');
                    assert.ok(
                        (result as DocResult[]).length >= 1,
                        'find returned at least one document',
                    );
                    assert.ok(
                        (result as DocResult[]).every(d => d.testTag === TEST_TAG),
                        'all returned documents match the filter',
                    );
                    return result as DocResult[];
                },

                // ── 5. find with limit ────────────────────────────────────
                async function findWithLimit(
                    assert: typeof Assert,
                    {$meta, addDocument}: StepMeta & {addDocument: Promise<InsertResult>},
                ) {
                    await addDocument;
                    const result = await mongoDocumentFind(
                        {testTag: TEST_TAG, limit: 1},
                        $meta,
                    );
                    assert.ok(Array.isArray(result), 'find with limit returned an array');
                    assert.ok(
                        (result as DocResult[]).length <= 1,
                        'find respects the limit parameter',
                    );
                    return result as DocResult[];
                },

                // ── 6. edit — partial update of a document ────────────────
                async function editDocument(
                    assert: typeof Assert,
                    {$meta, getDocument}: StepMeta & {
                        getDocument: Promise<DocResult & {_id: unknown}>;
                    },
                ) {
                    const doc = await getDocument;
                    const result = await mongoDocumentEdit(
                        {documentId: doc._id, ...updatedFields},
                        $meta,
                    );
                    assert.ok(result !== undefined, 'edit returned a result');
                    assert.ok(
                        (result as UpdateResult).modifiedCount >= 1,
                        'edit modified at least one document',
                    );
                    return {documentId: doc._id, edited: true};
                },

                // ── 7. verify edit ────────────────────────────────────────
                async function verifyEdit(
                    assert: typeof Assert,
                    {$meta, editDocument}: StepMeta & {
                        editDocument: Promise<{documentId: unknown; edited: boolean}>;
                    },
                ) {
                    const {documentId} = await editDocument;
                    const result = await mongoDocumentGet({documentId}, $meta);
                    assert.ok(result, 'get after edit returned a result');
                    assert.strictEqual(
                        (result as DocResult).docTitle,
                        updatedFields.docTitle,
                        'docTitle was updated correctly',
                    );
                    assert.strictEqual(
                        (result as DocResult).docVersion,
                        updatedFields.docVersion,
                        'docVersion was updated correctly',
                    );
                    return result as DocResult;
                },

                // ── 8. merge — upsert-update the edited document by _id ───
                async function mergeDocumentUpsert(
                    assert: typeof Assert,
                    {$meta, verifyEdit, editDocument}: StepMeta & {
                        verifyEdit: Promise<DocResult>;
                        editDocument: Promise<{documentId: unknown}>;
                    },
                ) {
                    await verifyEdit;
                    const {documentId} = await editDocument;
                    const result = await mongoDocumentMerge(
                        {documentId, ...mergeDocument, testTag: TEST_TAG},
                        $meta,
                    );
                    assert.ok(result !== undefined, 'merge returned a result');
                    return {documentId, merged: true};
                },

                // ── 9. verify merge ───────────────────────────────────────
                async function verifyMerge(
                    assert: typeof Assert,
                    {$meta, mergeDocumentUpsert}: StepMeta & {
                        mergeDocumentUpsert: Promise<{documentId: unknown; merged: boolean}>;
                    },
                ) {
                    const {documentId} = await mergeDocumentUpsert;
                    const result = await mongoDocumentGet({documentId}, $meta);
                    assert.ok(result, 'get after merge returned a result');
                    assert.strictEqual(
                        (result as DocResult).docTitle,
                        mergeDocument.docTitle,
                        'docTitle was updated by merge',
                    );
                    return result as DocResult;
                },

                // ── 10. remove — delete the document by _id ───────────────
                async function removeDocument(
                    assert: typeof Assert,
                    {$meta, verifyMerge, mergeDocumentUpsert}: StepMeta & {
                        verifyMerge: Promise<DocResult>;
                        mergeDocumentUpsert: Promise<{documentId: unknown}>;
                    },
                ) {
                    await verifyMerge;
                    const {documentId} = await mergeDocumentUpsert;
                    const result = await mongoDocumentRemove({documentId}, $meta);
                    assert.ok(result !== undefined, 'remove returned a result');
                    assert.ok(
                        (result as DeleteResult).deletedCount >= 1,
                        'remove deleted at least one document',
                    );
                    return {documentId, removed: true};
                },

                // ── 11. insert — bulk insert multiple documents ────────────
                async function insertDocuments(
                    assert: typeof Assert,
                    {$meta, removeDocument}: StepMeta & {removeDocument: Promise<unknown>},
                ) {
                    await removeDocument;
                    const result = await mongoDocumentInsert(
                        documents.map(d => ({...d, testTag: TEST_TAG})),
                        $meta,
                    );
                    assert.ok(result !== undefined, 'insert returned a result');
                    assert.strictEqual(
                        (result as InsertManyResult).insertedCount,
                        documents.length,
                        'insert inserted the correct number of documents',
                    );
                    assert.strictEqual(
                        (result as InsertManyResult).acknowledged,
                        true,
                        'insert was acknowledged',
                    );
                    return {inserted: true};
                },

                // ── 12. verify bulk insert ────────────────────────────────
                async function verifyInsert(
                    assert: typeof Assert,
                    {$meta, insertDocuments}: StepMeta & {insertDocuments: Promise<unknown>},
                ) {
                    await insertDocuments;
                    const result = await mongoDocumentFind({testTag: TEST_TAG}, $meta);
                    assert.ok(
                        Array.isArray(result),
                        'find after bulk insert returned an array',
                    );
                    assert.ok(
                        (result as DocResult[]).length >= documents.length,
                        'at least as many documents as inserted fixtures',
                    );
                    return {rowCount: (result as DocResult[]).length};
                },

                // ── 13. update — bulk update matching documents ────────────
                async function updateDocuments(
                    assert: typeof Assert,
                    {$meta, verifyInsert}: StepMeta & {verifyInsert: Promise<unknown>},
                ) {
                    await verifyInsert;
                    const result = await mongoDocumentUpdate(
                        {
                            testTag: TEST_TAG,
                            update: {$set: {docVersion: 99}},
                        },
                        $meta,
                    );
                    assert.ok(result !== undefined, 'update returned a result');
                    assert.ok(
                        (result as UpdateResult).modifiedCount >= 1,
                        'update modified at least one document',
                    );
                    return {updated: true};
                },

                // ── 14. delete — bulk delete all test documents ────────────
                async function deleteDocuments(
                    assert: typeof Assert,
                    {$meta, updateDocuments, findDocuments, findWithLimit}: StepMeta & {
                        updateDocuments: Promise<unknown>;
                        findDocuments: Promise<unknown>;
                        findWithLimit: Promise<unknown>;
                    },
                ) {
                    await updateDocuments;
                    await findDocuments;
                    await findWithLimit;
                    const result = await mongoDocumentDelete({testTag: TEST_TAG}, $meta);
                    assert.ok(result !== undefined, 'delete returned a result');
                    assert.ok(
                        (result as DeleteResult).deletedCount >= 1,
                        'delete removed at least one document',
                    );
                    return {deleted: true};
                },

                // ── 15. verify delete ─────────────────────────────────────
                async function verifyDelete(
                    assert: typeof Assert,
                    {$meta, deleteDocuments}: StepMeta & {deleteDocuments: Promise<unknown>},
                ) {
                    await deleteDocuments;
                    const result = await mongoDocumentFind({testTag: TEST_TAG}, $meta);
                    assert.ok(Array.isArray(result), 'find after delete returned an array');
                    assert.strictEqual(
                        (result as DocResult[]).length,
                        0,
                        'no documents remain after delete',
                    );
                    return result;
                },
            ]),
    }),
);
