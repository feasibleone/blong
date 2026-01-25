---
name: blong-test
description: Write automated tests for Blong handlers using test handler patterns. Tests return arrays of steps with context passing between them. Supports assertions, error testing, and test reuse. Use for test-driven development, API testing, integration testing, or verifying business logic.
---

# Implementing Tests

## Overview

Test handlers follow the same patterns as business handlers but are organized in the `test/test` folder. They return arrays of test steps that can be executed by the framework's test runner.

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
    lib: {rename},
    handler: {
        realmEntityAction  // Handler to test
    }
}) => ({
    testExample: ({name = 'example'}, $meta) =>
        rename([
            async function testCase(
                assert: typeof Assert,
                {$meta}: {$meta: IMeta}
            ) {
                const result = await realmEntityAction({
                    param: 'value'
                }, $meta);

                assert.equal(result.output, 'expected', 'Verify output');
            }
        ], name)
}));
```

### Test with Multiple Steps

```typescript
export default handler(({
    lib: {rename},
    handler: {
        userUserAdd,
        userUserFind,
        userUserDelete
    }
}) => ({
    testUserLifecycle: ({name = 'user lifecycle'}, $meta) =>
        rename([
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
        ], name)
}));
```

## Test Parameters

### Default Name

```typescript
testExample: ({name = 'default name'}, $meta) =>
    rename([/* steps */], name)
```

### Custom Parameters

```typescript
testExample: ({
    name = 'example',
    username = 'testuser',
    amount = 100
}, $meta) =>
    rename([
        async function test(assert, {$meta}) {
            const result = await handler({
                username,
                amount
            }, $meta);
            assert.ok(result);
        }
    ], name)
```

## Context Passing

Tests start with empty context. Each step can add to context:

```typescript
rename([
    // Step 1: Returns {userId: 123}
    async function step1(assert, {$meta}) {
        const user = await userUserAdd({...}, $meta);
        return {userId: user.userId};
    },

    // Step 2: Receives {$meta, userId: 123}
    async function step2(assert, {$meta, userId}) {
        const payment = await paymentCreate({userId}, $meta);
        return {userId, paymentId: payment.id};
    },

    // Step 3: Receives {$meta, userId: 123, paymentId: 456}
    async function step3(assert, {$meta, userId, paymentId}) {
        await verifyPayment({userId, paymentId}, $meta);
    }
], name)
```

**Context Rules:**

- Function name determines context property name
- Returned value is added to context
- Subsequent steps receive accumulated context
- Always includes `$meta`

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
    lib: {rename},
    handler: {
        testLoginTokenCreate,    // Reusable login test
        testUserAdminLogin,      // Reusable admin login
        subjectNumberSum
    }
}) => ({
    testNumberSum: ({name = 'number sum'}, $meta) =>
        rename([
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
        ], name)
}));
```

**Test Composition Pattern:**

The `rename` library function allows test arrays to be composed and reused:

```typescript
// ledger/test/test/testParticipant.ts
export default handler(
    ({
        lib: {rename},
        handler: {
            testLoginTokenCreate,
            ledgerParticipantGet,
            ledgerParticipantAdd
        },
    }) => ({
        testParticipant: ({name = 'ledger'}, $meta) =>
            rename(
                [
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
                ],
                name
            ),
    })
);
```

**Benefits:**

- Share common setup (authentication, database initialization)
- Compose complex test scenarios from simple building blocks
- DRY principle for test code
- Name tests clearly using the `rename` function

## Nested Test Arrays

Group related tests:

```typescript
rename([
    testSetup({}, $meta),

    // Nested array of tests
    [
        async function testCase1(assert, context) {
            // Test 1
        },
        async function testCase2(assert, context) {
            // Test 2
        }
    ],

    testTeardown({}, $meta)
], name)
```

## Complete Example

```typescript
// payment/test/test/testTransfer.ts
import {IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({
    lib: {rename},
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
        rename([
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
        ], name)
}));
```

## Testing with Mock Data

```typescript
export default handler(({
    lib: {rename},
    handler: {
        userUserAdd
    }
}) => ({
    testUserAdd: ({name = 'user add'}, $meta) =>
        rename([
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
        ], name)
}));
```

## Running Tests

Tests are executed by the framework when the test layer is activated:

```typescript
// In realm configuration
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
6. **Context Flow:** Use context to pass data between steps
7. **Error Testing:** Test both success and error cases
8. **Parameterization:** Use parameters for flexible test data
9. **Comprehensive Coverage:** Test all business logic paths
10. **Fast Tests:** Keep tests fast for TDD workflow

## Snapshot Testing

For snapshot testing, use `@tapjs/snapshot`:

```typescript
import {IMeta, handler} from '@feasibleone/blong';

export default handler(({
    lib: {rename},
    handler: {userUserGet}
}) => ({
    testUserSnapshot: ({name = 'user snapshot'}, $meta) =>
        rename([
            async function snapshot(assert, {$meta}) {
                const result = await userUserGet({userId: 1}, $meta);

                // Use matchSnapshot from tap
                assert.matchSnapshot(result, 'user data');
            }
        ], name)
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
