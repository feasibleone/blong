# blong-ttk

Testing Toolkit for Mojaloop and other services using Blong framework patterns.

## Overview

`blong-ttk` provides an execution engine for running TypeScript test collections with:

- **Code reuse**: Test steps as reusable handlers, not duplicated JSON snippets
- **Parallel execution**: Automatic parallelization via blong-chain
- **Dynamic provisioning**: Test entities use generated values, not static constants
- **Webhook support**: Built-in callback/webhook server for async flows
- **Rich reporting**: Allure 3 integration with trace links and history tracking
- **Migration tools**: Convert ml-testing-toolkit JSON to TypeScript

## Features

### Execution Engine

Run TypeScript test collections using blong-chain's parallel test executor:

```typescript
import {engineCollectionRun} from '@feasibleone/blong-ttk';

await engineCollectionRun({
    collection: './collections/p2p.ts',
    config: {concurrency: 10},
});
```

### Callback/Webhook Support

Handle asynchronous flows (POST → 202 → PUT callback):

```typescript
// Register expected callback
await callbackRegister({
    correlationId: transferId,
    type: 'PUT /transfers/{ID}',
    timeout: 30000,
});

// Wait for callback to arrive
const callback = await callbackWait({correlationId: transferId});
```

### Migration Tooling

Convert ml-testing-toolkit JSON collections to TypeScript:

```typescript
import {migrateCollectionConvert} from '@feasibleone/blong-ttk';

await migrateCollectionConvert({
    source: './collections/hub/p2p.json',
    target: './collections/hub/p2p.ts',
});
```

## Architecture

- `engine/` - Test execution engine realm
- `callback/` - Webhook/callback server realm
- `migrate/` - JSON → TypeScript migration tooling
- `lib/` - Shared utilities (parser, emitter, deduplication)

## Test Collection Format

Test collections are TypeScript files with handler functions:

```typescript
import {handler} from '@feasibleone/blong';

export default handler(({lib: {group}, handler: {
    transferTransferCreate,
    callbackWait,
}}) => ({
    testP2pTransfer: ({name = 'P2P Transfer'}, $meta) =>
        group(name)([
            async function createTransfer(assert, {$meta}) {
                const result = await transferTransferCreate({
                    amount: {amount: '100', currency: 'USD'},
                }, $meta);
                
                const callback = await callbackWait({
                    correlationId: result.transferId,
                    type: 'PUT /transfers/{ID}',
                }, $meta);
                
                assert.equal(callback.body.transferState, 'COMMITTED');
                return result;
            },
        ]),
}));
```

## Integration with ml-testing-toolkit

This toolkit replaces ml-testing-toolkit's JSON-based test collections with TypeScript code, providing:

- **Better code reuse**: Extract shared helpers instead of copy-paste
- **Type safety**: Compile-time validation of test logic
- **Parallel execution**: Tests run in parallel by default
- **Maintainability**: Refactor tests like regular code

Reference test collections for migration:
- https://github.com/mojaloop/testing-toolkit-test-cases/blob/master/collections/hub/golden_path/e2e_tests/p2p.json
- https://github.com/mojaloop/testing-toolkit-test-cases/blob/master/collections/hub/golden_path/e2e_tests/p2p-sub.json
- https://github.com/mojaloop/testing-toolkit-test-cases/tree/master/collections/hub/provisioning/for_golden_path/MojaloopSims_Onboarding
