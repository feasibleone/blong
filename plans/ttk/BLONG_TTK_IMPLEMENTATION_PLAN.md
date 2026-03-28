# blong-ttk Implementation Plan

## Overview

### Problem Statement

The Mojaloop Testing Toolkit (ml-testing-toolkit) provides test collection
execution, webhook simulation, and interactive test running for the Mojaloop
ecosystem. However, it has several shortcomings:

- **No code reuse**: Test collections are JSON files that cannot share code,
  leading to massive duplication of JavaScript snippets and REST API calls
  across and within test collection files
- **Limited parallelism**: No easy way to run tests in parallel, particularly
  the provisioning/onboarding tests that are highly parallelizable
- **Static provisioning**: Test entities rely on constants rather than
  dynamically provisioned values, preventing parallel execution
- **Maintenance burden**: JSON format makes test collections hard to maintain,
  refactor, and review

### Solution

Create `blong-ttk`, a testing toolkit that:

1. Provides an execution engine for running TypeScript test collections against
   Mojaloop (and other) services
2. Migrates existing ml-testing-toolkit JSON test collections to TypeScript code
   aligned with Blong testing patterns
3. Supports webhook-based async flows via Blong's server/adapter capabilities
4. Enables parallel test execution via `blong-chain`
5. Produces detailed test reports with log/trace integration
6. Provides an optional UI for interactive debugging

### Success Criteria

- Migrated TypeScript tests execute successfully against the same services as
  the original JSON test collections
- Test execution time is reduced through parallelization
- Code duplication is significantly reduced through shared helper functions and
  patterns
- Reports provide clear pass/fail status with links to logs and traces
- The toolkit can be used in CI/CD pipelines without a UI

---

## Technical Approach

### Package Structure

```
core/blong-ttk/                     # Main package
├── package.json
├── tsconfig.json
├── server.ts                       # Suite entry point
├── index.ts                        # Test runner entry point
├── index.test.ts                   # TAP-based test entry point
├── README.md
├── engine/                         # Execution engine realm
│   ├── server.ts                   # Realm definition
│   ├── orchestrator/
│   │   ├── engineDispatch.ts       # Engine orchestrator dispatch
│   │   └── engine/
│   │       ├── engineCollectionRun.ts    # Run a test collection
│   │       ├── engineCollectionList.ts   # List available collections
│   │       ├── engineReportGet.ts        # Get execution report
│   │       └── engineReportCreate.ts     # Generate report from results
│   └── adapter/
│       └── report.ts               # Report output adapter (file, HTML, JSON)
├── migrate/                        # Migration tooling realm
│   ├── server.ts
│   ├── orchestrator/
│   │   ├── migrateDispatch.ts
│   │   └── migrate/
│   │       ├── migrateCollectionConvert.ts   # JSON→TS conversion
│   │       ├── migrateCollectionAnalyze.ts   # Analyze JSON for patterns
│   │       └── migrateHelperExtract.ts       # Extract reusable helpers
│   └── lib/
│       ├── parser.ts               # ml-testing-toolkit JSON parser
│       ├── emitter.ts              # TypeScript code emitter
│       └── dedup.ts                # Duplication detection
├── callback/                       # Webhook/callback realm
│   ├── server.ts
│   ├── adapter/
│   │   └── webhook.ts              # Webhook server adapter
│   ├── orchestrator/
│   │   ├── callbackDispatch.ts
│   │   └── callback/
│   │       ├── callbackRegister.ts      # Register expected callback
│   │       ├── callbackWait.ts          # Wait for callback arrival
│   │       └── callbackReceive.ts       # Handle incoming callback
│   └── gateway/
│       └── callbackGateway.ts      # Expose callback endpoints
└── ui/                             # Optional UI realm (secondary)
    ├── server.ts
    ├── browser.ts
    └── ...
```

### Key Technology Choices

1. **blong-chain** for test execution: Leverages automatic dependency detection
   and parallel execution. Test collections become arrays of step functions
   that the executor runs with maximum parallelism.

2. **blong-openapi** for API clients: OpenAPI specs define the Mojaloop APIs.
   The `x-blong-method` properties map operations to semantic triple handler
   names (e.g., `transferTransferCreate`, `quoteQuoteGet`).

3. **Blong adapter pattern** for webhooks: The callback realm implements a
   webhook server using Blong's adapter pattern, handling Mojaloop's
   asynchronous flows (PUT callbacks after POST requests).

4. **Blong handler pattern** for test steps: Each test step is a named function
   following semantic triple naming, enabling code reuse through handler
   imports.

### Core Data Structures

#### Test Collection (migrated TypeScript format)

```typescript
// collections/hub/golden_path/p2p.ts
import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';
import type {IMeta} from '@feasibleone/blong';

export default handler(
    ({lib: {group}, handler: {
        transferTransferCreate,
        quoteQuoteCreate,
        callbackWait,
        provisionPartyCreate,
    }}) => ({
        testP2pTransfer: ({name = 'P2P Transfer E2E'}, $meta: IMeta) =>
            group(name)([
                async function createParties(assert: typeof Assert, {$meta}) {
                    const payer = await provisionPartyCreate({
                        type: 'MSISDN',
                        currency: 'USD',
                    }, $meta);
                    const payee = await provisionPartyCreate({
                        type: 'MSISDN',
                        currency: 'USD',
                    }, $meta);
                    return {payer, payee};
                },

                async function requestQuote(assert: typeof Assert, {createParties, $meta}) {
                    const {payer, payee} = await createParties;
                    const result = await quoteQuoteCreate({
                        payer: payer.partyId,
                        payee: payee.partyId,
                        amount: {amount: '100', currency: 'USD'},
                    }, $meta);
                    // Wait for async callback
                    const callback = await callbackWait({
                        correlationId: result.quoteId,
                        type: 'PUT /quotes/{ID}',
                    }, $meta);
                    assert.equal(callback.status, 200);
                    return {quoteId: result.quoteId, condition: callback.body.condition};
                },

                async function executeTransfer(assert: typeof Assert, {requestQuote, createParties, $meta}) {
                    const {quoteId, condition} = await requestQuote;
                    const {payer, payee} = await createParties;
                    const result = await transferTransferCreate({
                        payer: payer.partyId,
                        payee: payee.partyId,
                        amount: {amount: '100', currency: 'USD'},
                        quoteId,
                        condition,
                    }, $meta);
                    const callback = await callbackWait({
                        correlationId: result.transferId,
                        type: 'PUT /transfers/{ID}',
                    }, $meta);
                    assert.equal(callback.body.transferState, 'COMMITTED');
                    return result;
                },
            ]),
    }),
);
```

#### Report Structure

```typescript
interface ITestReport {
    id: string;
    timestamp: string;
    duration: number;
    environment: string;
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    collections: ICollectionReport[];
}

interface ICollectionReport {
    name: string;
    file: string;
    duration: number;
    status: 'passed' | 'failed';
    steps: IStepReport[];
}

interface IStepReport {
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    assertions: IAssertionReport[];
    error?: {
        message: string;
        stack: string;
    };
    traceId?: string;
    traceUrl?: string;
    logs?: ILogEntry[];
}
```

### Async Flow Handling (Webhooks/Callbacks)

Mojaloop uses an asynchronous pattern where:
1. Client sends POST request (e.g., POST /transfers)
2. Server responds with 202 Accepted
3. Server later sends PUT callback to the client's callback URL

The callback realm handles this by:
1. Starting a webhook server that listens for incoming callbacks
2. Test steps register expected callbacks with correlation IDs
3. The `callbackWait` handler returns a promise that resolves when the
   matching callback arrives
4. Timeouts produce clear error messages with the correlation context

This maps directly to Blong's adapter pattern for servers (like blong-sim-api's
OpenAPI mock server) combined with a promise-based coordination mechanism.

---

## Implementation Plan

### Phase 1: Foundation — Core Execution Engine

Create the `blong-ttk` package with the execution engine that can run
TypeScript test collections using `blong-chain`.

#### 1.1 Package Setup (Small)

- Create `core/blong-ttk/` package structure
- Configure `package.json` with dependencies on `blong-chain`, `blong`,
  `blong-gogo`, `blong-openapi`
- Configure `tsconfig.json`, Rush integration
- Create `server.ts` suite entry point with realm children

#### 1.2 Engine Realm (Medium)

- Create `engine/server.ts` realm definition
- Implement `engineDispatch.ts` orchestrator for engine namespace
- Implement `engineCollectionRun` handler:
  - Accept collection module path or function
  - Create `TestExecutor` instance with configurable concurrency
  - Execute steps and collect results
  - Return structured results compatible with report generation
- Implement `engineCollectionList` handler:
  - Scan configured collection directories
  - Return available collection metadata

#### 1.3 Callback/Webhook Realm (Medium)

- Create `callback/server.ts` realm definition
- Implement webhook adapter using `adapter.http` pattern (similar to
  blong-sim-api's approach)
- Implement `callbackRegister` handler:
  - Accept correlation ID, expected callback type, timeout
  - Create a pending promise tracked by correlation ID
- Implement `callbackWait` handler:
  - Return the promise for a registered callback
  - Timeout with descriptive error including correlation context
- Implement `callbackReceive` handler:
  - Match incoming webhook to registered correlation ID
  - Resolve the pending promise with the callback payload
- Implement gateway to expose callback endpoints with configurable paths
  matching Mojaloop callback patterns

#### 1.4 Report Generation (Medium)

- Implement `engineReportCreate` handler:
  - Accept test execution results from `blong-chain` progress/latency data
  - Generate JSON report following `ITestReport` structure
  - Include trace IDs from `$meta` for log/trace linking
- Implement report adapter for output:
  - JSON file output
  - HTML report generation (simple template-based)
  - Console summary output
- Include trace URL generation using configurable URL pattern
  (matching blong-log's `{traceId}` pattern)

**Dependencies**: None (this is the foundation)

---

### Phase 2: Migration Tooling — JSON to TypeScript Conversion

Create tools to convert ml-testing-toolkit JSON test collections to TypeScript
code aligned with Blong patterns.

#### 2.1 JSON Parser (Medium)

- Implement `parser.ts` library:
  - Parse ml-testing-toolkit JSON test collection format
  - Extract test cases, requests, assertions, and scripts
  - Handle the nested structure (test_cases → requests → assertions)
  - Parse embedded JavaScript in `tests.assertions[].exec` and
    `scripts.preRequest`/`scripts.postRequest`
  - Parse the `apiDefinition` references

#### 2.2 Duplication Analysis (Medium)

- Implement `dedup.ts` library:
  - Analyze parsed test collections for duplicated patterns
  - Detect duplicated request configurations (same URL, method, headers)
  - Detect duplicated assertion blocks
  - Detect duplicated JavaScript snippets
  - Group duplications by similarity score
  - Produce a deduplication report with suggested extractions
- Implement `migrateCollectionAnalyze` handler:
  - Run analysis on one or more JSON collections
  - Report duplication statistics and suggestions

#### 2.3 TypeScript Emitter (Large)

- Implement `emitter.ts` library:
  - Convert parsed test structures to TypeScript AST or template strings
  - Map `operationId` references to semantic triple handler names using
    `x-blong-method` convention
  - Convert inline JavaScript assertions to `assert.*` calls
  - Convert `pm.environment.get/set` patterns to step function
    parameters/returns (leveraging blong-chain's context passing)
  - Convert callback expectations to `callbackWait` calls
  - Replace static constants with dynamic provisioning calls where patterns
    are detected (e.g., `{$environment.SIMPAYER_CURRENCY}` → parameter
    from provisioning step return value)
  - Generate proper `handler()` wrapper with correct imports
  - Apply deduplication by extracting shared patterns into helper functions

#### 2.4 Migrate Orchestrator (Small)

- Implement `migrateCollectionConvert` handler:
  - Orchestrate parser → dedup → emitter pipeline
  - Accept source JSON path(s) and target output directory
  - Generate TypeScript files maintaining collection structure
- Implement `migrateHelperExtract` handler:
  - Extract common helper functions from analyzed collections
  - Generate shared library files for reuse across collections

**Dependencies**: Phase 1 (engine must exist to validate migrated output)

---

### Phase 3: OpenAPI Integration and Mojaloop API Bindings

Wire up the Mojaloop API definitions as Blong OpenAPI clients, enabling
semantic triple method calls.

#### 3.1 OpenAPI Definitions with x-blong-method (Medium)

- Obtain Mojaloop OpenAPI/Swagger definitions (FSPIOP API, Admin API,
  Settlement API, etc.)
- Add `x-blong-method` properties to operations following semantic triple
  convention:
  - `POST /transfers` → `transferTransferCreate`
  - `GET /transfers/{ID}` → `transferTransferGet`
  - `POST /quotes` → `quoteQuoteCreate`
  - `POST /parties/{Type}/{ID}` → `partyPartyGet` (lookup)
  - Admin API operations → `adminParticipantCreate`, `adminEndpointAdd`, etc.
- Create operations YAML files (similar to blong-sim-api's
  `world-time.operations.yaml`)

#### 3.2 API Client Configuration (Medium)

- Configure `blong-openapi` orchestrator for Mojaloop API namespaces
- Create HTTP adapter(s) for Mojaloop services with appropriate
  codec.openapi configuration
- Support multiple target environments via Blong's configuration system:
  - `default`: Base API definitions
  - `dev`: Local development endpoints
  - `integration`: CI/CD environment endpoints
  - `prod`: Production-like environment endpoints

#### 3.3 Provisioning Helpers (Medium)

- Create reusable handler library for test entity provisioning:
  - `provisionParticipantCreate` — Create a test DFSP/participant
  - `provisionPartyCreate` — Create a test party (MSISDN, account, etc.)
  - `provisionEndpointAdd` — Register callback endpoints for test DFSPs
  - `provisionLimitAdd` — Set position limits for test DFSPs
- Each provisioning handler generates unique values (UUIDs, random MSISDNs)
  instead of relying on static constants
- Create cleanup handlers with retention-based cleanup:
  - `cleanupStaleRemove` — Remove test entities older than configurable
    retention period
  - Avoid immediate cleanup to allow post-test debugging

**Dependencies**: Phase 1 (callback realm), Phase 2 (migration informs which
APIs are needed)

---

### Phase 4: Test Collection Migration

Migrate the reference test collections to validate the tooling.

#### 4.1 Provisioning/Onboarding Tests (Medium)

- Migrate `MojaloopSims_Onboarding` collection folder:
  - This is the best candidate for parallelization — each DFSP onboarding
    is independent
  - Convert to parallel steps using `blong-chain` (multiple DFSPs onboard
    simultaneously)
  - Replace static DFSP names/currencies with provisioned values
  - Extract shared onboarding helper (used for each DFSP variant)
  - Target: significant duplication reduction and parallel execution

#### 4.2 Golden Path E2E Tests (Large)

- Migrate `p2p.json`, `p2p-sub.json`, `transfers.json`:
  - Convert sequential API calls to blong-chain step functions
  - Wire callback expectations to `callbackWait`
  - Replace environment variable references with provisioning step outputs
  - Apply snapshot testing where appropriate (response validation with
    many field checks)
  - Extract shared transfer flow helper (quote → transfer → callback)
  - Maintain the same test coverage as original collections

#### 4.3 Validation (Medium)

- Run migrated TypeScript collections against Mojaloop services
- Compare results with original ml-testing-toolkit execution
- Document any behavioral differences
- Create a migration guide for converting additional collections

**Dependencies**: Phase 2 (migration tools), Phase 3 (API bindings)

---

### Phase 5: Reporting and Observability

Enhance reporting with log/trace integration and test plan visibility.

#### 5.1 Enhanced Report (Medium)

- Extend HTML report with:
  - Collapsible test hierarchy matching blong-chain nested groups
  - Click-through to trace view for each test step (using blong-log URL
    pattern)
  - Inline log entries for failed tests
  - Execution timeline visualization (from blong-chain latency metrics)
  - Parallel efficiency metrics
- Generate JUnit XML output for CI/CD integration
- Generate TAP output for Blong framework integration

#### 5.2 Test Plan Visibility (Small)

- Implement collection metadata extraction:
  - Test names, groups, estimated dependencies
  - Expected execution graph (before running)
- Support dry-run mode:
  - Parse and analyze collections without executing
  - Show dependency graph and parallelization plan
  - Estimate execution time based on previous runs

#### 5.3 Test Rerun with Diagnostics (Medium)

- Implement the diagnostic rerun mechanism described in
  `docs/blong/docs/rationale/test-rerun-diagnostics.md`:
  - After failure detection, rerun failing tests with increased log level
  - Collect diagnostic traces during rerun
  - Include diagnostic data in the report
  - Integrate with blong-log for trace correlation

**Dependencies**: Phase 1 (report generation), Phase 4 (collections to report on)

---

### Phase 6: Automated Tests for blong-ttk

Create tests for the toolkit itself using Blong testing patterns.

#### 6.1 Unit Tests (Medium)

- Test JSON parser with sample collection snippets
- Test deduplication analysis logic
- Test TypeScript emitter output correctness
- Test callback registration/wait/receive coordination
- Test report generation with mock execution data

#### 6.2 Integration Tests (Medium)

- Create example suite (separate folder) demonstrating blong-ttk usage:
  - Mock Mojaloop services using `blong-sim-api` pattern
  - Run a small migrated collection against mocks
  - Verify complete flow: execution → callbacks → report
- Use `blong-mock-test` pattern for server-side testing:
  - Mock adapters for Mojaloop API calls
  - Test orchestrator logic in isolation
- Wire `index.ts` and `index.test.ts` entry points per blong-test-api pattern

#### 6.3 Migration Tests (Medium)

- Test that JSON→TypeScript conversion produces valid, executable code:
  - Parse reference JSON collection
  - Generate TypeScript
  - Compile generated TypeScript (type-check)
  - Execute against mock services
  - Compare results with expected outcomes

**Dependencies**: Phase 1-4 (all main functionality)

---

### Phase 7: UI (Secondary Objective)

Create an optional browser-based UI for interactive test execution.

#### 7.1 Browser Platform (Medium)

- Create `ui/browser.ts` with Blong browser platform entry point
- Implement test collection browser:
  - List available collections
  - Show collection structure and dependency graph
  - Select subset of tests to run
- Implement execution view:
  - Real-time progress from blong-chain events
  - Step-by-step results as they complete
  - Inline log viewer using blong-log integration
- Implement report viewer:
  - View past execution reports
  - Compare runs

#### 7.2 Integration with Engine (Small)

- Wire browser platform to engine realm via JSON-RPC
- Support selective test execution (run specific tests/groups)
- Stream execution progress via events

**Dependencies**: Phase 1, Phase 5 (reporting)

---

## Considerations

### Assumptions

- Mojaloop OpenAPI definitions are available and can be extended with
  `x-blong-method` properties
- The ml-testing-toolkit JSON format is stable and well-understood
- Target Mojaloop services support the same API contracts as the existing
  test collections test against
- The blong-chain `TestExecutor` handles the parallelization needs without
  major modifications

### Constraints

- The migrated TypeScript code must execute against the same services as the
  original JSON collections — it is a migration, not a rewrite of test logic
- Webhook/callback handling must be reliable with appropriate timeouts for
  Mojaloop's async patterns
- The toolkit should work without a UI — CI/CD usage is the primary mode

### Risks

- **JSON parsing complexity**: The ml-testing-toolkit JSON format has evolved
  over time and may have edge cases. Mitigate by starting with the reference
  collections and iterating.
- **Dynamic value generation**: Replacing static constants with dynamic values
  may expose ordering dependencies in the original tests. Mitigate by running
  side-by-side comparisons.
- **Callback timing**: Mojaloop async flows have variable timing. Mitigate
  with configurable timeouts and clear timeout error messages.
- **OpenAPI spec accuracy**: The Mojaloop OpenAPI specs may not perfectly
  match actual service behavior. Mitigate by validating against running
  services early.

### Cucumber Future Compatibility

The test structure is designed to be compatible with future Cucumber integration:

- Step functions with semantic names map naturally to Cucumber step definitions
- The handler pattern allows step reuse across different test scenarios
- Groups/collections map to Cucumber features/scenarios
- The provisioning/cleanup pattern maps to Cucumber Background/After hooks

When Cucumber support is added, existing TypeScript test steps can be wrapped
as Cucumber step definitions with minimal code changes.

---

## Not Included (Future Work)

- **Cucumber integration**: Planned but not part of initial implementation.
  See Cucumber compatibility notes above.
- **Visual regression testing**: Screenshot-based testing of UIs
- **Performance/load testing**: Stress testing with high concurrency against
  services
- **Multi-environment orchestration**: Running tests across multiple
  environments simultaneously
- **Test data management**: Advanced test data lifecycle beyond simple
  provisioning/cleanup
- **Real-time collaboration**: Multi-user UI for shared test sessions

---

## Reference: Blong Patterns Used

| Pattern | Usage in blong-ttk |
|---|---|
| `blong-chain` TestExecutor | Test collection execution with parallel steps |
| `blong-openapi` orchestrator | Mojaloop API client generation from OpenAPI specs |
| `handler()` with semantic triples | Test steps and helper functions |
| `adapter.http` | HTTP calls to Mojaloop services |
| `adapter.http` (server mode) | Webhook/callback server for async flows |
| `orchestrator.dispatch` | Engine, migrate, and callback orchestrators |
| `group()` + nested arrays | Test organization and hierarchy |
| Checkpoints `[]` | Phase separation in test collections |
| `blong-sim-api` pattern | Mock servers for blong-ttk's own tests |
| `blong-mock-test` pattern | Server-side unit tests for blong-ttk |
| Snapshot testing | Response validation in migrated collections |
| Report adapter | Test result output in multiple formats |

## Reference: ML-Testing-Toolkit JSON Structure

For context, the ml-testing-toolkit JSON test collection format:

```json
{
    "name": "Test Collection Name",
    "test_cases": [
        {
            "id": 1,
            "name": "Test Case Name",
            "requests": [
                {
                    "id": 1,
                    "description": "POST /transfers",
                    "apiVersion": {
                        "minorVersion": 1,
                        "majorVersion": 1,
                        "type": "fspiop"
                    },
                    "operationPath": "/transfers",
                    "method": "post",
                    "headers": { "...": "..." },
                    "body": { "...": "..." },
                    "tests": {
                        "assertions": [
                            {
                                "id": 1,
                                "description": "Status code is 202",
                                "exec": [
                                    "expect(response.status).to.equal(202)"
                                ]
                            }
                        ]
                    },
                    "scripts": {
                        "preRequest": { "exec": ["..."] },
                        "postRequest": { "exec": ["..."] }
                    }
                }
            ]
        }
    ]
}
```

This maps to TypeScript as:

```typescript
group('Test Collection Name')([
    group('Test Case Name')([
        async function postTransfers(assert, {$meta}) {
            const result = await transferTransferCreate({...}, $meta);
            assert.equal(result.status, 202, 'Status code is 202');
            return result;
        },
    ]),
])
```
