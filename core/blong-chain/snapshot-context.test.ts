/**
 * Context Snapshotting Demonstration
 *
 * Shows five strategies for snapshot-testing blong-chain step results, ordered
 * from most automatic (invisible) to most explicit.
 *
 * Strategies:
 *   autoSnapshot  — fully automatic: executor captures every step result, no
 *                   assert.snapshot() calls needed anywhere
 *   ["*"]         — end-of-chain checkpoint: single declarative marker captures
 *                   the whole context after all steps finish
 *   ["s1","s2"]  — phase checkpoints: markers capture named subsets at phase
 *                   boundaries, narrowing failure to a specific phase
 *   assert.snapshot()
 *                 — per-step no-args: executor snapshots the return value under
 *                   the step name automatically after the function returns
 *   Hybrid        — assert.equal for business rules + assert.snapshot() for
 *                   critical steps + ["*"] for full regression coverage
 *
 * Chain-level masking is configured once in the TestExecutor constructor via
 * mask: string[]. Per-step overrides use assert.snapshot({mask: [...]}).
 *
 * Test data uses stable constant IDs so no masking is needed in these demos.
 * In real tests with dynamic IDs configure mask in the executor or per-call.
 *
 * Re-generate snapshots:  TAP_SNAPSHOT=1 tap snapshot-context.test.ts
 * Run tests:              tap snapshot-context.test.ts
 */

import tap from 'tap';
import {TestExecutor, type StepArray} from './index.js';

const PARTY_ID = 'party-f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454';
const QUOTE_ID = 'quote-a87ff679-a2f3-461d-a2bf-3bf5e3eef8c5';
const TRANSFER_ID = 'txn-45c48cce-2e2d-4f98-a50b-e1a6ab2f7289';
const PROFILE_ID = 'profile-eccbc87e-4b5c-4329-9f8a-c5f47a78a61a';
const WIDGET_ID = 'widget-c4ca4238-a0b9-3382-8dcc-509a6f75849b';
const ACCOUNT_ID = 'acct-1679091c-5a88-3faf-afb5-e6087eb1b2dc';
const BENEFICIARY_ID = 'bene-8f14e45f-ceea-367f-a27e-3d305db0bbba';
const PAYMENT_ID = 'pay-c9f0f895-fb98-ab9d-b83c-cc3db15a82a6';

// Strategy A — autoSnapshot: true  (most automatic, "invisible")
//
// Pass autoSnapshot: true to the executor. Every step return value is
// snapshotted under the function name automatically. No code changes needed
// inside step functions. Chain-level mask handles dynamic fields once.
//
// Best for: regression suites, migrated collections, any chain where you want
// comprehensive coverage with zero per-step boilerplate.

tap.test('Strategy A — autoSnapshot: true (fully automatic)', async t => {
    const executor = new TestExecutor({concurrency: 4, autoSnapshot: true});
    // To mask dynamic fields add: mask: ["*.id", "*.createdAt"]

    const steps: StepArray = [
        async function resolveParty() {
            return {partyId: PARTY_ID, partyName: 'Alice', partyType: 'MSISDN', verified: true};
        },

        async function createQuote(_assert: unknown, context) {
            const party = (await context.resolveParty) as {
                partyId: string;
                partyName: string;
                partyType: string;
                verified: boolean;
            };
            return {
                quoteId: QUOTE_ID,
                receiverPartyId: party.partyId as string,
                sendAmount: 100,
                sendCurrency: 'USD',
                receiveAmount: 99.5,
                receiveCurrency: 'USD',
            };
        },

        async function executeTransfer(_assert: unknown, context) {
            const quote = (await context.createQuote) as {
                quoteId: string;
                receiverPartyId: string;
                sendAmount: number;
                sendCurrency: string;
                receiveAmount: number;
                receiveCurrency: string;
            };
            return {
                transferId: TRANSFER_ID,
                quoteId: quote.quoteId as string,
                transferState: 'COMMITTED',
                completedTimestamp: '2024-01-01T00:00:00.000Z',
            };
        },
    ];

    // Pass t so each step gets its own TAP sub-test for the auto-snapshot.
    await executor.execute(steps, {}, t);
});

// Strategy B — ["*"] end-of-chain checkpoint  (declarative, one marker)
//
// A ["*"] marker at the end of the steps array snapshots the full accumulated
// context after all steps finish. The .name property gives the snapshot a
// stable, descriptive key.
//
// Best for: regression suites needing one comprehensive snapshot without
// boilerplate in individual step functions.

tap.test("Strategy B — ['*'] end-of-chain checkpoint", async t => {
    const executor = new TestExecutor({concurrency: 4});

    const steps: StepArray = [
        async function resolveParty() {
            return {partyId: PARTY_ID, partyName: 'Alice', partyType: 'MSISDN', verified: true};
        },

        async function createQuote(_assert: unknown, context) {
            const party = (await context.resolveParty) as {partyId: string};
            return {
                quoteId: QUOTE_ID,
                receiverPartyId: party.partyId as string,
                sendAmount: 100,
                sendCurrency: 'USD',
                receiveAmount: 99.5,
                receiveCurrency: 'USD',
                expiry: '2024-01-01T00:00:00.000Z',
            };
        },

        async function executeTransfer(_assert: unknown, context) {
            const quote = (await context.createQuote) as {quoteId: string};
            return {
                transferId: TRANSFER_ID,
                quoteId: quote.quoteId as string,
                transferState: 'COMMITTED',
                completedTimestamp: '2024-01-01T00:00:00.000Z',
            };
        },

        async function verifyTransfer(_assert: unknown, context) {
            const transfer = (await context.executeTransfer) as {transferState: string};
            return {
                verified: (transfer.transferState as string) === 'COMMITTED',
                finalState: transfer.transferState as string,
            };
        },

        // Single declarative marker: snapshot the full context when done.
        Object.assign(['*'], {name: 'p2p-flow'}),
    ];

    await executor.execute(steps, {}, t);
});

// Strategy C — phase checkpoints  (phase-boundary snapshots)
//
// Named checkpoint markers capture named subsets of step results at phase
// boundaries. Failure narrows to the specific failing phase.
//
// Best for: multi-phase flows (provisioning => execution => verification).

tap.test('Strategy C — phase checkpoints', async t => {
    const executor = new TestExecutor({concurrency: 4});

    const steps: StepArray = [
        // Phase 1: data fetching (parallel)
        async function fetchProfile() {
            return {profileId: PROFILE_ID, displayName: 'Carol', role: 'admin'};
        },

        async function fetchConfig() {
            return {theme: 'dark', language: 'en', version: '1.0'};
        },

        // Failure here => data fetching problem
        Object.assign(['fetchProfile', 'fetchConfig'], {name: 'phase1'}),

        // Phase 2: rendering (depends on Phase 1)
        async function buildDashboard(_assert: unknown, context) {
            const profile = (await context.fetchProfile) as {displayName: string};
            const config = (await context.fetchConfig) as {theme: string; language: string};
            return {
                title: (profile.displayName as string) + "'s dashboard",
                theme: config.theme as string,
            };
        },

        async function renderWidget(_assert: unknown, context) {
            const config = (await context.fetchConfig) as {theme: string; language: string};
            return {rendered: true, widgetId: WIDGET_ID, language: config.language};
        },

        // Failure here => rendering/composition problem
        Object.assign(['buildDashboard', 'renderWidget'], {name: 'phase2'}),
    ];

    await executor.execute(steps, {}, t);
});

// Strategy D — assert.snapshot() no-args (per-step, named after step)
//
// Call assert.snapshot() with no arguments inside a step. The executor
// intercepts the return value after the function resolves and calls
// matchSnapshot(result, stepName) automatically — no value or name needed.
//
// With dynamic fields: assert.snapshot({mask: ["id", "createdAt"]})
//
// Best for: steps with complex response structures that must be independently
// validated.

tap.test('Strategy D — assert.snapshot() no-args per-step', async t => {
    const executor = new TestExecutor({concurrency: 4});

    const steps: StepArray = [
        async function resolveParty(assert) {
            assert.snapshot(); // executor snapshots return value as "resolveParty"
            return {partyId: PARTY_ID, partyName: 'Alice', partyType: 'MSISDN', verified: true};
        },

        async function createQuote(assert, context) {
            const party = (await context.resolveParty) as {partyId: string};
            assert.snapshot();
            return {
                quoteId: QUOTE_ID,
                receiverPartyId: party.partyId as string,
                sendAmount: 100,
                sendCurrency: 'USD',
                receiveAmount: 99.5,
                receiveCurrency: 'USD',
                expiry: '2024-01-01T00:00:00.000Z',
            };
        },

        async function executeTransfer(assert, context) {
            const quote = (await context.createQuote) as {quoteId: string};
            assert.snapshot();
            return {
                transferId: TRANSFER_ID,
                quoteId: quote.quoteId as string,
                transferState: 'COMMITTED',
                completedTimestamp: '2024-01-01T00:00:00.000Z',
            };
        },
    ];

    await executor.execute(steps, {}, t);
});

// Hybrid — assert.equal for business rules + assert.snapshot() for critical
//           steps + ["*"] for full regression coverage
//
// The recommended approach for production test suites:
//   - assert.equal for specific business invariants (explicit intent)
//   - assert.snapshot() in sentinel steps (lock in their full shape)
//   - ["*"] at the end (comprehensive regression coverage)

tap.test('Hybrid — business assertions + sentinel snapshots + end-of-chain', async t => {
    const executor = new TestExecutor({concurrency: 4});

    const steps: StepArray = [
        async function provisionAccount(assert) {
            const result = {
                accountId: ACCOUNT_ID,
                balance: 1000,
                currency: 'USD',
                accountType: 'SAVINGS',
                createdAt: '2024-01-01T00:00:00.000Z',
            };
            assert.snapshot(); // lock in the provisioning structure
            return result;
        },

        async function addBeneficiary(assert, context) {
            const account = (await context.provisionAccount) as {accountId: string};
            const result = {
                accountId: account.accountId as string,
                beneficiaryId: BENEFICIARY_ID,
                beneficiaryName: 'Bob',
                verified: true,
            };
            assert.snapshot(); // lock in the beneficiary structure
            return result;
        },

        async function sendPayment(assert, context) {
            const beneficiary = (await context.addBeneficiary) as {beneficiaryId: string};
            const result = {
                paymentId: PAYMENT_ID,
                beneficiaryId: beneficiary.beneficiaryId as string,
                amount: 50,
                currency: 'USD',
                status: 'COMPLETED',
                timestamp: '2024-01-01T12:00:00.000Z',
            };
            // Targeted assertion documents the business invariant explicitly.
            assert.equal(result.status, 'COMPLETED', 'payment must reach COMPLETED state');
            return result;
        },

        async function verifyBalance(_assert, context) {
            const payment = (await context.sendPayment) as {currency: string};
            return {accountId: ACCOUNT_ID, currency: payment.currency, newBalance: 950};
        },

        // End-of-chain checkpoint for full regression coverage.
        Object.assign(['*'], {name: 'hybrid-full-context'}),
    ];

    await executor.execute(steps, {}, t);
});
