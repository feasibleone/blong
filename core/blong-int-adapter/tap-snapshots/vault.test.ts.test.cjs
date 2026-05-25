/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict';
exports[`vault.test.ts > TAP > blong int-adapter > vault secret CRUD > readAlpha > readAlpha 1`] = `
Object {
  "blongKey": "alpha-value",
  "blongSource": "blong-integration",
}
`;

exports[`vault.test.ts > TAP > blong int-adapter > vault secret CRUD > secret-read-snapshots 1`] = `
Object {
  "readAlpha": Object {
    "blongKey": "alpha-value",
    "blongSource": "blong-integration",
  },
  "verifyUpdate": Object {
    "blongKey": "alpha-updated",
    "blongSource": "blong-integration-updated",
  },
}
`;

exports[
    `vault.test.ts > TAP > blong int-adapter > vault secret CRUD > verifyUpdate > verifyUpdate 1`
] = `
Object {
  "blongKey": "alpha-updated",
  "blongSource": "blong-integration-updated",
}
`;
