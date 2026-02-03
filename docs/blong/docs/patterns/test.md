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
import {IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

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
                assert: typeof Assert,
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

## Using group() Function

The `group()` function provides cleaner syntax for test naming:

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
