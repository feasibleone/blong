# Test

## Test handlers

Writing tests is very similar to writing handlers and library functions.
The main difference is that the files are in the `test/test` folder,
the first `test` being the layer name and the second `test` being part
of the name of the handlers, which becomes `xxx.test`.
The layer name is useful to activate tests only when needed,
while the `xxx.test` is convenient way to find all test handlers
and attach them to the orchestrator where they can run.

**Key Features:**

- **Parallel Execution:** Test steps run in parallel by default for faster test execution
- **Automatic Dependencies:** Framework detects dependencies when steps access context properties
- **Thenable Proxies:** Context properties act as promises, enabling flexible access patterns
- **Configurable Concurrency:** Control parallel execution with concurrency limits

Each test must return an array of steps. Each step is a function
or another array of steps. Test handlers receive two arguments:
the first one is parameters for the test, the second one is `$meta`.
The first parameter can optionally include the property `name`,
to give a name to the test. This is useful when reusing test handlers
and passing different parameters, so the test is reported in the
output as different test names. The test name must be set as a property
of the returned array. This is done by the `group` function provided
by the framework, which returns the passed array with the `name` property
set.

### Parallel Execution & Context

When steps are executed, they **run in parallel by default** unless they have
dependencies. The result of each step is set in an object called `context`.
The function name determines the context property name.

All context properties are **thenable proxies** - they act as promises and
must be awaited. When a step accesses a context property (e.g., `await context.stepName`
or `const {stepName} = context; await stepName`), the framework automatically:

1. Detects the dependency between steps
2. Ensures the dependent step waits for the dependency to complete
3. Resolves the promise with the step's return value

This enables automatic dependency detection without manual configuration.

Tests start with a context containing only `$meta`. Subsequent steps can
access the context to receive values from previous steps. Independent steps
(those not accessing other step results) run in parallel automatically.

Test steps are called with two parameters: `assert` and `context`. By default
the assert function is the one coming from `node:assert`, but it can be changed
to other ones, like the ones coming from [tap](https://node-tap.org/), which are mainly
useful for [snapshot testing](https://www.npmjs.com/package/@tapjs/snapshot)
with the `matchSnapshot` assertion function, which is not available in
`node:assert`.

Example:

```ts
// realmname/test/test/testSomething.ts
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(({
    lib: {group},
    handler: {
        testLoginTokenCreate,
        subjectObjectPredicate
    }
}) => ({
    testSomething: ({name = 'something'}, $meta) =>
        group(name)([
            testLoginTokenCreate({}, $meta), // reuse another test
            async function testCase(
                assert: IAssert,
                {$meta}: {$meta: IMeta}
            ) {
                const result = await subjectObjectPredicate<{data: string}>(
                    {},
                    $meta
                );
                assert.equal(result.data, 'expected data', 'Return expected data');
            }
        ])
}));
```

## Thenable Proxy Patterns

Context properties are thenable proxies that support four access patterns:

### Pattern 1: Direct Context Access

```ts
async function step(assert, context) {
    const result = await context.previousStep;
    assert.ok(result.value);
}
```

### Pattern 2: Destructure Then Await

```ts
async function step(assert, {previousStep}) {
    const result = await previousStep;
    assert.ok(result.value);
}
```

### Pattern 3: Access Nested Properties

```ts
async function step(assert, {previousStep}) {
    const value = await previousStep.nested.property;
    assert.equal(value, 'expected');
}
```

### Pattern 4: Nested Destructuring

```ts
async function step(assert, {previousStep: {nested}}) {
    const value = await nested.property;
    assert.equal(value, 'expected');
}
```

## Parallel Execution Examples

### Independent Steps (Parallel)

```ts
group(name)([
    // These three steps run in parallel
    async function fetchUser(assert, {$meta}) {
        return await userUserGet({userId: 1}, $meta);
    },
    async function fetchAccount(assert, {$meta}) {
        return await accountGet({accountId: 1}, $meta);
    },
    async function fetchPayment(assert, {$meta}) {
        return await paymentGet({paymentId: 1}, $meta);
    }
])
```

### Dependent Steps (Automatic Sequencing)

```ts
group(name)([
    async function createUser(assert, {$meta}) {
        const user = await userUserAdd({username: 'test'}, $meta);
        return {userId: user.userId};
    },

    // Waits for createUser automatically
    async function createAccount(assert, {createUser}) {
        const user = await createUser;
        const account = await accountAdd({userId: user.userId}, $meta);
        return {accountId: account.id};
    },

    // Waits for both createUser and createAccount
    async function createPayment(assert, {createUser, createAccount}) {
        const user = await createUser;
        const account = await createAccount;
        const payment = await paymentAdd({
            userId: user.userId,
            accountId: account.accountId
        }, $meta);
        assert.ok(payment.id);
    }
])
```

### Sequential Groups

Use nested arrays to force sequential execution:

```ts
group(name)(
    // Group 1 completes first
    [
        async function setup1(assert, {$meta}) { /* ... */ },
        async function setup2(assert, {$meta}) { /* ... */ }
    ],

    // Group 2 runs after Group 1 completes
    [
        async function test1(assert, context) { /* ... */ },
        async function test2(assert, context) { /* ... */ }
    ]
)
```

## Reusing Test Handlers with Parameters

Test handlers accept arbitrary parameters beyond `name`, enabling powerful reuse
patterns. A reusable test handler defines custom parameters with default values:

```ts
// realmname/test/test/testTransfer.ts
export default handler(({lib: {group}, handler: {transferTransferCreate}}) => ({
    testTransfer: ({name = 'transfer', amount = 100, currency = 'USD', userId = 1}, $meta) =>
        group(name)([
            async function createTransfer(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const result = await transferTransferCreate({amount, currency, userId}, $meta);
                assert.ok(result.transferId, 'Transfer ID returned');
                assert.equal(result.amount, amount, 'Amount matches');
                return {transferId: result.transferId};
            },
        ])
}));
```

Another handler can reuse it with different parameter combinations:

```ts
// realmname/test/test/testTransferScenarios.ts
export default handler(({lib: {group}, handler: {testTransfer}}) => ({
    testTransferScenarios: ({name = 'transfer scenarios'}, $meta) =>
        group(name)([
            testTransfer({name: 'small USD',  amount: 10,    currency: 'USD'}, $meta),
            testTransfer({name: 'large EUR',  amount: 50000, currency: 'EUR'}, $meta),
            testTransfer({name: 'zero USD',   amount: 0,     currency: 'USD'}, $meta),
        ])
}));
```

Each call to `testTransfer(...)` returns a named step array (`group(name)([...])`).
Those named arrays are treated as sequential sub-tests within the outer group.

### Parameter Flow

Parameters flow through the `group(name)(steps)` pattern:

1. The handler is **called** with specific parameters at test definition time.
2. It returns a **named step array** containing closures that capture those parameters.
3. The step array name (set by `group()`) is how it appears in test output.

This means all parameterisation happens before execution — the test framework
simply receives a tree of named step arrays and functions.

### Convention

Use descriptive `name` values to distinguish runs in test output:

```ts
testTransfer({name: 'with admin user', userId: adminId, amount: 500}, $meta),
testTransfer({name: 'with regular user', userId: userId, amount: 50}, $meta),
```

```ts
export default handler(({lib: {group}}) => ({
    testExample: ({name = 'example'}, $meta) =>
        group(name)([
            async function step1(assert, {$meta}) {
                return {data: 'test'};
            },
            async function step2(assert, {step1}) {
                const result = await step1;
                assert.equal(result.data, 'test');
            }
        ])
}));
```

## Handler-Test Convergence

Tests and handlers share deep structural similarities. The framework provides
mechanisms that work identically in both contexts, enabling a smooth transition
from test code to production code.

### Checkpoints in Tests

The [checkpoint](../concepts/checkpoint) function records progress through
multi-step operations. In test mode, checkpoints are recorded in
`$meta.checkpoints`, enabling assertions on intermediate handler states:

```ts
export default handler(({lib: {group}, handler: {orderProcess}}) => ({
    testOrderCheckpoints: ({name = 'order checkpoints'}, $meta) =>
        group(name)([
            async function processOrder(assert, {$meta}) {
                const result = await orderProcess({items: [{price: 10, quantity: 2}]}, $meta);
                assert.ok(result.orderId, 'Order created');

                // Verify the handler's internal progress
                const checkpoints = $meta.checkpoints;
                assert.equal(checkpoints[0].name, 'validated');
                assert.equal(checkpoints[1].name, 'persisted');
            },
        ]),
}));
```

### Test Graduation

Test handlers can be promoted to production handlers. The process:

1. Move the handler from `test/test/` to `orchestrator/`
2. Destructure `assert` and `checkpoint` from `lib` (both use `?.` for zero-cost in production)
3. Add checkpoints at key progress points
4. Adjust the orchestrator dispatch configuration

The same code that validated a workflow in testing becomes the production
orchestration, with assertions silenced via optional chaining.

```ts
// Before (test handler): assert is mandatory, passed by chain executor
async function createAndTransfer(assert, {$meta}) {
    const account = await accountCreate({balance: 1000}, $meta);
    assert.ok(account.id, 'Account created');
    return account;
}

// After (production handler): assert from lib, checkpoint added
// ({lib: {assert}, handler: {accountCreate}}) =>
async function accountProvisionAndTransfer({balance}, $meta) {
    const account = await accountCreate({balance}, $meta);
    assert?.ok(account.id, 'Account created');
    $meta.checkpoint?.('account-provisioned', {accountId: account.id});
    return account;
}
```

See the [unified handler-test rationale](../rationale/unified-handler-test)
for the full design and additional ideas like invariant guards, canary
assertions, and progressive verification levels.
