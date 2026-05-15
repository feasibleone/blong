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
output structure and comparing it as a whole.  In the framework this is expressed
inside handler step functions:

```typescript
async function getTransfer(assert: IAssert, {$meta, createTransfer}) {
    const {transferId} = await createTransfer;
    return await transferTransferGet({transferId}, $meta);
    // return value is automatically snapshotted under 'getTransfer'
}
// assert.snapshot() declared inside the step — see Strategy D below
```

The snapshot file stores the complete expected structure, and the test framework
handles the comparison automatically.

### Implementation

All snapshot functionality is exposed through the handler layer.  Step functions
receive an `IAssert` object (imported from `@feasibleone/blong`) whose
`snapshot()` method is injected by the runtime — no direct `blong-chain` import
or TAP `t.matchSnapshot()` call is needed in business test code.

Snapshot files are stored in `tap-snapshots/` directories alongside the test
file entry point and regenerated with `TAP_SNAPSHOT=1`.

**Example test handler (`core/blong-hello/test/test/testHelloNumberSum.ts`):**

```typescript
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(({lib: {group}, handler: {mathNumberSum}}) => ({
    testHelloNumberSum: ({name = 'number sum'}, $meta) =>
        group(name)([
            async function sumSmall(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const result = await mathNumberSum({a: 3, b: 4}, $meta);
                assert.equal(result.sum, 7, 'sum is correct');
                return result;
            },
        ]),
}));
```

Dynamic values (port numbers, UUIDs, timestamps) are handled by the `mask` option
declared in the `group()` config — no manual normalization needed:

```typescript
group(name, {mask: ['createdAt', '*.id']})([...])
```

## When to Use Snapshot Testing

Snapshot testing works well for:

- **`get`/`find` handlers**: Where the full response structure matters and fields
  are stable across test runs (UUIDs etc. are masked centrally via `group()` config)
- **Verify-edit re-fetch steps**: Where a read-back after a mutation confirms all
  updated fields in one call
- **Full-chain regression coverage**: A `checkpoint('name')` marker at the end of the
  steps array captures everything the test produced
- **Migration scenarios**: Replacing repetitive `assert.equal` calls in existing
  test collections

**`assert.ok(result)` before `assert.snapshot()` is not needed.** The snapshot
mechanism throws an `AssertionError` if the value to be snapshotted is falsy,
giving the same protection without the redundant call.

## When Not to Use Snapshot Testing

Snapshot testing should be avoided when:

- **Dynamic values with no stable structure**: When the entire response is
  non-deterministic and cannot be usefully masked
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

The `assert.snapshot(result, name, {mask})` API is exposed through the framework's
`IAssert` type (imported from `@feasibleone/blong`).  See [Context Snapshotting](#context-snapshotting)
for all snapshotting options.

## Snapshot Storage

Snapshots are stored in `tap-snapshots/` directories alongside the test file and
committed to source control so that changes to expected output are visible in code
reviews.

### Relationship to Blong Testing

In the Blong framework, snapshot testing is built into the handler execution
model.  Step functions receive an `IAssert` object whose `snapshot()` method is
injected by the runtime.  There is no need to import `blong-chain` or call TAP
`t.matchSnapshot()` directly — the framework wires everything up behind the scenes.

A key property of the framework's execution model is that step results accumulate
in a shared context.  Each step returns a value that becomes available to subsequent
steps by name.  After a chain completes, the context holds a structured record of
everything the test produced — a natural candidate for snapshot testing.

The snapshot approach is particularly valuable when migrating existing test
collections (such as ml-testing-toolkit JSON test cases) where the original tests
contain many repetitive field-by-field checks.

### Context Snapshotting

The framework provides a spectrum of snapshotting approaches, ordered from most
automatic (invisible) to most explicit.  They compose freely and can be mixed
within the same test chain.

#### Snapshotting Spectrum

| Approach | Where it lives | Verbosity | Granularity |
|---|---|---|
---|
| `autoSnapshot: true` in `group()` config | group config | zero | per-step (auto) |
| `checkpoint('name')` | end of steps array | one marker | full context |
| `checkpoint('name', 's1', 's2')` | phase boundaries | one marker per phase | per-phase |
| `assert.snapshot()` | inside step | one call per step | per-step |
| `assert.snapshot(value, 'name', opts)` | inside step | explicit | any value |

#### Falsy-Value Protection

All snapshot paths — deferred `assert.snapshot()`, `autoSnapshot`, and explicit
`assert.snapshot(value, name)` — throw an `AssertionError` if the value to be
snapshotted is falsy.  This means `assert.ok(result)` before `assert.snapshot()`
is **redundant and should be omitted**.

#### Strategy A: `autoSnapshot: true` — Fully Automatic

Pass `{autoSnapshot: true}` as the second argument to `group()`.  Every step's
return value is snapshotted under its function name, with no changes to step
functions.  The `mask` option handles dynamic fields once, centrally.

```typescript
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(({lib: {group}, handler: {partyPartyCreate, quoteQuoteCreate}}) => ({
    testPartyFlow: ({name = 'party flow'}, $meta) =>
        group(name, {autoSnapshot: true, mask: ['*.id', '*.createdAt']})(
            [
                async function createParty(_assert, {$meta}: {$meta: IMeta}) {
                    return await partyPartyCreate({type: 'MSISDN'}, $meta);
                    // → snapshotted as 'createParty' automatically
                },
                async function requestQuote(_assert, {$meta, createParty}) {
                    const party = await createParty;
                    return await quoteQuoteCreate({payee: party.partyId}, $meta);
                    // → snapshotted as 'requestQuote' automatically
                },
            ],
        ),
}));
```

**Advantages:** Zero per-step boilerplate; chain-level mask is the only
configuration. Ideal for migrating test collections with repetitive assertions.

**Disadvantages:** Every step is snapshotted, including helper steps whose
output is incidental. There is no way to opt out of individual steps without
restructuring the chain.

#### Strategy B: `checkpoint('name')` — End-of-Chain Context Snapshot

Place `checkpoint('flow-name')` at the end of the steps array. The executor awaits
all steps, then snapshots the full accumulated context in one operation.

```typescript
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(({lib: {group, checkpoint}, handler: {partyPartyCreate, quoteQuoteCreate, transferTransferCreate}}) => ({
    testP2pFlow: ({name = 'p2p flow'}, $meta) =>
        group(name, {mask: ['*.id', '*.createdAt']})(
            [
                async function createParty(_assert, {$meta}: {$meta: IMeta}) {
                    return await partyPartyCreate({type: 'MSISDN'}, $meta);
                },
                async function requestQuote(_assert, {$meta, createParty}) {
                    const party = await createParty;
                    return await quoteQuoteCreate({payee: party.partyId}, $meta);
                },
                async function executeTransfer(_assert, {$meta, requestQuote}) {
                    const quote = await requestQuote;
                    return await transferTransferCreate({quoteId: quote.quoteId}, $meta);
                },
                checkpoint('p2p-flow'),   // waits for all steps, snapshots full context
            ],
        ),
}));
```

The chain-level `mask` is applied to the entire context object before
snapshotting. Use `'*.id'` to mask `id` in every step result at once.

**Advantages:** One marker, one snapshot file entry. No boilerplate in steps.
**Disadvantages:** A failure in one step may cascade to the full context diff.

#### Strategy C: Phase Checkpoints — `checkpoint('name', 's1', 's2')`

Named checkpoint markers capture a subset of step results at a phase boundary.
Multiple checkpoints in the same chain produce independent snapshots that
narrow failures to a specific phase.

```typescript
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(({lib: {group, checkpoint}, handler: {partyPayerAdd, partyPayeeAdd, quoteQuoteCreate, transferTransferCreate}}) => ({
    testTransferFlow: ({name = 'transfer flow'}, $meta) =>
        group(name)([
            // Phase 1: provisioning (parallel)
            async function createPayer(_assert, {$meta}: {$meta: IMeta}) {
                return await partyPayerAdd({type: 'MSISDN'}, $meta);
            },
            async function createPayee(_assert, {$meta}: {$meta: IMeta}) {
                return await partyPayeeAdd({type: 'MSISDN'}, $meta);
            },

            // Snapshot Phase 1 — failure here → provisioning problem
            checkpoint('provisioning', 'createPayer', 'createPayee'),

            // Phase 2: transfer flow
            async function requestQuote(_assert, {$meta, createPayer, createPayee}) {
                return await quoteQuoteCreate({payerId: (await createPayer).id, payeeId: (await createPayee).id}, $meta);
            },
            async function executeTransfer(_assert, {$meta, requestQuote}) {
                return await transferTransferCreate({quoteId: (await requestQuote).quoteId}, $meta);
            },

            // Snapshot Phase 2 — failure here → transfer-flow problem
            checkpoint('transfer-flow', 'requestQuote', 'executeTransfer'),
        ]),
}));
```

An empty array `[]` remains a sync barrier with no snapshot (existing behaviour).

**Advantages:** Phase failures are immediately identifiable. Small, focused
snapshot files. Aligns with logical stages of the test.
**Disadvantages:** Checkpoint placement is a design decision that adds
structural choices.

#### Strategy D: `assert.snapshot()` — Per-Step No-Args

Call `assert.snapshot()` inside a step with no arguments. The executor
intercepts the step's return value after the function resolves and calls
`matchSnapshot(result, stepName)` automatically.  The snapshot throws if the
result is falsy, so no guard assertion is needed.

```typescript
async function getParty(assert: IAssert, {$meta, createParty}) {
    assert.snapshot();   // throws if falsy; snapshots return value as 'getParty'
    return await partyPartyGet({partyId: (await createParty).partyId}, $meta);
}
```

> **Snapshot-only steps are two lines.** Remove `const result` and any
> single-use intermediate variable. Inline single-use step dependencies with
> `(await prevStep).field`. Keep `const result` only when the value appears
> more than once (both in an assertion and in `return`, or spread + property
> access in the same expression).`

> **Sorting list results for snapshot stability:** `find` handlers may return results in
> non-deterministic order. Sort the result inline in the `return` statement — no intermediate
> variable needed:
>
> ```typescript
> async function findParties(assert: IAssert, {$meta}: {$meta: IMeta}) {
>     assert.snapshot();
>     return (await partyPartyFind({}, $meta) as PartyRow[]).slice().sort((a, b) => a.partyName.localeCompare(b.partyName));
> }
> ```

With per-step masking:

```typescript
async function getParty(assert: IAssert, {$meta, createParty}) {
    assert.snapshot({mask: ['partyId']});   // per-step mask merged with chain-level mask
    return await partyPartyGet({partyId: (await createParty).partyId}, $meta);
}
```

The explicit form `assert.snapshot(value, 'name', opts?)` is also available for
snapshotting intermediate values that are not the step's return value.

**Advantages:** Maximum failure localization. Each step's snapshot is small and
self-contained.
**Disadvantages:** One `assert.snapshot()` call per step.

#### Chain-Level Masking

Configure masking via the second argument to `group()`.  It applies to all
snapshot operations in the chain — `autoSnapshot`, `assert.snapshot()`, and
checkpoint snapshots:

```typescript
group(name, {
    mask: [
        '*.id',                    // mask 'id' in every step's context entry
        '*.createdAt',             // mask timestamps everywhere
        'createParty.partyId',     // step-scoped: mask only in createParty's result
    ],
})([
    /* steps */
])
```

The `'*'` wildcard masks a field in every direct child of the snapshotted
object. For context snapshots, the children are step results, so `'*.id'`
masks `id` in every step's result object. For per-step snapshots, `'*.id'`
masks `id` in every property of that step's return value.

Per-call overrides in `assert.snapshot({mask: [...]})` are merged on top of the
chain-level mask.

#### Recommended Approach: Hybrid

The best approach combines strategies based on the test's purpose:

1. **`autoSnapshot: true`** for migrating existing test collections or for
   chains where every step result matters equally.

2. **`checkpoint('name')`** for regression suites that need one comprehensive
   snapshot without any per-step changes. Combine with `assert.equal` for
   the key business rule assertions.

3. **`checkpoint('name', 's1', 's2')`** for multi-phase flows where knowing
   the failing phase significantly speeds up debugging.

4. **`assert.snapshot()` in sentinel steps** for steps whose exact structure
   is critical and must be independently validated (e.g., the final transfer
   state or a provisioned account structure).

```typescript
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(({
    lib: {group, checkpoint},
    handler: {accountAccountAdd, beneficiaryBeneficiaryAdd, paymentPaymentAdd, accountAccountGet},
}) => ({
    testPaymentFlow: ({name = 'payment flow'}, $meta) =>
        group(name, {mask: ['*.id', '*.createdAt']})(
            [
                async function provisionAccount(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await accountAccountAdd({currency: 'USD'}, $meta);
                    assert.snapshot();   // lock in the provisioning structure
                    return result;
                },
                async function addBeneficiary(assert: IAssert, {$meta, provisionAccount}) {
                    const account = await provisionAccount;
                    const result = await beneficiaryBeneficiaryAdd({accountId: account.accountId}, $meta);
                    assert.snapshot();
                    return result;
                },
                async function sendPayment(assert: IAssert, {$meta, addBeneficiary}) {
                    const ben = await addBeneficiary;
                    const result = await paymentPaymentAdd({beneficiaryId: ben.beneficiaryId}, $meta);
                    // Business invariant: explicit assertion documents the expected outcome
                    assert.equal(result.status, 'COMPLETED', 'payment must reach COMPLETED state');
                    return result;
                },
                async function verifyBalance(_assert: IAssert, {$meta, sendPayment}) {
                    const payment = await sendPayment;
                    return await accountAccountGet({accountId: payment.accountId}, $meta);
                },
                checkpoint('payment-flow'),   // end-of-chain: full regression coverage
            ],
        ),
}));
```

#### Implications for Test Plan Visibility

Context snapshots also serve a documentation purpose. A snapshot file that
captures the complete context of a test chain is effectively a record of what
the test produces at each stage. This makes snapshot files useful for:

- **Test plan review**: Reviewers can inspect snapshot files to understand what
  a test chain validates without reading the test code
- **Change tracking**: Snapshot diffs in pull requests show exactly how the
  system's behaviour changed
- **Baseline comparison**: Comparing snapshots across environments or versions
  reveals behavioural differences

### Migration Strategy

When migrating test collections that have repetitive assertions:

1. **Identify candidates**: Look for test steps with more than 5–10 individual
   field assertions on the same response object
2. **Choose a strategy**: `autoSnapshot: true` is the fastest migration path;
   checkpoints are better for multi-phase flows
3. **Capture initial snapshots**: Run against a known-good environment with
   `TAP_SNAPSHOT=1` to capture the reference output
4. **Configure masking**: Add `mask: ['*.id', '*.createdAt']` (or similar) to
   the `group()` config for dynamic fields
5. **Replace assertions**: Remove individual `assert.equal` calls and any
   `assert.ok(result)` guards before `assert.snapshot()`, leaving only those
   that document specific business invariants
6. **Review snapshots**: Ensure captured snapshots represent correct expected
   behaviour

## Future Ideas

1. **Match-based automatic exclusion** — instead of masking dynamic fields with
   `'<masked>'`, use a match function to assert specific properties and
   automatically exclude them from the snapshot. Fields that were verified by
   assertions are removed from the snapshot candidate; everything else is
   captured. This produces snapshots that contain only stable fields and keeps
   dynamic-value verification in targeted assertions:

   ```typescript
   assert.match({transferId: t => typeof t === 'string' && t.length > 0});
   assert.snapshot();   // transferId not in snapshot — already verified above
   ```

   The match function (similar to `@infitx/match`) would collect which
   properties were checked, so `assert.snapshot()` can exclude them. This
   eliminates masking entirely for many cases.

2. **Schema-aware automatic masking** — any field whose TypeBox schema carries
   `{format: 'uuid'}` or `{format: 'date-time'}` should be masked
   automatically. The framework knows the schema at test time; using it
   prevents dynamic-value leakage without extra developer effort.

3. **Snapshot diffing in the real-time log viewer** — when a snapshot assertion
   fails during a test run, emit the diff as a structured log entry so it
   appears in the blong-log UI with syntax highlighting and side-by-side
   comparison, making it faster to understand a regression without leaving
   the browser.

4. **Snapshot inheritance** — allow a snapshot to reference another snapshot as
   a base and declare only the delta:

   ```typescript
   assert.snapshot(result, 'transfer-reversed', {
       extends: 'transfer-committed',
       set: {state: 'REVERSED'},
   });
   ```

   This is particularly useful for testing multiple scenarios from the same
   base state without duplicating the full expected object.

5. **Automatic checkpoint snapshots at `[]` barriers** — when `autoSnapshot`
   is `true` and a `[]` sync barrier is encountered, automatically snapshot the
   context accumulated up to that point, without needing to change `[]` to
   `['*']`. This would make all sync barriers implicitly phase-snapshot points.

