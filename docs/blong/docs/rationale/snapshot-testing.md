# Snapshot Testing

Snapshot testing is an approach where the expected output of a test is captured
once and stored as a reference "snapshot". Subsequent test runs compare the
actual output against the stored snapshot to detect regressions.

## Problem

Many test collections contain repetitive assertions that check individual
properties of API responses. For example, a single API response assertion block
may contain dozens of field-by-field checks:

```typescript
assert.equal(result.status, 200);
assert.equal(result.body.transferState, 'COMMITTED');
assert.equal(result.body.completedTimestamp !== undefined, true);
assert.equal(result.body.transferId, transferId);
// ... many more assertions
```

This pattern has several issues:

- **Verbosity**: Large numbers of assertions obscure the test intent
- **Maintenance burden**: When API responses change, every assertion must be
  updated individually
- **Incomplete coverage**: Developers may skip asserting certain fields, missing
  regressions
- **Duplication**: The same assertion patterns repeat across many test files

## Solution

Snapshot testing addresses these issues by capturing the complete expected
output structure and comparing it as a whole:

```typescript
const result = await transferTransferGet({transferId}, $meta);
assert.snapshot(result, 'transfer-committed');
```

The snapshot file stores the complete expected structure, and the test framework
handles the comparison automatically.

### Current Implementation (TAP)

The framework currently uses TAP's built-in `t.matchSnapshot()` for snapshot
testing. Snapshots are stored in `tap-snapshots/` directories alongside test
files and regenerated with `TAP_SNAPSHOT=1`.

**Real example from `core/blong-log/src/server.test.ts`:**

```typescript
t.test('snapshot - GET /api/config', async t => {
    const response = await fetch(`http://127.0.0.1:${port}/api/config`);
    const config = await response.json();

    // Normalize dynamic ports before snapshotting
    config.wsUrl  = config.wsUrl.replace(/:\d+\//, ':PORT/');
    config.apiUrl = config.apiUrl.replace(/:\d+\//, ':PORT/');

    t.matchSnapshot(config, 'GET /api/config response');
});
```

**Stored snapshot** (`core/blong-log/tap-snapshots/src/server.test.ts.test.cjs`):

```javascript
exports[`... > snapshot - GET /api/config > GET /api/config response 1`] = `
Object {
  "apiUrl": "http://127.0.0.1:PORT/api",
  "properties": Object {
    "error": "err", "level": "level", "name": "name", ...
  },
  "theme": Object { "mode": "dark", "levels": { "info": "#22c55e", ... } },
  "wsUrl": "ws://127.0.0.1:PORT/ws",
}
`
```

Note that dynamic values (port numbers) are normalized manually before
`t.matchSnapshot()` is called, because TAP does not have built-in masking
support. A future `assert.snapshot(result, name, {mask})` helper would
encapsulate this normalization.

## When to Use Snapshot Testing

Snapshot testing works well for:

- **API response validation**: Where the full response structure matters
- **Complex object comparisons**: Where many fields need verification
- **Regression detection**: Where any change to the output structure is
  significant
- **Migration scenarios**: Where existing test collections have many repetitive
  assertions that can be replaced

## When Not to Use Snapshot Testing

Snapshot testing should be avoided when:

- **Dynamic values**: Timestamps, UUIDs, and other non-deterministic fields
  need special handling (masking or ignoring)
- **Specific business rules**: When only specific fields matter and the test
  should document exactly which fields and why
- **Simple assertions**: When a few targeted assertions are clearer than a
  snapshot

## Handling Dynamic Values

Snapshots should support masking or normalizing dynamic values:

```typescript
assert.snapshot(result, 'transfer-committed', {
    mask: ['completedTimestamp', 'transferId'],
});
```

Masked fields are replaced with a placeholder value before comparison, so that
timestamps, IDs, and other dynamic values don't cause false failures.

**Note:** This API is proposed. Current practice uses manual normalization (see
implementation note above) until the framework helper is built.

## Snapshot Storage

Snapshots are stored alongside test files in a `__snapshots__` directory or
as `.snap` files. They should be committed to source control so that changes
to expected output are visible in code reviews.

### Relationship to Blong Testing

In the Blong framework, snapshot testing integrates with the existing
`blong-chain` test executor. Test steps can use snapshot assertions alongside
regular assertions. The snapshot approach is particularly valuable when
migrating existing test collections (such as ml-testing-toolkit JSON test
cases) where the original tests contain many repetitive field-by-field checks.

### Context Snapshotting with blong-chain

A key property of `blong-chain` is that step results accumulate in a shared
context object. Each step returns a value that becomes available to subsequent
steps by name. After a chain completes, the context contains the complete
history of all step outputs — effectively a structured record of everything
the test produced.

This accumulated context is a natural candidate for snapshot testing. Instead
of (or in addition to) snapshotting individual API responses inside each step,
the context itself can be snapshotted — capturing the combined outputs of
multiple steps in a single comparison.

#### Strategy 1: End-of-Chain Context Snapshot

The simplest approach is to snapshot the entire context after all steps
complete:

```typescript
const steps = [
    async function createParty(assert, {$meta}) {
        return await partyPartyCreate({type: 'MSISDN'}, $meta);
    },
    async function requestQuote(assert, {createParty, $meta}) {
        const party = await createParty;
        return await quoteQuoteCreate({payee: party.partyId}, $meta);
    },
    async function executeTransfer(assert, {requestQuote, $meta}) {
        const quote = await requestQuote;
        return await transferTransferCreate({quoteId: quote.quoteId}, $meta);
    },
];

await executor.execute(steps, {testId: 'p2p-flow'}, t);

const progress = executor.getProgress();
const context = Object.fromEntries(
    [...progress.steps].map(([name, step]) => [name, step.result]),
);
assert.snapshot(context, 'p2p-flow-complete', {
    mask: ['partyId', 'quoteId', 'transferId', 'completedTimestamp'],
});
```

**Advantages:**

- Single snapshot captures the entire test output
- Minimal snapshot files to maintain — one per test chain
- Easy to update when API responses change
- Full regression coverage across all steps

**Disadvantages:**

- When the snapshot fails, it is not immediately obvious which step produced
  the unexpected output — the diff shows the full context, and the developer
  must trace the changed field back to its originating step
- A change in an early step (e.g., a new field in `createParty`) causes the
  snapshot to fail even if downstream steps are unaffected
- The snapshot file can become large for chains with many steps

#### Strategy 2: Checkpoint Snapshots at Synchronization Barriers _(Future Direction)_

> **Note:** Automatic context snapshots at checkpoint barriers are not yet
> implemented in `blong-chain`. The description below outlines the intended
> design. Until the `autoSnapshot` executor option is available, use
> Strategy 1 (end-of-chain snapshot) or Strategy 3 (per-step snapshots).

`blong-chain` supports checkpoints (empty arrays `[]`) as synchronization
barriers. These natural phase boundaries are good points to capture
intermediate context snapshots:

```typescript
const steps = [
    // Phase 1: Provisioning
    async function createPayer(assert, {$meta}) {
        return await provisionPartyCreate({type: 'MSISDN', currency: 'USD'}, $meta);
    },
    async function createPayee(assert, {$meta}) {
        return await provisionPartyCreate({type: 'MSISDN', currency: 'USD'}, $meta);
    },

    // Checkpoint — snapshot provisioning results
    [],

    // Phase 2: Transfer flow
    async function requestQuote(assert, {createPayer, createPayee, $meta}) {
        const payer = await createPayer;
        const payee = await createPayee;
        return await quoteQuoteCreate({payer: payer.partyId, payee: payee.partyId}, $meta);
    },
    async function executeTransfer(assert, {requestQuote, $meta}) {
        const quote = await requestQuote;
        return await transferTransferCreate({quoteId: quote.quoteId}, $meta);
    },

    // Checkpoint — snapshot transfer results
    [],

    // Phase 3: Verification
    async function verifyTransfer(assert, {executeTransfer, $meta}) {
        const transfer = await executeTransfer;
        return await transferTransferGet({transferId: transfer.transferId}, $meta);
    },
];
```

At each checkpoint, the executor could automatically snapshot the context
accumulated so far. This produces multiple smaller snapshots (e.g.,
`p2p-flow-phase-1`, `p2p-flow-phase-2`, `p2p-flow-phase-3`) that narrow
down failure locations to a specific phase.

**Advantages:**

- Failure localization is better than end-of-chain — the failing phase is
  immediately identifiable
- Snapshot files are smaller and more focused
- Phases often correspond to logical stages (setup, execution, verification)
  which makes snapshots meaningful to review

**Disadvantages:**

- More snapshot files to maintain
- Checkpoint placement becomes a design decision that affects snapshot
  granularity
- A change in phase 1 may still cascade to phase 2 and 3 snapshots

#### Strategy 3: Per-Step Snapshots

At the other extreme, each step's return value can be snapshotted
individually:

```typescript
async function createParty(assert, {$meta}) {
    const result = await partyPartyCreate({type: 'MSISDN'}, $meta);
    assert.snapshot(result, 'createParty', {mask: ['partyId']});
    return result;
}
```

**Advantages:**

- Maximum failure localization — the exact step that diverged is immediately
  clear
- Each snapshot is small and self-contained
- Easy to understand which response structure each step expects

**Disadvantages:**

- Highest maintenance burden — every step has a snapshot to maintain
- Approaches the verbosity of field-by-field assertions (replacing many
  `assert.equal` calls with many `assert.snapshot` calls)
- Does not take advantage of the accumulated context concept

#### Recommended Approach: Hybrid Strategy

The best approach combines strategies based on the test's purpose:

1. **Use end-of-chain snapshots** for regression suites where the goal is to
   detect any change in the overall flow. These are easy to maintain and
   provide comprehensive coverage. The trade-off in failure localization is
   acceptable because the developer can inspect the diff to trace the change.

2. **Use checkpoint snapshots** for complex multi-phase flows where knowing
   the failing phase significantly speeds up debugging. Align checkpoints
   with logical stages (provisioning, execution, verification, cleanup).

3. **Use per-step snapshots sparingly** — only for steps where the response
   structure is complex and the specific step's output is critical to
   validate independently (e.g., the final transfer state verification).

4. **Keep targeted assertions for business rules** — snapshot testing should
   complement, not replace, assertions that document specific business logic
   expectations. For example, `assert.equal(transfer.state, 'COMMITTED')` is
   more informative than relying on the snapshot to catch a state change.

This hybrid approach balances maintainability (fewer snapshot files) with
failure localization (knowing where things broke).

#### Context Filtering and Masking

When snapshotting the accumulated context, dynamic values need careful
handling. The masking configuration should support:

- **Deep path masking**: Mask fields at any nesting depth across all steps
  (e.g., `['*.partyId', '*.completedTimestamp']`)
- **Step-scoped masking**: Mask fields only in specific step results
  (e.g., `['createParty.partyId', 'executeTransfer.transferId']`)
- **Type-based masking**: Automatically mask values matching patterns like
  UUIDs, ISO timestamps, or other well-known dynamic formats
- **Step exclusion**: Exclude entire steps from the context snapshot when
  their output is inherently non-deterministic or not relevant to the
  snapshot's purpose

```typescript
assert.snapshot(context, 'p2p-flow-complete', {
    mask: [
        '*.completedTimestamp',        // Deep path — all steps
        'createParty.partyId',         // Step-scoped
    ],
    maskPatterns: [
        {type: 'uuid'},                // Auto-detect UUIDs
        {type: 'iso-timestamp'},       // Auto-detect timestamps
    ],
    exclude: ['cleanup'],              // Exclude step from snapshot
});
```

#### Implications for Test Plan Visibility

Context snapshots also serve a documentation purpose. A snapshot file that
captures the complete context of a test chain is effectively a record of what
the test produces at each stage. This can be used for:

- **Test plan review**: Reviewers can inspect snapshot files to understand
  what a test chain validates without reading the test code
- **Change tracking**: When a snapshot diff appears in a pull request, it
  shows exactly how the system's behavior changed
- **Baseline comparison**: Comparing snapshots across environments or
  versions reveals behavioral differences

### Migration Strategy

When migrating test collections that have repetitive assertions:

1. **Identify candidates**: Look for test steps with more than 5-10 individual
   field assertions on the same response object
2. **Capture initial snapshots**: Run the test against a known-good environment
   to capture the reference output
3. **Replace assertions**: Replace the individual assertions with a single
   snapshot assertion
4. **Handle dynamic fields**: Add masking for timestamps, IDs, and other
   non-deterministic values
5. **Review snapshots**: Ensure the captured snapshot represents the correct
   expected behavior
6. **Consider context snapshots**: For migrated chains with many sequential
   API calls, evaluate whether an end-of-chain or checkpoint context snapshot
   can replace multiple per-step snapshots, reducing the total number of
   snapshot files while maintaining regression coverage

## Future Ideas

1. **Schema-aware automatic masking** — any field whose TypeBox schema carries
   `{format: 'uuid'}` or `{format: 'date-time'}` should be masked automatically,
   eliminating manual mask lists. The framework knows the schema at test time;
   using it prevents dynamic-value leakage without extra developer effort.

2. **Snapshot diffing in the real-time log viewer** — when a snapshot assertion
   fails during a test run, emit the diff as a structured log entry so it
   appears in the blong-log UI with syntax highlighting and side-by-side
   comparison, making it faster to understand a regression without leaving
   the browser.

3. **Snapshot inheritance** — allow a snapshot to reference another snapshot as
   a base and declare only the delta (e.g., `assert.snapshot(result, 'transfer-reversed', {extends: 'transfer-committed', set: {state: 'REVERSED'}})`).
   This is particularly useful for testing multiple scenarios from the same
   base state without duplicating the full expected object.
