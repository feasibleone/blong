# blong-ttk Usage Guide

## Quick Start

### Installation

```bash
# Install dependencies
node common/scripts/install-run-rush.js install

# Build packages
node common/scripts/install-run-rush.js rebuild
```

### Running Tests

```bash
# Run unit tests
cd core/blong-ttk
npm test

# Run integration tests
npm run test -- integration.test.ts

# Run migration tests
npm run test -- migration.test.ts
```

## Usage Examples

### 1. Analyze Duplication in Existing Collections

```typescript
import {migrateMigrateCollectionAnalyze} from '@feasibleone/blong-ttk';

// Analyze a ml-testing-toolkit JSON collection
const result = await migrateMigrateCollectionAnalyze({
    sourcePath: './collections/hub/p2p.json',
}, $meta);

// Output shows:
// - Total requests
// - Duplicated patterns (requests, assertions, scripts)
// - Potential code reduction percentage
// - Top duplication patterns with locations
```

### 2. Convert JSON to TypeScript

```typescript
import {migrateMigrateCollectionConvert} from '@feasibleone/blong-ttk';

// Convert ml-testing-toolkit JSON to TypeScript
const result = await migrateMigrateCollectionConvert({
    sourcePath: './collections/hub/p2p.json',
    targetPath: './collections/hub/p2p.ts',
}, $meta);

// Generated TypeScript follows Blong patterns:
// - Handler wrapper with semantic triple naming
// - blong-chain step functions
// - Group-based test organization
// - Assertions converted to assert statements
```

### 3. Execute a Test Collection

```typescript
import {engineCollectionRun} from '@feasibleone/blong-ttk';

// Run a TypeScript test collection
const result = await engineCollectionRun({
    collection: './collections/hub/p2p.ts',
    concurrency: 10,
    timeout: 60000,
    realm: 'mojaloop',
    logUrl: 'http://localhost:9998/trace/{traceId}',
}, $meta);

// Result includes:
// - success: boolean
// - totalTests, passed, failed, skipped counts
// - duration
// - Allure results written to allure-results/
```

### 4. Generate Allure Report

```bash
# After running tests, generate HTML report
allure generate allure-results -o allure-report --clean

# Open report in browser
allure open allure-report
```

## Writing Test Collections

### Basic Structure

```typescript
import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';
import type {IMeta} from '@feasibleone/blong';

export default handler(({lib: {group}, handler: {
    // Import handler functions you need
    transferTransferCreate,
    callbackWait,
}}) => ({
    testMyFeature: ({name = 'My Feature Test'}, $meta: IMeta) =>
        group(name)([
            // Test steps as async functions
            async function step1(assert: typeof Assert, {$meta}) {
                // Your test logic
                const result = await someOperation();
                assert.ok(result);
                return result;
            },

            async function step2(assert: typeof Assert, {step1, $meta}) {
                // Depends on step1 via parameter
                const data = await step1;
                // More test logic
                return data;
            },
        ]),
}));
```

### Callback Pattern

For async flows (POST → 202 → PUT callback):

```typescript
async function createTransfer(assert, {$meta}) {
    // Make API call
    const result = await transferTransferCreate({
        amount: {amount: '100', currency: 'USD'},
    }, $meta);

    // Wait for async callback
    const callback = await callbackWait({
        correlationId: result.transferId,
        type: 'PUT /transfers/{ID}',
        timeout: 30000,
    }, $meta);

    // Verify callback
    assert.equal(callback.status, 200);
    assert.equal(callback.body.transferState, 'COMMITTED');

    return {result, callback};
}
```

### Parallel Execution

blong-chain automatically runs independent steps in parallel:

```typescript
group('Parallel Provisioning')([
    async function createDfsp1(assert, {$meta}) {
        return await provisionParticipantCreate({name: 'dfsp1'}, $meta);
    },

    async function createDfsp2(assert, {$meta}) {
        return await provisionParticipantCreate({name: 'dfsp2'}, $meta);
    },

    async function createDfsp3(assert, {$meta}) {
        return await provisionParticipantCreate({name: 'dfsp3'}, $meta);
    },

    // This runs after all DFSPs are created
    async function setupRouting(assert, {createDfsp1, createDfsp2, createDfsp3, $meta}) {
        const dfsps = await Promise.all([createDfsp1, createDfsp2, createDfsp3]);
        // Setup routing between DFSPs
    },
])
```

## Migration Guide

### Step 1: Analyze Existing Collections

```bash
# Analyze duplication
node -e "
import('@feasibleone/blong-ttk').then(({migrateMigrateCollectionAnalyze}) => {
    migrateMigrateCollectionAnalyze({
        sourcePath: './your-collection.json'
    }, {traceId: 'analyze'});
});
"
```

### Step 2: Convert to TypeScript

```bash
# Convert collection
node -e "
import('@feasibleone/blong-ttk').then(({migrateMigrateCollectionConvert}) => {
    migrateMigrateCollectionConvert({
        sourcePath: './your-collection.json',
        targetPath: './your-collection.ts'
    }, {traceId: 'convert'});
});
"
```

### Step 3: Review and Refactor

1. **Check variable references:** Environment variables like `{$environment.VAR}` need to be replaced with provisioning step outputs
2. **Review scripts:** JavaScript scripts in preRequest/postRequest may need manual conversion
3. **Extract helpers:** Look for repeated patterns and extract into reusable functions
4. **Add callbacks:** Replace polling patterns with `callbackWait`

### Step 4: Run and Validate

```typescript
import {engineCollectionRun} from '@feasibleone/blong-ttk';

const result = await engineCollectionRun({
    collection: './your-collection.ts',
    concurrency: 5,
}, $meta);

console.log(`Passed: ${result.passed}/${result.totalTests}`);
```

## Configuration

### Suite Configuration (server.ts)

```typescript
export default server(blong => ({
    url: import.meta.url,
    config: {
        default: {
            allure: {
                outputDir: 'allure-results',
                historyPath: '.allure/history.jsonl',
                generateOnEnd: false,
                logUrl: 'http://localhost:9998/trace/{traceId}',
            },
        },
        dev: {
            engine: {},
            callback: {
                webhook: {
                    port: 5050, // Callback webhook port
                },
            },
        },
    },
}));
```

### Callback Server

The callback realm starts a webhook server to receive async callbacks:

- Default port: 5050
- Routes:
  - `PUT /transfers/:id`
  - `PUT /quotes/:id`
  - `PUT /parties/:type/:id`
  - `PUT /transfers/:id/error`
  - `PUT /quotes/:id/error`

Configure your services to send callbacks to: `http://localhost:5050`

## Troubleshooting

### Tests Timeout

Increase timeout in collection run:

```typescript
await engineCollectionRun({
    collection: './your-collection.ts',
    timeout: 120000, // 2 minutes
}, $meta);
```

### Callback Not Received

1. Check callback server is running (port 5050 by default)
2. Verify correlation ID matches between request and callback
3. Check timeout setting in `callbackWait`
4. Review logs for incoming webhooks

### Generated TypeScript Errors

1. Check for syntax errors in variable references
2. Verify handler names are imported
3. Review script conversions for manual fixes needed

### Build Errors

```bash
# Clean and rebuild
node common/scripts/install-run-rush.js rebuild --clean

# Check for TypeScript errors
cd core/blong-ttk
npx tsc --noEmit
```

## Architecture

```
Test Collection (TypeScript)
    ↓
TestExecutor (blong-chain)
    ↓
Steps run in parallel
    ↓
API calls → Webhook callbacks
    ↓
Allure results written
    ↓
allure generate → HTML report
```

## Next Steps

1. **Integrate OpenAPI specs** - Wire Mojaloop APIs with x-blong-method
2. **Migrate collections** - Convert reference test collections
3. **Run against services** - Validate with running Mojaloop deployment
4. **Optimize parallelization** - Fine-tune concurrency for provisioning tests

## Support

- Documentation: `/plans/ttk/BLONG_TTK_IMPLEMENTATION_PLAN.md`
- Status: `/plans/ttk/IMPLEMENTATION_STATUS.md`
- Examples: `/core/blong-ttk/examples/`
- Tests: `/core/blong-ttk/*.test.ts`
