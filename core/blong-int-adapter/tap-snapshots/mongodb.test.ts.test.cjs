/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict'
exports[`mongodb.test.ts > TAP > blong int-adapter > mongodb CRUD > doc-reads 1`] = `
Object {
  "getDocument": Object {
    "_id": "<masked>",
    "docContent": "Content of the first blong integration test document",
    "docTitle": "Alpha Document",
    "docType": "blong-test",
    "docVersion": 1,
    "id": "<masked>",
    "testTag": "blong-crud-test",
  },
  "verifyEdit": Object {
    "_id": "<masked>",
    "docContent": "Updated content for integration test",
    "docTitle": "Alpha Document Updated",
    "docType": "blong-test",
    "docVersion": 2,
    "id": "<masked>",
    "testTag": "blong-crud-test",
  },
  "verifyMerge": Object {
    "_id": "<masked>",
    "docContent": "Upserted via merge in integration test",
    "docTitle": "Merged Document",
    "docType": "blong-test",
    "docVersion": 1,
    "id": "<masked>",
    "testTag": "blong-crud-test",
  },
}
`

exports[`mongodb.test.ts > TAP > blong int-adapter > mongodb CRUD > findDocuments > findDocuments 1`] = `
Array [
  Object {
    "_id": "<masked>",
    "docContent": "Content of the first blong integration test document",
    "docTitle": "Alpha Document",
    "docType": "blong-test",
    "docVersion": 1,
    "id": "<masked>",
    "testTag": "blong-crud-test",
  },
]
`

exports[`mongodb.test.ts > TAP > blong int-adapter > mongodb CRUD > getDocument > getDocument 1`] = `
Object {
  "_id": "<masked>",
  "docContent": "Content of the first blong integration test document",
  "docTitle": "Alpha Document",
  "docType": "blong-test",
  "docVersion": 1,
  "id": "<masked>",
  "testTag": "blong-crud-test",
}
`

exports[`mongodb.test.ts > TAP > blong int-adapter > mongodb CRUD > verifyEdit > verifyEdit 1`] = `
Object {
  "_id": "<masked>",
  "docContent": "Updated content for integration test",
  "docTitle": "Alpha Document Updated",
  "docType": "blong-test",
  "docVersion": 2,
  "id": "<masked>",
  "testTag": "blong-crud-test",
}
`

exports[`mongodb.test.ts > TAP > blong int-adapter > mongodb CRUD > verifyMerge > verifyMerge 1`] = `
Object {
  "_id": "<masked>",
  "docContent": "Upserted via merge in integration test",
  "docTitle": "Merged Document",
  "docType": "blong-test",
  "docVersion": 1,
  "id": "<masked>",
  "testTag": "blong-crud-test",
}
`
