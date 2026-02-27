---
name: blong-test
description: Write automated tests for Blong handlers using parallel test
  execution. Tests run in parallel by default with automatic dependency
  detection via thenable proxies. Supports assertions, error testing, and test
  reuse. Use for test-driven development, API testing, integration testing, or
  verifying business logic with improved performance.
---

# Implementing Tests

## Overview

Test handlers follow the same patterns as business handlers but are organized in the `test/test` folder. They return arrays of test steps that are executed in **parallel by default** by the framework's test runner, with automatic dependency detection via thenable proxies.

## Purpose

- **Automated Testing:** Verify business logic and integrations
- **Test-Driven Development:** Write tests before implementation
- **Regression Prevention:** Ensure changes don't break existing functionality
- **API Testing:** Test handlers through their APIs
- **Integration Testing:** Test complete workflows

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
import {IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({
    lib: {group},
    handler: {
        realmEntityAction  // Handler to test
    }
}) => ({
    testExample: ({name = 'example'}, $meta) =>
        group(name)([
            async function testCase(
                assert: typeof Assert,
                {$meta}: {$meta: IMeta}
            ) {
                const result = await realmEntityAction({
                    param: 'value'
                }, $meta);

                assert.equal(result.output, 'expected', 'Verify output');
            }
        ])
}));
```

### Test with Multiple Steps

```typescript
export default handler(({
    lib: {group},
    handler: {
        userUserAdd,
        userUserFind,
        userUserDelete
    }
}) => ({
    testUserLifecycle: ({name = 'user lifecycle'}, $meta) =>
        group(name)([
            // Step 1: Create user
            async function createUser(
                assert: typeof Assert,
                {$meta}: {$meta: IMeta}
            ) {
                const result = await userUserAdd({
                    username: 'testuser',
                    email: 'test@example.com',
                    role: 'user'
                }, $meta);

                assert.ok(result.userId, 'User ID returned');
                assert.equal(result.username, 'testuser', 'Username matches');

                // Return data for next step
                return {userId: result.userId};
            },

            // Step 2: Find user (uses context from step 1)
            async function findUser(
                assert: typeof Assert,
                {$meta, userId}: {$meta: IMeta; userId: number}
            ) {
                const result = await userUserFind({userId}, $meta);

                assert.equal(result.username, 'testuser');
                assert.equal(result.email, 'test@example.com');

                return {userId};
            },

            // Step 3: Delete user
            async function deleteUser(
                assert: typeof Assert,
                {$meta, userId}: {$meta: IMeta; userId: number}
            ) {
                await userUserDelete({userId}, $meta);

                // Verify deletion
                await assert.rejects(
                    userUserFind({userId}, {
                        ...$meta,
                        expect: 'userNotFound'
                    }) as Promise<unknown>,
                    {type: 'userNotFound'},
                    'User not found after deletion'
                );
            }
        ])
}));
```

## Test Parameters

### Default Name

```typescript
testExample: ({name = 'default name'}, $meta) =>
    group(name)([/* steps */])
```

### Custom Parameters

```typescript
testExample: ({
    name = 'example',
    username = 'testuser',
    amount = 100
}, $meta) =>
    group(name)([
        async function test(assert, {$meta}) {
            const result = await handler({
                username,
                amount
            }, $meta);
            assert.ok(result);
        }
    ])
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
        const result = await context.createUser;  // Wait for createUser
        assert.ok(result.userId);
    },

    // Pattern 2: Destructure then await
    async function pattern2(assert, {createUser}) {
        const result = await createUser;  // Wait for createUser
        assert.ok(result.userId);
    },

    // Pattern 3: Access nested properties
    async function pattern3(assert, {createUser}) {
        const name = await createUser.profile.name;  // Wait and extract property
        assert.equal(name, 'Test');
    },

    // Pattern 4: Nested destructuring
    async function pattern4(assert, {createUser: {profile}}) {
        const age = await profile.age;  // Wait and extract nested property
        assert.equal(age, 30);
    },

    // Independent step (runs in parallel with dependent steps)
    async function independent(assert, {$meta}) {
        // No dependencies - runs immediately in parallel
        const data = await otherHandler({}, $meta);
        assert.ok(data);
    }
])
```

**Context Rules:**

- Function name determines context property name
- Returned value is added to context
- **Steps accessing context properties wait for those steps to complete**
- **Independent steps run in parallel automatically**
- `$meta` is always available directly (not a thenable proxy)
- Configurable concurrency limit (default: 10 parallel steps)

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
assert(value, 'message');  // Same as ok

// Type checks
assert.strictEqual(typeof value, 'string');

// Rejection (for errors)
await assert.rejects(
    promise,
    {type: 'errorType'},
    'message'
);

// Throws
assert.throws(
    () => { throw new Error(); },
    Error,
    'message'
);
```

### Testing Errors

```typescript
async function testError(assert, {$meta}) {
    await assert.rejects(
        userUserAdd({
            username: 'duplicate'
        }, {
            ...$meta,
            expect: 'userExists'  // Expected error type
        }) as Promise<unknown>,
        {type: 'userExists'},
        'Should reject duplicate user'
    );
}
```

## Reusing Test Handlers

Call other test handlers to share setup:

```typescript
export default handler(({
    lib: {group},
    handler: {
        testLoginTokenCreate,    // Reusable login test
        testUserAdminLogin,      // Reusable admin login
        subjectNumberSum
    }
}) => ({
    testNumberSum: ({name = 'number sum'}, $meta) =>
        group(name)([
            // Reuse authentication tests
            testLoginTokenCreate({}, $meta),
            testUserAdminLogin({}, $meta),

            // Actual test
            async function sum(assert, {$meta}) {
                assert.equal(
                    await subjectNumberSum([1, 2, 3, 4], $meta),
                    10,
                    'Sum array'
                );
            }
        ])
}));
```

**Test Composition Pattern:**

The `group` library function allows test arrays to be composed and reused:

```typescript
// ledger/test/test/testParticipant.ts
export default handler(
    ({
        lib: {group},
        handler: {
            testLoginTokenCreate,
            ledgerParticipantGet,
            ledgerParticipantAdd
        },
    }) => ({
        testParticipant: ({name = 'ledger'}, $meta) =>
            group(name)([
                testLoginTokenCreate({}, $meta),  // Reuse login setup
                async function participant(
                        assert: typeof Assert,
                        {$meta}: {$meta: IMeta}
                    ) {
                        assert.equal(
                            (await ledgerParticipantGet({participantId: '1'}, $meta))
                                .participantId,
                            1,
                            'participant get'
                        );
                        assert.deepEqual(
                            await ledgerParticipantAdd({}, $meta),
                            {participantId: '123'},
                            'participant add'
                        );
                    },
                ]),
    })
);
```

**Benefits:**

- Share common setup (authentication, database initialization)
- Compose complex test scenarios from simple building blocks
- DRY principle for test code
- Name tests clearly using the `group` function

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
    }
])
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
        }
    ],

    // This nested array waits for above array to complete
    [
        async function testCase3(assert, context) {
            // Test 3
        }
    ],

    testTeardown({}, $meta)
])
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
            }
        ])
}));
```

## Complete Example

```typescript
// payment/test/test/testTransfer.ts
import {IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({
    lib: {group},
    handler: {
        testLoginTokenCreate,
        testUserAdminLogin,
        paymentTransferPrepare,
        paymentTransferCommit,
        ledgerAccountBalance
    }
}) => ({
    testTransfer: ({
        name = 'transfer',
        amount = 100
    }, $meta) =>
        group(name)([
            // Setup: Login
            testLoginTokenCreate({}, $meta),
            testUserAdminLogin({}, $meta),

            // Test: Prepare transfer
            async function prepareTransfer(
                assert: typeof Assert,
                {$meta}: {$meta: IMeta}
            ) {
                const result = await paymentTransferPrepare({
                    fromAccount: 'ACC001',
                    toAccount: 'ACC002',
                    amount
                }, $meta);

                assert.ok(result.transferId, 'Transfer ID generated');
                assert.equal(result.status, 'prepared', 'Status is prepared');

                return {transferId: result.transferId};
            },

            // Test: Check balance before commit
            async function checkBalanceBefore(
                assert: typeof Assert,
                {$meta, transferId}: {$meta: IMeta; transferId: string}
            ) {
                const balance = await ledgerAccountBalance({
                    account: 'ACC001'
                }, $meta);

                assert.ok(balance.available >= amount, 'Sufficient balance');

                return {transferId, balanceBefore: balance.available};
            },

            // Test: Commit transfer
            async function commitTransfer(
                assert: typeof Assert,
                {$meta, transferId, balanceBefore}: {
                    $meta: IMeta;
                    transferId: string;
                    balanceBefore: number;
                }
            ) {
                const result = await paymentTransferCommit({
                    transferId
                }, $meta);

                assert.equal(result.status, 'completed', 'Status is completed');

                return {transferId, balanceBefore};
            },

            // Test: Verify balance after commit
            async function checkBalanceAfter(
                assert: typeof Assert,
                {$meta, balanceBefore}: {
                    $meta: IMeta;
                    balanceBefore: number;
                }
            ) {
                const balance = await ledgerAccountBalance({
                    account: 'ACC001'
                }, $meta);

                assert.equal(
                    balance.available,
                    balanceBefore - amount,
                    'Balance decreased by transfer amount'
                );
            }
        ])
}));
```

## Testing with Mock Data

```typescript
export default handler(({
    lib: {group},
    handler: {
        userUserAdd
    }
}) => ({
    testUserAdd: ({name = 'user add'}, $meta) =>
        group(name)([
            async function addUser(assert, {$meta}) {
                const testData = {
                    username: `user_${Date.now()}`,
                    email: `user_${Date.now()}@example.com`,
                    role: 'user'
                };

                const result = await userUserAdd(testData, $meta);

                assert.equal(result.username, testData.username);
                assert.ok(result.userId > 0);
            }
        ])
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

## Test Organization

### Group by Feature

```
test/test/
├── testUser.ts           # User CRUD tests
├── testRole.ts           # Role management tests
├── testPermission.ts     # Permission tests
└── testWorkflow.ts       # End-to-end workflow
```

### Group by Type

```
test/test/
├── testUnit.ts           # Unit tests
├── testIntegration.ts    # Integration tests
└── testE2E.ts            # End-to-end tests
```

## Best Practices

1. **Descriptive Names:** Use clear test and step names
2. **Independent Tests:** Each test should be runnable independently
3. **Clean Up:** Clean up test data (or use transactions)
4. **Assertions:** Include meaningful assertion messages
5. **Reuse Setup:** Share common setup via test handlers
6. **Context Flow:** Use thenable proxies - await all context property access
7. **Error Testing:** Test both success and error cases
8. **Parameterization:** Use parameters for flexible test data
9. **Comprehensive Coverage:** Test all business logic paths
10. **Fast Tests:** Leverage parallel execution for faster test runs
11. **Dependency Clarity:** Steps accessing context properties will wait automatically
12. **Concurrency Control:** Use `$meta.concurrency` to limit parallel execution if needed
13. **Sequential Groups:** Use nested arrays when order must be guaranteed

## Performance Tips

### Maximize Parallelism

Structure tests so independent steps can run in parallel:

```typescript
// Good: Three API calls run in parallel
group(name)([
    async function fetchUsers(assert, {$meta}) {
        return await userUserList({}, $meta);
    },
    async function fetchAccounts(assert, {$meta}) {
        return await accountList({}, $meta);
    },
    async function fetchPayments(assert, {$meta}) {
        return await paymentList({}, $meta);
    }
])
```

### Avoid Unnecessary Dependencies

Only access context when truly needed:

```typescript
// Bad: Creates unnecessary dependency
async function independentTest(assert, {setupUser, $meta}) {
    // Don't access setupUser if not needed
    const result = await otherHandler({}, $meta);
    assert.ok(result);
}

// Good: No dependency on setupUser
async function independentTest(assert, {$meta}) {
    const result = await otherHandler({}, $meta);
    assert.ok(result);
}
```

### Monitor Test Performance

Use latency metrics to identify slow tests:

```typescript
// Tests complete with timing information
// Check test output for step execution times
// Optimize bottlenecks that block many other steps
```

## Snapshot Testing

For snapshot testing, use `@tapjs/snapshot`:

```typescript
import {IMeta, handler} from '@feasibleone/blong';

export default handler(({
    lib: {group},
    handler: {userUserGet}
}) => ({
    testUserSnapshot: ({name = 'user snapshot'}, $meta) =>
        group(name)([
            async function snapshot(assert, {$meta}) {
                const result = await userUserGet({userId: 1}, $meta);

                // Use matchSnapshot from tap
                assert.matchSnapshot(result, 'user data');
            }
        ])
}));
```

## Test Configuration

Configure test-specific settings:

```typescript
config: {
    test: {
        db: {
            // Use test database
            connection: {
                database: 'test_db'
            }
        },
        http: {
            // Use mock endpoints
            url: 'http://localhost:9999'
        }
    }
}
```

## Examples from Codebase

- **Basic test:** `core/test/demo/test/test/testNumberSum.ts`
- **Complex workflow:** `ml/payment/test/test/`
- **Integration test:** `tools/release/test/test/`
