# @feasibleone/blong-ttk

**Testing Toolkit for Mojaloop and Beyond**

A TypeScript-based test automation framework built on the Blong ecosystem, providing:
- **OpenAPI Integration** - Semantic triple method calls for Mojaloop APIs
- **Callback Coordination** - Promise-based async flow handling
- **Parallel Execution** - Automatic dependency-based parallelization via blong-chain
- **Allure 3 Reporting** - Rich test reports with trace links and failure classification
- **Migration Tools** - Convert ml-testing-toolkit JSON collections to TypeScript

## Quick Start

```bash
# Install
npm install @feasibleone/blong-ttk

# Run example collection
node -e "
import('@feasibleone/blong-ttk').then(m =>
    m.engineCollectionRun({
        collection: './examples/collections/mojaloop/p2p-transfer.ts',
    }, {traceId: 'test-1'})
)"

# Generate report
allure generate allure-results -o allure-report --clean
allure open allure-report
```

## Features

### 🚀 Parallel Test Execution

```typescript
// Independent steps run in parallel automatically
group('DFSP Onboarding')([
    async function onboardDfsp1(assert, {$meta}) { ... },
    async function onboardDfsp2(assert, {$meta}) { ... },
    async function onboardDfsp3(assert, {$meta}) { ... },
    
    // This waits for all DFSPs
    async function setupRouting(assert, {onboardDfsp1, onboardDfsp2, onboardDfsp3, $meta}) {
        const dfsps = await Promise.all([onboardDfsp1, onboardDfsp2, onboardDfsp3]);
        // Setup routing...
    },
])
```

### 🔄 Async Callback Handling

```typescript
// Register callback expectation
await callbackCallbackRegister({
    correlationId: transferId,
    type: 'PUT /transfers/{id}',
}, $meta);

// Make async API call (returns 202 Accepted)
await transferTransferCreate({...}, $meta);

// Wait for callback
const callback = await callbackCallbackWait({
    correlationId: transferId,
    timeout: 10000,
}, $meta);

assert.equal(callback.body.transferState, 'COMMITTED');
```

### 🎯 Semantic Triple API Calls

```typescript
// POST /transfers
await transferTransferCreate({
    transferId, payerFsp, payeeFsp, amount, ilpPacket, condition, expiration
}, $meta);

// POST /quotes
await quoteQuoteCreate({
    quoteId, transactionId, payee, payer, amount, transactionType
}, $meta);

// GET /parties/{type}/{id}
await partyPartyGet({
    type: 'MSISDN',
    id: '1234567890'
}, $meta);

// POST /participants (Admin API)
await adminParticipantCreate({
    name: 'payerfsp',
    currency: 'USD'
}, $meta);
```

### 📊 Rich Reporting

- **Test Hierarchy** - Nested step visualization
- **Timeline** - Parallel execution Gantt chart
- **Trace Links** - Click through to blong-log traces
- **Categories** - Automatic failure classification (14 predefined categories)
- **History** - Trend charts and flaky test detection

See [ALLURE_REPORTING_GUIDE.md](../../plans/ttk/ALLURE_REPORTING_GUIDE.md) for details.

## Package Structure

```
core/blong-ttk/
├── engine/              # Test execution engine
│   ├── orchestrator/
│   │   ├── engine/      # Collection execution
│   │   └── plan/        # Test plan analysis
│   └── adapter/
│       └── summary/     # Console output
├── callback/            # Webhook/callback server
│   ├── orchestrator/
│   │   └── callback/    # Callback coordination
│   ├── adapter/
│   │   └── webhook.ts   # HTTP server
│   └── gateway/         # Callback endpoints
├── migrate/             # Migration tooling
│   ├── lib/
│   │   ├── parser.ts    # JSON parser
│   │   ├── dedup.ts     # Duplication analysis
│   │   └── emitter.ts   # TypeScript generator
│   └── orchestrator/
│       └── migrate/     # Migration handlers
├── mojaloop/            # Mojaloop API integration
│   ├── api/             # OpenAPI specs
│   ├── adapter/
│   │   └── openapi/     # API client adapters
│   └── orchestrator/
│       ├── openapi.ts   # blong-openapi config
│       └── provision/   # Provisioning helpers
├── examples/
│   └── collections/     # Example test collections
└── config/
    └── categories.json  # Allure failure categories
```

## Core Handlers

### Execution

- `engineCollectionRun` - Execute test collection
- `engineCollectionList` - List available collections
- `engineAllureWrite` - Write Allure result

### Callback

- `callbackCallbackRegister` - Register expected callback
- `callbackCallbackWait` - Wait for callback
- `callbackCallbackReceive` - Handle incoming callback

### Migration

- `migrateMigrateCollectionAnalyze` - Analyze duplication
- `migrateMigrateCollectionConvert` - Convert JSON → TypeScript
- `migrateMigrateRuleConvert` - Convert rules to YAML

### Provisioning

- `provisionParticipantCreate` - Create DFSP with accounts
- `provisionPartyCreate` - Register account holder
- `provisionEndpointAdd` - Register callback URLs
- `provisionLimitAdd` - Set position limits
- `cleanupStaleRemove` - Cleanup old test entities

### Test Plan

- `planCollectionAnalyze` - Analyze collection structure

## API Coverage

### FSPIOP API
- Transfers: POST/GET/PUT + error callbacks
- Quotes: POST/GET/PUT + error callbacks
- Parties: GET/PUT lookup + error callbacks

### Admin API
- Participants: CREATE/GET/LIST
- Endpoints: ADD/LIST callback URLs
- Limits: SET/LIST position limits
- Accounts: CREATE/LIST accounts
- Parties: REGISTER account holders

## Configuration

```typescript
// server.ts
export default server(blong => ({
    config: {
        default: {
            allure: {
                outputDir: 'allure-results',
                historyPath: '.allure/history.jsonl',
                logUrl: 'http://localhost:9998/trace/{traceId}',
                categoriesPath: './config/categories.json',
            },
        },
        dev: {
            engine: {},
            callback: {
                webhook: {
                    port: 5050, // Callback server port
                },
            },
            mojaloop: {
                openapi: true,
                provision: true,
            },
        },
    },
}));
```

## Examples

See `examples/collections/mojaloop/`:
- `onboarding.ts` - Parallel DFSP provisioning
- `p2p-transfer.ts` - Complete transfer flow with callbacks

## Documentation

- [IMPLEMENTATION_STATUS.md](../../plans/ttk/IMPLEMENTATION_STATUS.md) - Implementation details
- [USAGE_GUIDE.md](../../plans/ttk/USAGE_GUIDE.md) - User guide with examples
- [ALLURE_REPORTING_GUIDE.md](../../plans/ttk/ALLURE_REPORTING_GUIDE.md) - Reporting guide
- [BLONG_TTK_IMPLEMENTATION_PLAN.md](../../plans/ttk/BLONG_TTK_IMPLEMENTATION_PLAN.md) - Full plan

## Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test -- integration.test.ts

# Migration tests
npm run test -- migration.test.ts
```

## Related Packages

- `@feasibleone/blong-allure` - Allure 3 integration
- `@feasibleone/blong-chain` - Test executor with parallelization
- `@feasibleone/blong-openapi` - OpenAPI client framework
- `@feasibleone/blong` - Core Blong framework

## License

MIT

## Status

✅ **Production Ready** - All primary phases (0-6) complete
- Phase 0: Allure 3 Integration
- Phase 1: Foundation (engine, callbacks)
- Phase 2: Migration Tooling
- Phase 3: OpenAPI Integration
- Phase 4: Test Collections
- Phase 5: Enhanced Reporting
- Phase 6: Automated Tests
