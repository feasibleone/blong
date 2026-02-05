# TestExecutor Feature Showcase

The `showcase.test.ts` file provides a comprehensive demonstration of all TestExecutor features. It serves both as living documentation and as a self-verification test suite.

## Running the Showcase

```bash
npm run build
node --test dist/showcase.test.js
```

## Test Structure

The showcase is organized into 6 comprehensive test suites, each demonstrating multiple related features:

### 1. Core Parallel Execution & Dependency Tracking (11 steps)

**Demonstrates:**

- ✅ **Thenable Proxy Pattern 1**: `await context.propertyName`
- ✅ **Thenable Proxy Pattern 2**: `{propertyName}` then `await propertyName`
- ✅ **Thenable Proxy Pattern 3**: `{propertyName}` then `await propertyName.nestedProperty`
- ✅ **Thenable Proxy Pattern 4**: `{propertyName: {nestedProperty}}` then `await nestedProperty`
- ✅ **$meta Access**: Direct synchronous access to meta information
- ✅ **Parallel Execution**: Independent steps run simultaneously
- ✅ **Dependency Resolution**: Dependent steps wait for their dependencies
- ✅ **Multiple Dependencies**: Steps can depend on multiple other steps
- ✅ **Shared Dependencies**: Multiple steps can await the same property
- ✅ **Progress Tracking**: Overall test progress with step-by-step details
- ✅ **Source Location Capture**: Stack traces for debugging
- ✅ **Dependency Graph**: Nodes and edges tracking step relationships
- ✅ **Event Emission**: Real-time events for test lifecycle
- ✅ **Latency Metrics**: Queue time, wait time, execution time tracking
- ✅ **Critical Path Analysis**: Longest dependency chain identification
- ✅ **Parallel Efficiency**: Ratio of parallel vs sequential execution
- ✅ **Bottleneck Detection**: Steps that block many other steps

**Example Pattern:**

```typescript
async function fetchUserData() {
    return {id: 1, name: 'Alice', email: 'alice@example.com'};
}

async function validateUser(assert, context) {
    const user = await context.fetchUserData; // Pattern 1
    assert.equal(user.name, 'Alice');
    return {validated: true, userId: user.id};
}

async function displayUserName(assert, context) {
    const {fetchUserData} = context; // Pattern 3
    const userName = await fetchUserData.name;
    assert.equal(userName, 'Alice');
    return {displayName: userName};
}
```

### 2. Nested Steps & Test Context Integration (9 steps)

**Demonstrates:**

- ✅ **Nested Arrays**: Groups of steps executed sequentially
- ✅ **Named Groups**: Array.name property for test organization
- ✅ **Hierarchical Execution**: Multi-level step grouping
- ✅ **Test Context Integration**: Automatic nesting with node:test
- ✅ **Proper Indentation**: Visual hierarchy in test output
- ✅ **Group Path Tracking**: Metadata about step location in hierarchy
- ✅ **Cross-Group Dependencies**: Steps in different groups can depend on each other

**Example Structure:**

```typescript
const databaseOperations = [
    async function connectDatabase() { /* ... */ },
    async function createSchema() { /* ... */ },
    async function seedData() { /* ... */ },
] as any;
databaseOperations.name = 'Database Setup';

const steps = [
    async function initialize() { /* ... */ },
    databaseOperations, // Nested group
    // ... more steps
];

await executor.execute(steps, {testId: 'nested-showcase'}, t);
```

**Output:**

```
▶ Feature Showcase: Nested Steps & Test Context Integration
  ✔ initialize
  ▶ Database Setup
    ✔ connectDatabase
    ✔ createSchema
    ✔ seedData
  ✔ Database Setup
  ...
```

### 3. Error Handling & Recovery (5 steps)

**Demonstrates:**

- ✅ **Error Capture**: Step errors with full context
- ✅ **Error Tracking**: Failed step status and error details
- ✅ **Error Events**: Real-time error notifications
- ✅ **Continued Execution**: Independent steps complete despite failures
- ✅ **Dependency Chain in Errors**: Tracking what failed and what depended on it
- ✅ **Source Location for Errors**: Stack traces with file/line information

**⚠️ Intentional Failure:**
This test includes a deliberately failing step (`failingStep`) to demonstrate error handling. The step will show as failed in the test output, but all verification subtests should pass, confirming that the framework properly:

- Tracks the error
- Captures error details
- Emits error events
- Continues executing independent steps

**Example:**

```typescript
async function failingStep(assert, context) {
    const setup = await context.successfulSetup;
    throw new Error('Intentional failure for demonstration');
}

async function independentSuccess(assert, context) {
    // This still runs and completes successfully
    const op1 = await context.independentOperation1;
    return {independentResult: 'completed'};
}
```

### 4. Promise Resolution Patterns (8 steps)

**Demonstrates:**

- ✅ **Whole Object Access**: Awaiting complete step results
- ✅ **Nested Property Access**: Awaiting specific object properties
- ✅ **Deep Property Access**: Multi-level nested property resolution
- ✅ **Multiple Property Access**: Destructuring multiple nested properties
- ✅ **Shared Property Resolution**: Multiple steps awaiting same nested property
- ✅ **Promise Caching**: Same promise resolved only once
- ✅ **Property Dependency Tracking**: Graph tracks nested property dependencies

**Example:**

```typescript
async function createComplexObject() {
    return {
        user: {
            name: 'Alice',
            profile: {
                preferences: {theme: 'dark'}
            }
        }
    };
}

async function useWholeObject(assert, context) {
    const data = await context.createComplexObject;
    assert.equal(data.user.name, 'Alice');
}

async function useDeepProperty(assert, context) {
    const {createComplexObject} = context;
    const theme = await createComplexObject.user.profile.preferences.theme;
    assert.equal(theme, 'dark');
}
```

### 5. Complete Integration Test (10 steps)

**Demonstrates:**

- ✅ **Realistic Workflow**: E-commerce checkout scenario
- ✅ **Mixed Patterns**: Combination of all features
- ✅ **Performance Optimization**: Parallel execution saves time
- ✅ **Complex Dependencies**: Multi-level dependency chains
- ✅ **Full Feature Integration**: All features working together

**Scenario:**
A complete e-commerce checkout flow with:

- Product loading
- Cart validation
- Inventory checking
- Shipping calculation
- Tax calculation
- Payment processing
- Order creation
- Email notification
- Inventory update

### 6. Checkpoints and Synchronization Barriers (11 steps)

**Demonstrates:**

- ✅ **Checkpoints**: Empty arrays `[]` as synchronization barriers
- ✅ **Phased Execution**: Multiple phases with parallel steps within each phase
- ✅ **Synchronization**: Ensures all steps in a phase complete before next phase starts
- ✅ **Multiple Checkpoints**: Multiple barriers throughout execution
- ✅ **Parallel Within Phases**: Steps within same phase still execute in parallel
- ✅ **Performance Control**: Balance between parallelism and synchronization

**Structure:**

```typescript
const steps = [
    // Phase 1: Initialization (parallel)
    async function loadConfig() { /* ... */ },
    async function initializeCache() { /* ... */ },
    async function setupLogging() { /* ... */ },
    
    [], // Checkpoint 1: Wait for all initialization
    
    // Phase 2: Data loading (parallel, after Phase 1)
    async function loadUsers({loadConfig}) { /* ... */ },
    async function loadProducts({loadConfig}) { /* ... */ },
    async function loadOrders({loadConfig}) { /* ... */ },
    
    [], // Checkpoint 2: Wait for all data loading
    
    // Phase 3: Processing (parallel, after Phase 2)
    async function generateUserReport({loadUsers, loadOrders}) { /* ... */ },
    async function generateProductReport({loadProducts, loadOrders}) { /* ... */ },
    async function calculateMetrics({loadUsers, loadProducts, loadOrders}) { /* ... */ },
    
    [], // Checkpoint 3: Wait for all processing
    
    // Phase 4: Finalization (after Phase 3)
    async function saveAnalytics({generateUserReport, generateProductReport, calculateMetrics}) { /* ... */ },
];
```

**Benefits:**
- Clear separation of execution phases
- Controlled resource usage
- Predictable execution order while maintaining parallelism
- Ideal for multi-stage pipelines (init → load → process → finalize)

## Feature Checklist

Use this checklist to verify all features are working:

### Core Execution

- [x] Parallel execution of independent steps
- [x] Sequential execution of dependent steps
- [x] Configurable concurrency limits
- [x] Nested array sequential execution
- [x] Empty array checkpoints for synchronization

### Thenable Proxies

- [x] Pattern 1: Direct await
- [x] Pattern 2: Destructure then await
- [x] Pattern 3: Destructure then await nested
- [x] Pattern 4: Deep destructure then await
- [x] $meta direct access

### Dependency Management

- [x] Simple dependencies (A → B)
- [x] Multiple dependencies (A,B → C)
- [x] Shared dependencies (A → B,C,D)
- [x] Nested property dependencies
- [x] Dependency graph generation
- [x] Graph nodes and edges

### Progress Tracking

- [x] Overall test progress
- [x] Individual step progress
- [x] Step status tracking
- [x] Start/end timestamps
- [x] Duration calculation
- [x] Real-time event emission
- [x] Group hierarchy tracking

### Error Handling

- [x] Error capture with context
- [x] Source location tracking
- [x] Dependency chain in errors
- [x] Continued execution after error
- [x] Error event emission
- [x] Failed step status

### Latency Metrics

- [x] Queue time tracking
- [x] Wait time tracking
- [x] Execution time tracking
- [x] Total time tracking
- [x] Critical path calculation
- [x] Parallel efficiency ratio
- [x] Bottleneck identification

### Promise Resolution

- [x] Main step promises
- [x] Nested property promises
- [x] Multiple awaits of same property
- [x] Promise caching
- [x] Deep property access

### Test Context Integration

- [x] Nested test output
- [x] Automatic indentation
- [x] Named groups
- [x] Multi-level hierarchy
- [x] Backward compatibility (without context)

### Checkpoints

- [x] Empty array as synchronization barrier
- [x] Multiple checkpoints
- [x] Parallel execution within phases
- [x] Phase ordering enforcement

## Test Results

**Expected Results:**

- Total tests: 69
- Passing: 67
- Failing: 2 (intentional error demonstration)

**Intentional Failures:**

1. `failingStep` - Demonstrates error tracking
2. `Feature Showcase: Error Handling & Recovery` - Parent test of failingStep

All verification subtests within "Error Handling & Recovery" should pass:

- ✔ Error Tracking Verification
- ✔ Error Events Verification
- ✔ Continued Execution Verification
- ✔ Dependency Chain Verification

## Performance Characteristics

The showcase demonstrates realistic performance patterns:

- **Parallel speedup**: Multiple independent operations run simultaneously
- **Efficient dependency resolution**: Steps start as soon as dependencies complete
- **Minimal overhead**: Framework overhead is negligible compared to actual work
- **Scalable**: Configurable concurrency supports different workload patterns

**Example timing** (actual times vary by system):

- Sequential time (if all steps ran one after another): ~400ms
- Actual parallel execution time: ~240ms
- Parallel efficiency: ~1.67x speedup

## Usage as Documentation

Each test suite in the showcase serves as a reference implementation:

1. **Study the patterns**: See how features are used in realistic scenarios
2. **Copy and adapt**: Use test patterns as templates for your own tests
3. **Understand behavior**: Observe how features interact and compose
4. **Verify functionality**: Ensure the framework works as documented

## Extending the Showcase

To add new feature demonstrations:

1. Create a new test suite or add to an existing one
2. Include comprehensive verification subtests
3. Add documentation to this file
4. Update the feature checklist
5. Document expected behavior and results

## See Also

- [index.test.ts](./index.test.ts) - Unit tests for individual features
- [NESTED_TEST_CONTEXT.md](./NESTED_TEST_CONTEXT.md) - Test context integration details
- [TESTING.md](./TESTING.md) - Complete testing guide
- [test-types.ts](./test-types.ts) - TypeScript type definitions
