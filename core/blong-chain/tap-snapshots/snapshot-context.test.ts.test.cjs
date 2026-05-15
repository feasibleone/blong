/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict'
exports[`snapshot-context.test.ts > TAP > Hybrid — business assertions + sentinel snapshots + end-of-chain > addBeneficiary > addBeneficiary 1`] = `
Object {
  "accountId": "acct-1679091c-5a88-3faf-afb5-e6087eb1b2dc",
  "beneficiaryId": "bene-8f14e45f-ceea-367f-a27e-3d305db0bbba",
  "beneficiaryName": "Bob",
  "verified": true,
}
`

exports[`snapshot-context.test.ts > TAP > Hybrid — business assertions + sentinel snapshots + end-of-chain > hybrid-full-context 1`] = `
Object {
  "addBeneficiary": Object {
    "accountId": "acct-1679091c-5a88-3faf-afb5-e6087eb1b2dc",
    "beneficiaryId": "bene-8f14e45f-ceea-367f-a27e-3d305db0bbba",
    "beneficiaryName": "Bob",
    "verified": true,
  },
  "provisionAccount": Object {
    "accountId": "acct-1679091c-5a88-3faf-afb5-e6087eb1b2dc",
    "accountType": "SAVINGS",
    "balance": 1000,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "currency": "USD",
  },
  "sendPayment": Object {
    "amount": 50,
    "beneficiaryId": "bene-8f14e45f-ceea-367f-a27e-3d305db0bbba",
    "currency": "USD",
    "paymentId": "pay-c9f0f895-fb98-ab9d-b83c-cc3db15a82a6",
    "status": "COMPLETED",
    "timestamp": "2024-01-01T12:00:00.000Z",
  },
  "verifyBalance": Object {
    "accountId": "acct-1679091c-5a88-3faf-afb5-e6087eb1b2dc",
    "currency": "USD",
    "newBalance": 950,
  },
}
`

exports[`snapshot-context.test.ts > TAP > Hybrid — business assertions + sentinel snapshots + end-of-chain > provisionAccount > provisionAccount 1`] = `
Object {
  "accountId": "acct-1679091c-5a88-3faf-afb5-e6087eb1b2dc",
  "accountType": "SAVINGS",
  "balance": 1000,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "currency": "USD",
}
`

exports[`snapshot-context.test.ts > TAP > Strategy A — autoSnapshot: true (fully automatic) > createQuote > createQuote 1`] = `
Object {
  "quoteId": "quote-a87ff679-a2f3-461d-a2bf-3bf5e3eef8c5",
  "receiveAmount": 99.5,
  "receiveCurrency": "USD",
  "receiverPartyId": "party-f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454",
  "sendAmount": 100,
  "sendCurrency": "USD",
}
`

exports[`snapshot-context.test.ts > TAP > Strategy A — autoSnapshot: true (fully automatic) > executeTransfer > executeTransfer 1`] = `
Object {
  "completedTimestamp": "2024-01-01T00:00:00.000Z",
  "quoteId": "quote-a87ff679-a2f3-461d-a2bf-3bf5e3eef8c5",
  "transferId": "txn-45c48cce-2e2d-4f98-a50b-e1a6ab2f7289",
  "transferState": "COMMITTED",
}
`

exports[`snapshot-context.test.ts > TAP > Strategy A — autoSnapshot: true (fully automatic) > resolveParty > resolveParty 1`] = `
Object {
  "partyId": "party-f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454",
  "partyName": "Alice",
  "partyType": "MSISDN",
  "verified": true,
}
`

exports[`snapshot-context.test.ts > TAP > Strategy B — ['*'] end-of-chain checkpoint > p2p-flow 1`] = `
Object {
  "createQuote": Object {
    "expiry": "2024-01-01T00:00:00.000Z",
    "quoteId": "quote-a87ff679-a2f3-461d-a2bf-3bf5e3eef8c5",
    "receiveAmount": 99.5,
    "receiveCurrency": "USD",
    "receiverPartyId": "party-f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454",
    "sendAmount": 100,
    "sendCurrency": "USD",
  },
  "executeTransfer": Object {
    "completedTimestamp": "2024-01-01T00:00:00.000Z",
    "quoteId": "quote-a87ff679-a2f3-461d-a2bf-3bf5e3eef8c5",
    "transferId": "txn-45c48cce-2e2d-4f98-a50b-e1a6ab2f7289",
    "transferState": "COMMITTED",
  },
  "resolveParty": Object {
    "partyId": "party-f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454",
    "partyName": "Alice",
    "partyType": "MSISDN",
    "verified": true,
  },
  "verifyTransfer": Object {
    "finalState": "COMMITTED",
    "verified": true,
  },
}
`

exports[`snapshot-context.test.ts > TAP > Strategy C — phase checkpoints > phase1 1`] = `
Object {
  "fetchConfig": Object {
    "language": "en",
    "theme": "dark",
    "version": "1.0",
  },
  "fetchProfile": Object {
    "displayName": "Carol",
    "profileId": "profile-eccbc87e-4b5c-4329-9f8a-c5f47a78a61a",
    "role": "admin",
  },
}
`

exports[`snapshot-context.test.ts > TAP > Strategy C — phase checkpoints > phase2-1 1`] = `
Object {
  "buildDashboard": Object {
    "theme": "dark",
    "title": "Carol's dashboard",
  },
  "renderWidget": Object {
    "language": "en",
    "rendered": true,
    "widgetId": "widget-c4ca4238-a0b9-3382-8dcc-509a6f75849b",
  },
}
`

exports[`snapshot-context.test.ts > TAP > Strategy D — assert.snapshot() no-args per-step > createQuote > createQuote 1`] = `
Object {
  "expiry": "2024-01-01T00:00:00.000Z",
  "quoteId": "quote-a87ff679-a2f3-461d-a2bf-3bf5e3eef8c5",
  "receiveAmount": 99.5,
  "receiveCurrency": "USD",
  "receiverPartyId": "party-f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454",
  "sendAmount": 100,
  "sendCurrency": "USD",
}
`

exports[`snapshot-context.test.ts > TAP > Strategy D — assert.snapshot() no-args per-step > executeTransfer > executeTransfer 1`] = `
Object {
  "completedTimestamp": "2024-01-01T00:00:00.000Z",
  "quoteId": "quote-a87ff679-a2f3-461d-a2bf-3bf5e3eef8c5",
  "transferId": "txn-45c48cce-2e2d-4f98-a50b-e1a6ab2f7289",
  "transferState": "COMMITTED",
}
`

exports[`snapshot-context.test.ts > TAP > Strategy D — assert.snapshot() no-args per-step > resolveParty > resolveParty 1`] = `
Object {
  "partyId": "party-f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454",
  "partyName": "Alice",
  "partyType": "MSISDN",
  "verified": true,
}
`
