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

## Handler Naming Reference

The migration emitter maps HTTP operations to semantic triple handler names
(`subjectObjectPredicate`). The following table shows the naming rules:

| Method | Path pattern              | Handler name               |
|--------|---------------------------|----------------------------|
| POST   | `/transfers`              | `transferTransferCreate`   |
| GET    | `/transfers/{id}`         | `transferTransferGet`      |
| PUT    | `/transfers/{id}`         | `transferTransferUpdate`   |
| DELETE | `/transfers/{id}`         | `transferTransferRemove`   |
| PATCH  | `/transfers/{id}`         | `transferTransferPatch`    |
| GET    | `/transfers`              | `transferTransferFind`     |
| POST   | `/quotes`                 | `quoteQuoteCreate`         |
| GET    | `/parties/{type}/{id}`    | `partyPartyGet`            |
| POST   | `/participants`           | `participantParticipantCreate` |
| POST   | `/participants/{n}/limits`| `limitLimitCreate`         |

Rules:
- **Subject** = singular of the last non-parameter path segment  
- **Object** = same as subject (capitalized)  
- **Predicate** = Create / Get / Find / Update / Patch / Remove / Execute  
- `GET` without trailing `{param}` → **Find** (list); with trailing `{param}` → **Get**  
- Irregular plurals are handled: `parties→party`, `currencies→currency`, etc.

## Variable Reference Handling

The emitter transforms variable references automatically:

| TTK syntax                          | Generated TypeScript         | Notes                                 |
|-------------------------------------|------------------------------|---------------------------------------|
| `{$environment.TRANSFER_ID}`        | `inputs.TRANSFER_ID`         | Passed via `inputs` param to function |
| `{$prev.1.response.body.amount}`    | `` `${undefined}` ``         | Requires manual wiring to step result |
| `{$request.body.transferId}`        | `` `${undefined}` ``         | Requires manual wiring                |

The generated function signature includes `inputs = {}` for environment variables:

```typescript
myCollection: ({name = 'My Collection', inputs = {}}: {name?: string; inputs?: Record<string, string>}, $meta: IMeta) =>
```

Search the generated code for `` `${undefined}` `` to find placeholders that need manual wiring.

## Migration Guide

### Complete Migration Workflow

```
ml-testing-toolkit JSON  →  TypeScript  →  Review & wire  →  Run  →  Allure report
```

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

### Step 2b: Extract Shared Helpers from Multiple Collections

When migrating several related collections, use `migrateMigrateHelperExtract` first to
identify operations that appear in multiple collections and generate a shared `helpers.ts`:

```typescript
import {migrateMigrateHelperExtract} from '@feasibleone/blong-ttk';

const result = await migrateMigrateHelperExtract({
    sourcePaths: [
        './collections/hub/p2p.json',
        './collections/hub/onboarding.json',
        './collections/hub/regression.json',
    ],
    targetDir: './collections/hub/shared',
    minCollections: 2, // include op if it appears in ≥2 collections
}, $meta);

// Generated: ./collections/hub/shared/helpers.ts
// Contents:
//   export const sharedHandlerNames = ['transferTransferCreate', 'quoteQuoteCreate', ...] as const;
//   export type SharedHandlerName = typeof sharedHandlerNames[number];
```

Then import `sharedHandlerNames` in each converted collection to reference the shared operations.

### Step 2c: Convert Callback Rules (if needed)

If your collection uses a `response_rules.json` file for callback dispatch, convert it to
`@infitx/decision` YAML format:

```typescript
import {migrateMigrateRuleConvert} from '@feasibleone/blong-ttk';

await migrateMigrateRuleConvert({
    sourcePath: './response_rules.json',    // json-rules-engine format
    targetPath: './callback-rules.yaml',   // @infitx/decision format
}, $meta);
```

The converted YAML can be passed directly to `callbackRuleDispatch`:

```typescript
// In callbackRuleDispatch handler:
const rules = './callback-rules.yaml';  // or inline DecisionConfig object
```

### Step 3: Review and Refactor

1. **Wire `$prev` references:** Search for `` `${undefined}` `` in the output — each is a
   `{$prev.X}` or `{$request.X}` reference that needs to be replaced with the actual step
   result from the previous async function:

   ```typescript
   // Generated (needs manual wiring):
   transferId: `${undefined}`,

   // Fixed (after wiring):
   const priorResult = await createQuote;
   // ...
   transferId: priorResult.transferId,
   ```

2. **Check variable references:** `inputs.VAR_NAME` references are already wired through
   the `inputs` parameter. Make sure callers pass the right values:

   ```typescript
   // Caller provides environment values:
   await myCollection({inputs: {TRANSFER_ID: uuid(), CURRENCY: 'USD'}}, $meta);
   ```

3. **Review script comments:** Converted scripts appear as inline comments. Check them for
   logic that needs to be implemented as TypeScript (e.g., UUID generation, token setting).

4. **Add callbacks where needed:** If a request returns 202 Accepted and expects a callback,
   add `callbackCallbackRegister` + `callbackCallbackWait`:

   ```typescript
   async function createTransfer(assert, {$meta}) {
       await callbackCallbackRegister({correlationId: inputs.TRANSFER_ID, type: 'PUT /transfers/{ID}'}, $meta);
       const result = await transferTransferCreate({...}, $meta);
       assert.equal(result.status, 202);
       return result;
   },
   async function waitForCallback(assert, {createTransfer, $meta}) {
       const callback = await callbackCallbackWait({correlationId: inputs.TRANSFER_ID}, $meta);
       assert.equal(callback.body.transferState, 'COMMITTED');
       return callback;
   },
   ```

5. **Extract shared helpers:** Move repeated provisioning steps to separate reusable
   handler files (see Step 2b).

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
