# @feasibleone/blong-chain

**Parallel test execution with automatic dependency detection through thenable proxies.**

`blong-chain` is a TypeScript test framework that automatically detects
dependencies between test steps and executes them in parallel when possible,
maximizing performance while maintaining correctness.

## Key Features

- 🚀 **Automatic Parallelization** - Independent steps run concurrently
- 🔗 **Dependency Detection** - Access patterns automatically create dependencies
- 📊 **Progress Tracking** - Real-time execution monitoring with events
- 🎯 **Thenable Proxies** - Natural async/await syntax for step dependencies
- 📈 **Performance Metrics** - Queue time, execution time, and critical path analysis
- 🌳 **Nested Groups** - Hierarchical test organization with proper indentation
- 🔧 **Error Handling** - Graceful failure with continued execution of
  independent steps
- 🧪 **Test Framework Integration** - Works seamlessly with node:test, tap,
  and others

## Installation

```bash
npm install @feasibleone/blong-chain
```

## Quick Start

```typescript
import {TestExecutor} from '@feasibleone/blong-chain';
import assert from 'node:assert/strict';
import {test} from 'node:test';

test('parallel execution example', async (t) => {
    const executor = new TestExecutor({concurrency: 10});

    const steps = [
        async function fetchUser(assert, context) {
            // Independent - runs immediately
            return {id: 1, name: 'Alice'};
        },

        async function fetchAccount(assert, context) {
            // Independent - runs in parallel with fetchUser
            return {balance: 1000};
        },

        async function validateUser(assert, {fetchUser}) {
            // Dependent - waits for fetchUser to complete
            const user = await fetchUser;
            assert.equal(user.name, 'Alice');
            return {validated: true};
        },

        async function generateReport(assert, {fetchUser, fetchAccount}) {
            // Multiple dependencies - waits for both
            const user = await fetchUser;
            const account = await fetchAccount;
            return `User ${user.name} has balance ${account.balance}`;
        },
    ];

    await executor.execute(steps, {testId: 'example'}, t);
});
```

## Core Concepts

### Thenable Proxies

Steps access previous results through thenable proxies that automatically track
dependencies:

```typescript
// Pattern 1: Direct await
async function step1(assert, {previousStep}) {
    const result = await previousStep;
}

// Pattern 2: Destructure then await
async function step2(assert, {previousStep}) {
    const result = await previousStep;
}

// Pattern 3: Nested property access
async function step3(assert, {previousStep}) {
    const name = await previousStep.user.name;
}

// Pattern 4: Deep destructuring
async function step4(assert, {previousStep: {user: {name}}}) {
    const userName = await name;
}
```

### Automatic Parallelization

The executor analyzes your access patterns and runs independent steps concurrently:

```typescript
const steps = [
    async function stepA() {
        // Runs immediately
        await someAsyncWork();
        return {dataA: 'A'};
    },

    async function stepB() {
        // Runs immediately in parallel with stepA
        await someAsyncWork();
        return {dataB: 'B'};
    },

    async function stepC(assert, {stepA}) {
        // Waits for stepA (automatic dependency)
        const a = await stepA;
        return {dataC: a.dataA + 'C'};
    },

    async function stepD(assert, {stepA, stepB}) {
        // Waits for both stepA and stepB (parallel wait)
        const a = await stepA;
        const b = await stepB;
        assert.ok(a.dataA);
        assert.ok(b.dataB);
        return {dataD: 'D'};
    },
];
```

### Meta Information

The special `$meta` property is always available directly without await:

```typescript
async function myStep(assert, {$meta}) {
    // Access meta synchronously
    console.log($meta.testId);
    console.log($meta.environment);

    // Meta is passed when executing
    await executor.execute(steps, {
        testId: 'test-123',
        environment: 'production',
    });
}
```

## Advanced Features

### Nested Test Groups

Organize steps into hierarchical groups for better structure and output:

```typescript
const databaseSetup = [
    async function connect() { return {connected: true}; },
    async function createSchema() { return {created: true}; },
    async function seedData() { return {users: []}; },
] as any;
databaseSetup.name = 'Database Setup';

const apiTests = [
    async function testEndpoint1() { return {status: 200}; },
    async function testEndpoint2() { return {status: 200}; },
] as any;
apiTests.name = 'API Tests';

const steps = [
    async function initialize() { return {ready: true}; },
    databaseSetup,  // Nested group
    apiTests,       // Nested group
    async function cleanup() { return {done: true}; },
];

await executor.execute(steps, {}, t);
```

**Output:**

```text
▶ Test Name
  ✔ initialize
  ▶ Database Setup
    ✔ connect
    ✔ createSchema
    ✔ seedData
  ✔ Database Setup
  ▶ API Tests
    ✔ testEndpoint1
    ✔ testEndpoint2
  ✔ API Tests
  ✔ cleanup
```

### Checkpoints (Synchronization Barriers)

Use empty arrays `[]` as checkpoints to synchronize parallel execution. All steps before a checkpoint must complete before any steps after it begin:

```typescript
const steps = [
    // Phase 1: These run in parallel
    async function loadConfig() {
        await fetchConfig();
        return {apiUrl: 'https://api.example.com'};
    },

    async function initializeCache() {
        await setupCache();
        return {cacheReady: true};
    },

    async function setupLogging() {
        await configureLogger();
        return {loggerReady: true};
    },

    // Checkpoint: Wait for all Phase 1 steps to complete
    [],

    // Phase 2: These run in parallel, but only after Phase 1 completes
    async function loadUsers({loadConfig}) {
        const config = await loadConfig;
        return await fetchUsers(config.apiUrl);
    },

    async function loadProducts({loadConfig}) {
        const config = await loadConfig;
        return await fetchProducts(config.apiUrl);
    },

    // Another checkpoint
    [],

    // Phase 3: Runs only after Phase 2 completes
    async function generateReport({loadUsers, loadProducts}) {
        const users = await loadUsers;
        const products = await loadProducts;
        return {report: combineData(users, products)};
    },
];
```

**Use Cases:**
- **Phased execution**: Separate initialization, data loading, processing, and cleanup phases
- **Resource management**: Ensure all resources are ready before proceeding
- **Testing stages**: Complete all setup before running tests, then cleanup
- **Performance control**: Balance parallelism with resource constraints

### Progress Tracking and Events

Monitor test execution in real-time:

```typescript
const executor = new TestExecutor({concurrency: 10});

executor.on('test:start', (progress) => {
    console.log('Test started:', progress.testName);
});

executor.on('step:start', (stepName, progress) => {
    console.log('Step started:', stepName);
});

executor.on('step:end', (stepName, progress) => {
    console.log('Step completed:', stepName, `in ${progress.duration}ms`);
});

executor.on('step:error', (stepName, error, progress) => {
    console.error('Step failed:', stepName, error.message);
});

await executor.execute(steps, {});

// Get final progress
const progress = executor.getProgress();
console.log(`Completed ${progress.completedSteps}/${progress.totalSteps} steps`);
console.log(`Failed: ${progress.failedSteps}`);
```

### Dependency Graph Analysis

Inspect the dependency relationships:

```typescript
await executor.execute(steps, {});

const graph = executor.getDependencyGraph();

// View all steps
for (const [name, node] of graph.nodes) {
    console.log(`${name}: ${node.status}`);
}

// View dependencies
for (const edge of graph.edges) {
    console.log(`${edge.from} depends on ${edge.to} via ${edge.property}`);
}
```

### Performance Metrics

Analyze execution performance:

```typescript
await executor.execute(steps, {});

const latency = executor.getLatencyReport();

console.log(`Total duration: ${latency.totalDuration}ms`);
console.log(`Parallel efficiency: ${latency.parallelEfficiency.toFixed(2)}x`);
console.log(`Critical path: ${latency.criticalPath.join(' → ')}`);

// View bottlenecks
for (const bottleneck of latency.bottlenecks) {
    console.log(
        `${bottleneck.stepName} blocked ${bottleneck.blockedSteps.length} steps`
    );
}

// View individual step metrics
for (const [name, metrics] of latency.steps) {
    console.log(`${name}:`, {
        queue: metrics.queueTime,
        wait: metrics.waitTime,
        exec: metrics.executionTime,
    });
}
```

### Error Handling

Steps fail gracefully while independent steps continue:

```typescript
const steps = [
    async function stepA() {
        return {data: 'A'};
    },

    async function stepB() {
        throw new Error('Step B failed');
    },

    async function stepC(assert, {stepA}) {
        // This still runs - it's independent of stepB
        const a = await stepA;
        return {data: 'C'};
    },

    async function stepD(assert, {stepB}) {
        // This can handle the error if needed
        try {
            await stepB;
        } catch (error) {
            assert.ok(error.message.includes('Step B failed'));
            return {handled: true};
        }
    },
];

await executor.execute(steps, {});

// Check which steps failed
const progress = executor.getProgress();
for (const [name, step] of progress.steps) {
    if (step.status === 'failed') {
        console.log(`${name} failed:`, step.error?.message);
    }
}
```

## Configuration Options

```typescript
const executor = new TestExecutor({
    // Maximum concurrent steps (default: 10)
    concurrency: 5,

    // Capture stack traces for better error reporting (default: false)
    // Note: Has performance impact
    captureStackTraces: true,

    // Test framework context (optional)
    // Passed automatically when using test framework integration
    framework: undefined,
});
```

## Real-World Example

```typescript
test('e-commerce checkout flow', async (t) => {
    const executor = new TestExecutor({concurrency: 5});

    const steps = [
        async function loadProduct(assert, context) {
            await new Promise(resolve => setTimeout(resolve, 30));
            return {productId: 'PROD-123', price: 99.99, inStock: true};
        },

        async function loadCart(assert, context) {
            await new Promise(resolve => setTimeout(resolve, 30));
            return {cartId: 'CART-456', items: 2};
        },

        async function validateInventory(assert, {loadProduct}) {
            const product = await loadProduct;
            assert.ok(product.inStock);
            return {valid: true, reservationId: 'RES-789'};
        },

        async function calculateShipping(assert, {loadCart}) {
            const cart = await loadCart;
            return {cost: 9.99, days: 3};
        },

        async function calculateTax(assert, {loadProduct}) {
            const product = await loadProduct;
            return {amount: product.price * 0.08};
        },

        async function calculateTotal(assert, {
            loadProduct, calculateShipping, calculateTax
        }) {
            const product = await loadProduct;
            const shipping = await calculateShipping;
            const tax = await calculateTax;

            return {
                total: product.price + shipping.cost + tax.amount,
                breakdown: {
                    product: product.price,
                    shipping: shipping.cost,
                    tax: tax.amount,
                },
            };
        },

        async function processPayment(assert, {
            calculateTotal, validateInventory
        }) {
            const total = await calculateTotal;
            const inventory = await validateInventory;

            assert.ok(inventory.valid);
            await new Promise(resolve => setTimeout(resolve, 40));

            return {
                paymentId: 'PAY-999',
                amount: total.total,
                status: 'completed',
            };
        },

        async function createOrder(assert, {processPayment}) {
            const payment = await processPayment;
            assert.equal(payment.status, 'completed');

            return {
                orderId: 'ORD-111',
                paymentId: payment.paymentId,
            };
        },
    ];

    await executor.execute(steps, {
        testId: 'checkout-001',
        environment: 'test',
    }, t);

    // Verify results
    const progress = executor.getProgress();
    assert.equal(progress.status, 'completed');
    assert.equal(progress.failedSteps, 0);

    const latency = executor.getLatencyReport();
    console.log(`Completed in ${latency.totalDuration}ms`);
    console.log(`Parallel efficiency: ${latency.parallelEfficiency.toFixed(2)}x`);
});
```

In this example:

- `loadProduct` and `loadCart` run in parallel immediately
- `validateInventory` and `calculateShipping` wait only for their specific dependencies
- `calculateTax` runs as soon as `loadProduct` completes
- `calculateTotal` waits for all pricing components
- `processPayment` and `createOrder` form the critical path
- Total execution time is significantly less than sequential execution

## Documentation

- **[SHOWCASE.md](./SHOWCASE.md)** - Comprehensive feature showcase with all patterns
- **[TESTING.md](./TESTING.md)** - Testing guide and CI integration
- **[NESTED_TEST_CONTEXT.md](./NESTED_TEST_CONTEXT.md)** - Test framework
  integration details
- **[test-types.ts](./test-types.ts)** - Complete TypeScript API documentation

## Running Tests

```bash
# Run unit tests
npm test

# Run showcase examples
npm run build
node --test dist/showcase.test.js

# Run all tests
npm run test:all
```

## How It Works

1. **Detection Phase**: When you destructure or access `context.stepName`, a
   thenable proxy is returned
2. **Dependency Tracking**: The access is recorded as a dependency
3. **Scheduling Phase**: Steps are added to a priority queue based on dependencies
4. **Execution Phase**: Steps run as soon as all their dependencies complete
5. **Resolution Phase**: Step results are stored and proxies are resolved
6. **Checkpoints**: Empty arrays `[]` create synchronization barriers, waiting for
   all previous steps to complete before continuing

This creates a dynamic dependency graph that enables maximum parallelization
while ensuring correctness, with optional synchronization points for phased execution.

## Use Cases

- **Integration Tests** - Test complex workflows with many async operations
- **E2E Tests** - Reduce test suite execution time through parallelization
- **Data Pipelines** - Orchestrate parallel data processing steps
- **API Testing** - Test multiple endpoints with shared setup steps
- **Performance Testing** - Identify bottlenecks with built-in metrics

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type {
    ITestExecutor,
    ITestContext,
    ITestProgress,
    IDependencyGraph,
    ITestLatency,
    StepFunction,
    StepArray,
} from '@feasibleone/blong-chain';
```

## License

Part of the [Blong Framework](https://github.com/feasibleone/blong)

## Contributing

Issues and pull requests welcome at <https://github.com/feasibleone/blong>
