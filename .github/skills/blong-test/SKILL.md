---
name: blong-test
description: Write automated tests for Blong handlers using parallel test execution. Tests run in parallel by default with automatic dependency detection via thenable proxies. Supports assertions, error testing, and test reuse. Use this skill whenever writing any test handler in Blong, including test-driven development, API testing, or verifying business logic — even if the user just says 'add a test' or 'write tests for this'.
---

# Implementing Tests

## [CRITICAL_GUARDRAILS]

- **Steps run in parallel by default** — dependencies auto-detected via thenable proxies; await all
  context access.
- **Producer steps must `return` their data** — a dependent that destructures `{step}` throws
  `Cannot destructure property … undefined` when the producer returns nothing (see `_shared` `[PITFALLS]`).
- **Assert expected errors** with `$meta.expect` (demotes log to debug) + `assert.rejects(…, {type})`.
- **Snapshots for structural regression**, `assert.equal` for business rules; `assert.snapshot()`
  already throws on falsy results — no `assert.ok` before it.
- **`$meta` is always available directly** (not a thenable proxy); concurrency limit default 10.

Canonical framework rules + pitfalls:
`.github/skills/_shared/conventions.md` → `[CRITICAL_GUARDRAILS]`, `[PITFALLS]`, `[ARCHETYPE: HANDLER]`.

## Test approaches

Choose the right approach based on your situation:

- **Public API / Internal API** — how to wire up `index.ts` and load platforms: see **blong-test-api**
- **Mocking backend calls** — replace adapters with a mock orchestrator: see **blong-mock-test**
- **Simulating backends** — run a local mock HTTP or TCP server: see **blong-test-sim**
- **K8s integration backends** — provision real services in CI: see **blong-test-int**

## File Structure

```
realmname/
└── test/
    └── test/                    # Handler group: test.test
        ├── testEntityAdd.ts
        ├── testEntityEdit.ts
        ├── testWorkflow.ts
        └── testIntegration.ts
```

**Naming Convention:**

- Folder: `test/test/` (first = layer, second = namespace)
- Handler group: `test.test`
- File prefix: `test` (e.g., `testUserAdd.ts`, `testPayment.ts`)

## Test Handler Pattern

### Basic Test

```typescript
// realmname/test/test/testExample.ts
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({
        lib: {group},
        handler: {
            realmEntityAction, // Handler to test
        },
    }) => ({
        testExample: ({name = 'example'}, $meta) =>
            group(name)([
                async function testCase(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await realmEntityAction(
                        {
                            param: 'value',
                        },
                        $meta,
                    );

                    assert.equal(result.output, 'expected', 'Verify output');
                },
            ]),
    }),
);
```

### Test with Multiple Steps

```typescript
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(({lib: {group}, handler: {userUserAdd, userUserFind, userUserDelete}}) => ({
    testUserLifecycle: ({name = 'user lifecycle'}, $meta) =>
        group(name)([
            // Step 1: Create user
            async function createUser(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const result = await userUserAdd(
                    {
                        username: 'testuser',
                        email: 'test@example.com',
                        role: 'user',
                    },
                    $meta,
                );

                assert.ok(result.userId, 'User ID returned');
                assert.equal(result.username, 'testuser', 'Username matches');

                // Return data for next step
                return {userId: result.userId};
            },

            // Step 2: Find user (uses context from step 1)
            async function findUser(
                assert: IAssert,
                {$meta, userId}: {$meta: IMeta; userId: number},
            ) {
                const result = await userUserFind({userId}, $meta);

                assert.equal(result.username, 'testuser');
                assert.equal(result.email, 'test@example.com');

                return {userId};
            },

            // Step 3: Delete user
            async function deleteUser(
                assert: IAssert,
                {$meta, userId}: {$meta: IMeta; userId: number},
            ) {
                await userUserDelete({userId}, $meta);

                // Verify deletion
                await assert.rejects(
                    userUserFind(
                        {userId},
                        {
                            ...$meta,
                            expect: 'userNotFound',
                        },
                    ) as Promise<unknown>,
                    {type: 'userNotFound'},
                    'User not found after deletion',
                );
            },
        ]),
}));
```

## Test Parameters

### Default Name

```typescript
testExample: ({name = 'default name'}, $meta) =>
    group(name)([
        /* steps */
    ]);
```

### Custom Parameters

```typescript
testExample: ({name = 'example', username = 'testuser', amount = 100}, $meta) =>
    group(name)([
        async function test(assert, {$meta}) {
            const result = await handler(
                {
                    username,
                    amount,
                },
                $meta,
            );
            assert.ok(result);
        },
    ]);
```

## Context Passing & Parallel Execution

### Automatic Parallel Execution

Steps run **in parallel by default** unless they have dependencies. Dependencies are automatically detected when steps access context properties from other steps.

### Thenable Proxy Pattern

All context properties are **thenable proxies** - they act as promises and must be awaited. This enables automatic dependency detection and parallel execution. Four access patterns are supported:

```typescript
group(name)([
    // Step 1: Setup data (runs immediately)
    async function createUser(assert, {$meta}) {
        const user = await userUserAdd({username: 'test'}, $meta);
        return {userId: user.userId, profile: {name: 'Test', age: 30}};
    },

    // Pattern 1: Direct context access
    async function pattern1(assert, context) {
        const result = await context.createUser; // Wait for createUser
        assert.ok(result.userId);
    },

    // Pattern 2: Destructure then await
    async function pattern2(assert, {createUser}) {
        const result = await createUser; // Wait for createUser
        assert.ok(result.userId);
    },

    // Pattern 3: Access nested properties
    async function pattern3(assert, {createUser}) {
        const name = await createUser.profile.name; // Wait and extract property
        assert.equal(name, 'Test');
    },

    // Pattern 4: Nested destructuring
    async function pattern4(assert, {createUser: {profile}}) {
        const age = await profile.age; // Wait and extract nested property
        assert.equal(age, 30);
    },

    // Independent step (runs in parallel with dependent steps)
    async function independent(assert, {$meta}) {
        // No dependencies - runs immediately in parallel
        const data = await otherHandler({}, $meta);
        assert.ok(data);
    },
]);
```

**Context Rules:**

- Function name determines context property name
- Returned value is added to context
- **Steps accessing context properties wait for those steps to complete**
- **Independent steps run in parallel automatically**
- `$meta` is always available directly (not a thenable proxy)
- Configurable concurrency limit (default: 10 parallel steps)

> **Gotcha — dependents destructure the previous step's RETURN value.** A step that a later step
> consumes (via `context.step` / `{step}` destructuring) MUST `return` that data. If a producer step
> returns nothing (`undefined`), a consumer step that destructures it throws
> `Cannot destructure property 'x' of (intermediate value) as it is undefined.` Always end producer
> steps with `return {x, y}` when a later step reads their fields — even when the step's main job
> was an assertion (e.g. a "duplicate registration" step must still return the credentials so the
> login step can use them).

## Assertions

### node:assert Methods

```typescript
// Equality
assert.equal(actual, expected, 'message');
assert.notEqual(actual, expected, 'message');
assert.deepEqual(actual, expected, 'message');
assert.strictEqual(actual, expected, 'message');

// Truthiness
assert.ok(value, 'message');
assert(value, 'message'); // Same as ok

// Type checks
assert.strictEqual(typeof value, 'string');

// Rejection (for errors)
await assert.rejects(promise, {type: 'errorType'}, 'message');

// Throws
assert.throws(
    () => {
        throw new Error();
    },
    Error,
    'message',
);
```

### Testing Errors

```typescript
async function testError(assert, {$meta}) {
    // Exact error type — most common case
    await assert.rejects(
        userUserAdd(
            {
                username: 'duplicate',
            },
            {
                ...$meta,
                expect: 'userExists', // Expected error type — demotes log to debug
            },
        ) as Promise<unknown>,
        {type: 'userExists'},
        'Should reject duplicate user',
    );

    // Wildcard prefix — any error whose type starts with 'user.'
    await assert.rejects(
        userUserFind({userId: 999}, {...$meta, expect: 'user.*'}) as Promise<unknown>,
        {type: 'user.notFound'},
        'Should reject unknown user',
    );

    // Array of expected types — any of them is considered expected
    await assert.rejects(
        paymentTransfer({amount: -1}, {
            ...$meta,
            expect: ['payment.invalidAmount', 'payment.insufficientFunds'],
        }) as Promise<unknown>,
        {type: 'payment.invalidAmount'},
        'Should reject invalid payment',
    );
}
```

> **Note:** Setting `$meta.expect` suppresses `error`-level log entries for the
> declared types (demoting them to `debug` level), keeping the test log clean.
> The error still propagates normally; `assert.rejects` works as usual.
> Unexpected errors (types not listed in `expect`) continue to log at
> `error` level.  See [expected errors concept](../../../docs/blong/docs/concepts/expected-errors.md).

## Context Snapshotting

For multi-step flows, context snapshotting replaces repetitive field-by-field assertions with
structural regression checks stored in snapshot files.  The framework provides **five strategies**,
ordered from most automatic to most explicit.

`assert.snapshot()` is **injected by the runtime** — no import needed.  The chain-level `mask`
config handles dynamic field masking so step functions never need to know about it.

### Snapshotting strategies

| Strategy | Config / Marker | Best for |
|---|---|---|
| `autoSnapshot: true` | executor config | Migrating collections; zero-boilerplate suites |
| `['*']` checkpoint | end of steps array | Single comprehensive regression snapshot |
| `['s1','s2']` checkpoint | phase boundaries | Multi-phase flows (narrow failure to a phase) |
| `assert.snapshot()` (no-args) | inside step function | Per-step structural lock-in, mixed with business assertions |
| Hybrid | combination of above | Production suites — explicit rules + selective snapshots + full regression |

### Strategy A: `autoSnapshot: true` — fully automatic

Pass `autoSnapshot: true` to the executor.  Every step return value is snapshotted under the
function name automatically.  No code changes needed inside step functions.

```typescript
// realmname/test/test/testUserLifecycle.ts
export default handler(({lib: {group}, handler: {userUserAdd, userUserGet, userUserRemove}}) => ({
    testUserLifecycle: ({name = 'user lifecycle'}, $meta) =>
        group(name, {autoSnapshot: true, mask: ['userId', 'createdAt']})(
            [
                async function createUser(_assert, {$meta}) {
                    return await userUserAdd({userName: 'alice', emailAddress: 'alice@example.com'}, $meta);
                },
                async function getUser(_assert, {$meta, createUser}) {
                    const {userId} = await createUser;
                    return await userUserGet({userId}, $meta);
                },
            ],
        ),
}));
```

> **`group()` config:** Pass `{autoSnapshot, mask}` as the **second argument to `group()`**.
> The steps array is the sole argument of the returned function.

### Strategy B: `['*']` end-of-chain checkpoint — one declarative marker

Use `lib.checkpoint('flow-name')` at the end of the steps array.  The executor
waits for all steps, then snapshots the full accumulated context in one call.

```typescript
group(name)([
    async function createParty(_assert, {$meta}) {
        return await partyPartyAdd({partyType: 'MSISDN', partyId: PARTY_MSISDN}, $meta);
    },
    async function createQuote(_assert, {$meta, createParty}) {
        const party = await createParty;
        return await quoteQuoteCreate({receiverPartyId: party.partyId, amount: 100}, $meta);
    },
    async function executeTransfer(_assert, {$meta, createQuote}) {
        const quote = await createQuote;
        return await transferTransferExecute({quoteId: quote.quoteId}, $meta);
    },
    checkpoint('p2p-flow'),   // ← one marker, full snapshot
]);
```

### Strategy C: Phase checkpoints — `['step1','step2']`

Named checkpoint markers capture specific step results at phase boundaries.  The executor waits
**only for the listed steps** — other parallel steps keep running.

```typescript
export default handler(({lib: {group, checkpoint}, handler: {...}}) => ({
    testFlow: ({name = 'flow'}, $meta) =>
        group(name)([
            async function createUser(_assert, {$meta}) {
                return await userUserAdd({userName: 'alice'}, $meta);
            },
            async function assignRole(_assert, {$meta, createUser}) {
                const {userId} = await createUser;
                return await userRoleAssign({userId, roleName: 'admin'}, $meta);
            },
            // Snapshot provisioning phase — only waits for createUser & assignRole
            checkpoint('provisioning', 'createUser', 'assignRole'),

            async function sendPayment(_assert, {$meta, createUser}) {
                const {userId} = await createUser;
                return await paymentTransferSend({senderId: userId, amount: 50}, $meta);
            },
            async function verifyBalance(_assert, {$meta, createUser}) {
                const {userId} = await createUser;
                return await accountBalanceGet({userId}, $meta);
            },
            checkpoint('execution', 'sendPayment', 'verifyBalance'),
        ]),
}));
```

### Strategy D: `assert.snapshot()` — per-step no-args

Call `assert.snapshot()` with no arguments inside a step.  After the step function returns the
executor automatically calls `matchSnapshot(result, stepName)`.

> **`assert.ok(result)` is not needed before `assert.snapshot()`.** The snapshot
> automatically throws for falsy return values — guarding against accidental
> null/undefined snapshots — so a separate `assert.ok` would be redundant.

```typescript
async function getUser(assert: IAssert, {$meta, createUser}) {
    assert.snapshot();   // ← throws if result is falsy; captures result under 'getUser'
    return await userUserGet({userId: (await createUser).userId}, $meta);
}
```

> **Snapshot-only steps are two lines.** Skip `const result` and any single-use
> destructuring — put the awaited call directly in `return`. Inline single-use
> step dependencies with `(await prevStep).field`:
>
> ```typescript
> // ✓ preferred
> assert.snapshot();
> return await someGet({id: (await prevStep).id}, $meta);
>
> // ✗ avoid
> const {id} = await prevStep;
> const result = await someGet({id}, $meta);
> assert.snapshot();
> return result;
> ```
>
> Keep `const result` only when the value is used more than once (e.g. in both
> `assert.equal` and `return`, or in a spread + property access).

For per-call extra masking: `assert.snapshot({mask: ['createdAt']})`.

> **Sorting list results for stability:** `find` handlers may return results in non-deterministic
> order. Sort the result inline in the `return` statement — no intermediate variable needed:
>
> ```typescript
> async function findUsers(assert: IAssert, {$meta}: {$meta: IMeta}) {
>     assert.snapshot();
>     return (await userUserFind({}, $meta) as UserRow[]).slice().sort((a, b) => a.userName.localeCompare(b.userName));
> }
> ```
>
> For nested arrays (e.g. an object with a `Contents` list), spread and replace the array:
>
> ```typescript
> assert.snapshot();
> return {
>     ...(result as ListResult),
>     Contents: (result as ListResult).Contents?.slice().sort(
>         (a, b) => (a.Key ?? '').localeCompare(b.Key ?? ''),
>     ),
> };
> ```

### Hybrid (recommended for production suites)

Use explicit `assert.equal` / `assert.rejects` for critical business rules; use `assert.snapshot()`
in sentinel steps; add `checkpoint('name')` at the end for full regression coverage.

```typescript
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(({lib: {group, checkpoint}, handler: {userUserAdd, paymentTransferSend, accountBalanceGet}}) => ({
    testPaymentFlow: ({name = 'payment flow'}, $meta) =>
        group(name)([
            async function createUser(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const result = await userUserAdd({userName: 'alice'}, $meta);
                assert.ok(result.userId, 'user created');  // business rule check
                return result;
            },
            async function sendPayment(assert: IAssert, {$meta, createUser}) {
                const {userId} = await createUser;
                const result = await paymentTransferSend({senderId: userId, amount: 50}, $meta);
                // Business rule — explicit assertion
                assert.equal(result.status, 'COMPLETED', 'payment must reach COMPLETED state');
                // Structural regression — snapshot the full shape
                assert.snapshot();
                return result;
            },
            async function verifyBalance(_assert: IAssert, {$meta, createUser}) {
                const {userId} = await createUser;
                return await accountBalanceGet({userId}, $meta);
            },
            checkpoint('full-regression'),   // end-of-chain coverage for all steps
        ]),
}));
```

### Chain-level masking

Configure `mask` via the second argument to `group()`.  All snapshot operations in the
chain apply it automatically.  Supports dot-paths and the `*` wildcard.

```typescript
group(name, {mask: ['userId', 'createdAt', 'updatedAt']})(   // applied to every snapshot
    [ /* steps */ ],
)
```

Wildcards: `'*.id'` masks the `id` field in every direct child of the snapshotted object.  This
is useful when snapshotting a context object whose keys are step names and each has an `id` field.

Per-call override: `assert.snapshot({mask: ['extraField']})` — merges with chain mask.

### When to use snapshots

| Situation | Approach |
|---|---|
| `get`/`find` step returns a structured object with multiple stable fields | `assert.snapshot()` |
| Verify-edit step re-fetches and confirms multiple updated fields | `assert.snapshot()` |
| Multi-phase flow (setup → execute → verify) | Phase checkpoints `checkpoint('name', 's1', 's2')` |
| Full flow regression | End-of-chain `checkpoint('name')` |
| Single business-rule assertion (`status === 'COMPLETED'`) | Keep `assert.equal` |
| Dynamic list content (size/order varies by environment) | Keep `assert.ok` |
| `null` / void mutation response | Keep `assert.ok(result !== undefined)` |
| `assert.ok(result)` before `assert.snapshot()` | **Remove it** — snapshot throws for falsy values |

### Generating / updating snapshot files

```bash
# First run or after intentional shape change — write snapshots
TAP_SNAPSHOT=1 tap my-test.test.ts

# Normal run — compare against stored snapshots
tap my-test.test.ts
```

Snapshot files are stored in `tap-snapshots/` alongside the test file and committed to source
control.  See `core/blong-hello/test/test/` for a complete working realm-based example.

## Reusing Test Handlers with Parameters

Test handlers support **arbitrary parameters** beyond `name`. This enables
building a library of reusable scenarios that can be invoked with different
values:

```typescript
// realmname/test/test/testTransfer.ts
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(({lib: {group}, handler: {transferTransferCreate}}) => ({
    testTransfer: ({name = 'transfer', amount = 100, currency = 'USD'}, $meta) =>
        group(name)([
            async function createTransfer(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const result = await transferTransferCreate({amount, currency}, $meta);
                assert.ok(result.transferId, 'Transfer ID returned');
                assert.equal(result.amount, amount, 'Amount matches');
                return {transferId: result.transferId};
            },
        ]),
}));
```

Compose multiple parameterised runs inside another test handler:

```typescript
// realmname/test/test/testTransferScenarios.ts
export default handler(({lib: {group}, handler: {testTransfer}}) => ({
    testTransferScenarios: ({name = 'transfer scenarios'}, $meta) =>
        group(name)([
            testTransfer({name: 'small USD',  amount: 10,    currency: 'USD'}, $meta),
            testTransfer({name: 'large EUR',  amount: 50000, currency: 'EUR'}, $meta),
            testTransfer({name: 'zero USD',   amount: 0,     currency: 'USD'}, $meta),
        ]),
}));
```

Each `testTransfer(...)` call returns a **named step array** that runs as a
sub-test. The `name` parameter controls how the run appears in test output.

> **Tip:** For BDD-style testing with Gherkin `.feature` files, see **blong-cucumber**.

## Controlling Execution Order

### Parallel Execution (Default)

Steps at the same level run in parallel unless they have dependencies:

```typescript
group(name)([
    // These three steps run in parallel
    async function fetchUserData(assert, {$meta}) {
        return await userUserGet({userId: 1}, $meta);
    },
    async function fetchAccountData(assert, {$meta}) {
        return await accountGet({accountId: 1}, $meta);
    },
    async function fetchPaymentData(assert, {$meta}) {
        return await paymentGet({paymentId: 1}, $meta);
    },

    // This step waits for fetchUserData to complete
    async function validateUser(assert, {fetchUserData}) {
        const user = await fetchUserData;
        assert.ok(user.validated);
    },
]);
```

### Sequential Execution (Nested Arrays)

Use nested arrays to force sequential execution of groups:

```typescript
group(name)([
    testSetup({}, $meta),

    // First group completes before second group starts
    [
        async function testCase1(assert, context) {
            // Test 1
        },
        async function testCase2(assert, context) {
            // Test 2 - runs in parallel with testCase1
        },
    ],

    // This nested array waits for above array to complete
    [
        async function testCase3(assert, context) {
            // Test 3
        },
    ],

    testTeardown({}, $meta),
]);
```

### Using group() for Test Organization

Use the `group()` function for clearer test naming:

```typescript
export default handler(({lib: {group}}) => ({
    testWorkflow: ({name = 'workflow'}, $meta) =>
        group(name)([
            async function setup(assert, {$meta}) {
                return {data: 'test'};
            },
            async function validate(assert, {setup}) {
                const data = await setup;
                assert.equal(data.data, 'test');
            },
        ]),
}));
```

## Running Tests

Tests are executed by the framework when the test layer is activated:

```typescript
// In server.ts - activation config (layer config stays in each layer file)
config: {
    test: {
        error: true,
        adapter: true,
        orchestrator: true,
        test: true          // Activate test layer
    }
}
```

Run tests:

```bash
# Run all tests
npm test

# Run specific test
npm test -- testUserAdd
```

## Best Practices

- **Descriptive names; independent, runnable-alone tests; clean up test data** (or use transactions).
- **Meaningful assertion messages**; test both success and error paths.
- **Reuse setup via parameterized test handlers**; **parallel by default**, nested arrays for order.
- **Limit concurrency** with `$meta.concurrency` when needed.

## Examples from Codebase

- **Basic test:** `core/test/demo/test/test/testNumberSum.ts`
- **Complex workflow:** `ml/payment/test/test/`
- **Integration test:** `tools/release/test/test/`
