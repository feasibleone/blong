/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict';
exports[`s3.test.ts > TAP > blong int-adapter > s3 object CRUD > addJsonObject > addJsonObject 1`] =
    `
Object {
  "etag": "<masked>",
  "key": "test/blong-json.json",
}
`;

exports[
    `s3.test.ts > TAP > blong int-adapter > s3 object CRUD > addObjectWithMetadata > addObjectWithMetadata 1`
] = `
Object {
  "etag": "<masked>",
  "key": "test/blong-with-meta.txt",
}
`;

exports[`s3.test.ts > TAP > blong int-adapter > s3 object CRUD > addTextObject > addTextObject 1`] =
    `
Object {
  "etag": "<masked>",
  "key": "test/blong-text.txt",
}
`;

exports[`s3.test.ts > TAP > blong int-adapter > s3 object CRUD > findObjects > findObjects 1`] = `
Object {
  "$metadata": Object {
    "attempts": 1,
    "extendedRequestId": "<masked>",
    "httpStatusCode": 200,
    "requestId": "<masked>",
    "totalRetryDelay": 0,
  },
  "Contents": Array [
    Object {
      "ETag": "<masked>",
      "Key": "test/blong-json.json",
      "LastModified": "<masked>",
      "Size": 31,
      "StorageClass": "STANDARD",
    },
    Object {
      "ETag": "<masked>",
      "Key": "test/blong-text.txt",
      "LastModified": "<masked>",
      "Size": 35,
      "StorageClass": "STANDARD",
    },
    Object {
      "ETag": "<masked>",
      "Key": "test/blong-with-meta.txt",
      "LastModified": "<masked>",
      "Size": 54,
      "StorageClass": "STANDARD",
    },
  ],
  "IsTruncated": false,
  "KeyCount": 3,
  "MaxKeys": 1000,
  "Name": "blong-integration",
  "Prefix": "test/blong",
}
`;

exports[`s3.test.ts > TAP > blong int-adapter > s3 object CRUD > getNewKey > getNewKey 1`] = `
Object {
  "body": "<masked>",
  "contentLength": 35,
  "contentType": "text/plain",
  "etag": "<masked>",
  "lastModified": "<masked>",
  "metadata": Object {},
}
`;

exports[`s3.test.ts > TAP > blong int-adapter > s3 object CRUD > getTextObject > getTextObject 1`] =
    `
Object {
  "body": "<masked>",
  "contentLength": 35,
  "contentType": "text/plain",
  "etag": "<masked>",
  "lastModified": "<masked>",
  "metadata": Object {},
}
`;

exports[`s3.test.ts > TAP > blong int-adapter > s3 object CRUD > headObject > headObject 1`] = `
Object {
  "$metadata": Object {
    "attempts": 1,
    "extendedRequestId": "<masked>",
    "httpStatusCode": 200,
    "requestId": "<masked>",
    "totalRetryDelay": 0,
  },
  "AcceptRanges": "bytes",
  "ContentLength": 35,
  "ContentType": "text/plain",
  "ETag": "<masked>",
  "LastModified": "<masked>",
  "Metadata": Object {},
}
`;

exports[`s3.test.ts > TAP > blong int-adapter > s3 object CRUD > object-reads 1`] = `
Object {
  "findObjects": Object {
    "$metadata": Object {
      "attempts": 1,
      "extendedRequestId": "<masked>",
      "httpStatusCode": 200,
      "requestId": "<masked>",
      "totalRetryDelay": 0,
    },
    "Contents": Array [
      Object {
        "ETag": "<masked>",
        "Key": "test/blong-json.json",
        "LastModified": "<masked>",
        "Size": 31,
        "StorageClass": "STANDARD",
      },
      Object {
        "ETag": "<masked>",
        "Key": "test/blong-text.txt",
        "LastModified": "<masked>",
        "Size": 35,
        "StorageClass": "STANDARD",
      },
      Object {
        "ETag": "<masked>",
        "Key": "test/blong-with-meta.txt",
        "LastModified": "<masked>",
        "Size": 54,
        "StorageClass": "STANDARD",
      },
    ],
    "IsTruncated": false,
    "KeyCount": 3,
    "MaxKeys": 1000,
    "Name": "blong-integration",
    "Prefix": "test/blong",
  },
  "getNewKey": Object {
    "body": "<masked>",
    "contentLength": 35,
    "contentType": "text/plain",
    "etag": "<masked>",
    "lastModified": "<masked>",
    "metadata": Object {},
  },
  "getTextObject": Object {
    "body": "<masked>",
    "contentLength": 35,
    "contentType": "text/plain",
    "etag": "<masked>",
    "lastModified": "<masked>",
    "metadata": Object {},
  },
  "headObject": Object {
    "$metadata": Object {
      "attempts": 1,
      "extendedRequestId": "<masked>",
      "httpStatusCode": 200,
      "requestId": "<masked>",
      "totalRetryDelay": 0,
    },
    "AcceptRanges": "bytes",
    "ContentLength": 35,
    "ContentType": "text/plain",
    "ETag": "<masked>",
    "LastModified": "<masked>",
    "Metadata": Object {},
  },
}
`;
