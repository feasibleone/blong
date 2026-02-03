# TestExecutor: Nested Test Context Integration

## Overview

The TestExecutor now supports integration with test frameworks like `node:test`
for automatic nested test output with proper indentation. This enables better
visualization of test hierarchies and parallel execution.

## Features

### 1. Test Framework Integration

The `execute()` method now accepts an optional `ITestFrameworkContext` parameter:

```typescript
interface ITestFrameworkContext {
    test: (name: string, fn: (t: unknown) => void | Promise<void>) => unknown;
}

await executor.execute(steps, $meta, testContext);
```

### 2. Automatic Indentation

When a test context is provided, the framework automatically creates nested test
scopes:

- Top-level steps are wrapped in individual tests
- Nested arrays create test groups with proper indentation
- Multiple levels of nesting are supported
- The test framework (e.g., `node:test`) handles the visual indentation

### 3. Parallel Execution Preserved

Steps within the same array still execute in parallel
(respecting concurrency limits), even when wrapped in test contexts.

### 4. Backward Compatibility

The test context parameter is optional. Without it, the executor behaves exactly
as before.

## Usage Examples

### Basic Usage with node:test

```typescript
import {TestExecutor} from '@feasibleone/blong-chain';
import {it} from 'node:test';

it('my test', async (t) => {
    const executor = new TestExecutor({concurrency: 10});

    const steps = [
        async function step1() {
            return {result: 'data'};
        },
        async function step2(assert, context) {
            const data = await context.step1;
            assert.equal(data.result, 'data');
        },
    ];

    // Pass test context for nested output
    await executor.execute(steps, {}, t);
});
```

### Nested Groups

```typescript
const databaseSetup = [
    async function connect() { return {connected: true}; },
    async function createTable() { return {table: 'users'}; },
] as any;
databaseSetup.name = 'Database Setup';

const steps = [
    async function init() { return {ready: true}; },
    databaseSetup, // Creates a nested test group
    async function verify() { return {verified: true}; },
];

await executor.execute(steps, {}, testContext);
```

Output:

```text
▶ my test
  ✔ init
  ▶ Database Setup
    ✔ connect
    ✔ createTable
  ✔ Database Setup
  ✔ verify
✔ my test
```

### Deeply Nested Hierarchy

```typescript
const level3 = [
    async function deepOp() { return {level: 3}; }
] as any;
level3.name = 'Level 3';

const level2 = [
    async function midOp() { return {level: 2}; },
    level3,
] as any;
level2.name = 'Level 2';

const steps = [
    async function topOp() { return {level: 1}; },
    level2,
];

await executor.execute(steps, {}, testContext);
```

Output shows 3 levels of indentation automatically.

## Integration with blong-gogo

The `runSteps` function in `blong-gogo/src/chain.ts` now passes the test context:

```typescript
await executor.execute(resolvedSteps, results.$meta || {}, t);
```

This means all existing Blong tests automatically benefit from nested output
when run through `blong-gogo`.

## Implementation Details

### Type Definitions

New type `ITestFrameworkContext` added to `test-types.ts`:

```typescript
export interface ITestFrameworkContext {
    test: (name: string, fn: (t: unknown) => void | Promise<void>) => unknown;
}
```

Updated `ITestExecutor` interface:

```typescript
execute(steps: StepArray, $meta: IMeta, testContext?: ITestFrameworkContext): Promise<void>;
```

### Error Handling

When using test context:

- Errors are caught and recorded in progress tracking
- The test framework reports the failure
- The executor continues processing other steps
- Error details are preserved in `IStepProgress`

### Test Coverage

Added comprehensive tests in `index.test.ts`:

- ✅ Basic nested context execution
- ✅ Nested arrays with automatic indentation
- ✅ Deeply nested hierarchies (3+ levels)
- ✅ Parallel execution within nested groups
- ✅ Backward compatibility without test context
- ✅ Error reporting with test context

### Demo

Run `node --test dist/demo.test.js` to see nested output in action with:

- Database operations example
- Deep hierarchy example (3 levels)
- Parallel task execution example

## Benefits

1. **Better Visualization**: Test hierarchies are clearly visible with indentation
2. **IDE Integration**: Test explorers in VS Code and other IDEs can display the
   hierarchy
3. **Debugging**: Easier to identify which group or level a failing test belongs
   to
4. **Documentation**: Test output serves as living documentation of the test structure
5. **Flexibility**: Works with or without test context, supporting different
   testing approaches
