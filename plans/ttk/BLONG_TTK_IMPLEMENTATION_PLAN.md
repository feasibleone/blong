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
- Allure 3 HTML reports are generated after test execution with correct
  hierarchy (parentSuite = realm, suite = collection, subSuite = group)
- Allure Timeline tab shows parallel step execution from blong-chain
- Trace links in Allure reports resolve to correct blong-log trace URLs
- History trend tracking works across runs via `allurerc.yaml` + `history.jsonl`
- `blong-allure` is usable from any blong test suite, not just blong-ttk

---

## Technical Approach

### Package Structure

```text
core/blong-allure/                  # New core package — Allure 3 integration
├── package.json
├── tsconfig.json
├── writer/
│   ├── allureResultWrite.ts        # Write {uuid}-result.json
│   ├── allureStepMap.ts            # IStepProgress → Allure steps[]
│   ├── allureStatusMap.ts          # Status enum translation
│   ├── allureLabelsBuild.ts        # Suite/realm/framework labels
│   ├── allureLinksBuild.ts         # Trace links from $meta.traceId
│   └── allureAttachmentAdd.ts      # Write attachment files
├── lifecycle/
│   ├── allureSessionStart.ts       # Init results dir, write env+executor files
│   └── allureSessionEnd.ts         # Flush, optionally invoke allure generate
└── config/
    └── allurerc.ts                 # allurerc.yaml writer with historyPath config

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
│   │       └── engineAllureWrite.ts      # Initiate Allure result writing
│   └── adapter/
│       └── summary.ts              # Console summary output (pass/fail/duration)
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
│   ├── orchestrator/
│   │   ├── callbackDispatch.ts
│   │   └── callback/
│   │       ├── callbackRegister.ts      # Register expected callback
│   │       ├── callbackWait.ts          # Wait for callback arrival
│   │       ├── callbackReceive.ts       # Handle incoming callback
│   │       └── ruleDispatch.ts          # Decide callback action via @infitx/decision
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

5. **blong-allure** for reporting: A new core framework package bridging
   blong-chain's `TestExecutor` event system to Allure 3's file-based result
   format. Each test step produces a `{uuid}-result.json` file; the `allure
   generate` CLI turns those files into an interactive HTML report. This is a
   framework-level capability available to all blong test suites, not just
   blong-ttk.

6. **`@infitx/decision`** for callback dispatch rules: The ml-testing-toolkit
   uses a `json-rules-engine`-based rules engine to control simulator behaviour
   (which callback to send, error callbacks, no-callback cases). blong-ttk does
   **not** carry forward this dependency. Instead, rule files are migrated to
   `@infitx/decision` YAML and evaluated via the `ruleDispatch` handler in the
   callback realm. The `@infitx/match`-powered `when` conditions replace
   `json-rules-engine` conditions; the `then` decision keys map to callback
   action types (`FIXED_CALLBACK`, `MOCK_CALLBACK`, `FIXED_ERROR_CALLBACK`,
   `NO_CALLBACK`, etc.).

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

#### Report Structure (Allure 3 result file format)

Test results are written as Allure 3 result files (`{uuid}-result.json`) to
`allure-results/`. This is the stable public contract — no internal
`allure-js-commons` dependency required. Each file represents one test step
(top-level step = one test result file; nested steps are embedded in
`steps[]`).

```json
{
  "uuid": "9d95e6e7-9cf6-4ca5-91b4-9b69ce0971f8",
  "historyId": "2b35e31882061875031701ba05a3cd67",
  "fullName": "hub/golden_path/p2p.testP2pTransfer.executeTransfer",
  "name": "executeTransfer",
  "labels": [
    {"name": "parentSuite", "value": "ttk"},
    {"name": "suite",       "value": "hub/golden_path/p2p"},
    {"name": "subSuite",    "value": "P2P Transfer E2E"},
    {"name": "framework",   "value": "blong"},
    {"name": "language",    "value": "typescript"}
  ],
  "links": [
    {"type": "trace", "name": "Trace", "url": "http://log.example/trace/abc123"}
  ],
  "status": "passed",
  "start": 1682358426014,
  "stop":  1682358426892,
  "steps": [
    {"name": "POST /transfers", "status": "passed",
     "start": 1682358426020, "stop": 1682358426400},
    {"name": "callbackWait PUT /transfers/{ID}", "status": "passed",
     "start": 1682358426401, "stop": 1682358426880}
  ]
}
```

**Mapping from blong-chain to Allure fields:**

| blong-chain (`IStepProgress` / `IStepLatency`) | Allure result field |
| --- | --- |
| step name | `name`, `fullName` (collection + step path) |
| `IStepLatency.startedAt` | `start` (Unix ms) |
| `IStepLatency.completedAt` | `stop` (Unix ms) |
| step status (`success`/`error`/`skipped`) | `status` (`passed`/`failed`/`skipped`) |
| `IStepError.message` | `statusDetails.message` |
| `IStepError.stack` | `statusDetails.trace` |
| `$meta.traceId` | `links[].url` (trace link to blong-log) |
| realm namespace | `labels[parentSuite]` |
| collection name | `labels[suite]` |
| group name (`IGroupProgress`) | `labels[subSuite]` |
| nested `IStepProgress.steps` | `steps[]` (recursive) |

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

### Phase 0: `blong-allure` — Core Allure 3 Integration

Create the `core/blong-allure` package as a standalone core framework capability.
This package is independent of blong-ttk and can be used by any blong test suite.

#### 0.1 Package Setup (Small)

- Create `core/blong-allure/` with `package.json`, `tsconfig.json`, Rush entry
- Dependencies: `blong`, `blong-chain` (peer); `allure` v3.x as devDependency
  for CLI invocation; `node:fs`, `node:crypto` from Node built-ins
- No dependency on `allure-jest` or `allure-js-commons` — result files are
  written directly in the Allure 3 JSON format (stable public contract)

#### 0.2 Allure Result Writer (Medium)

- Implement `allureResultWrite` — accepts an `IStepProgress` (from blong-chain)
  and writes `{uuid}-result.json` to a configured output directory
  (default `allure-results/`)
- Implement `allureStepMap` — recursively maps `IStepProgress.steps` → Allure
  `steps[]` (nested steps are natively supported in the Allure format)
- Implement `allureStatusMap` — translates blong-chain step status to Allure
  status values: `success`→`passed`, `error`→`failed`, `waiting`→`scheduled`,
  `skipped`→`skipped`
- Implement `allureLabelsBuild` — constructs `labels[]` from execution context:
  - `parentSuite` → realm name (from `$meta` namespace)
  - `suite` → collection name
  - `subSuite` → group name (from `IGroupProgress`)
  - `framework` → `"blong"`, `language` → `"typescript"`
- Implement `allureLinksBuild` — constructs `links[]` with `type: "trace"` using
  the blong-log URL pattern (`{traceId}` from `$meta.traceId`); also supports
  optional issue/story links
- Implement `allureAttachmentAdd` — writes an attachment file as
  `{uuid}-attachment.{ext}` and returns the descriptor for embedding in a result;
  supports `application/json` (request/response bodies), `text/plain` (log
  excerpts), `text/html`
- `historyId` computed as a deterministic hash of `fullName`
  (collection path + step name)

#### 0.3 Lifecycle Hooks (Medium)

- Implement `allureSessionStart` — initialises a writer session:
  - Creates/clears `allure-results/` directory
  - Writes `environment.properties` (env name, blong version, Node version,
    test run ID)
  - Writes `executor.json` (CI build name, URL, report name, build order;
    sourced from standard CI env vars: `GITHUB_RUN_ID`, `GITHUB_SERVER_URL`,
    `CI_BUILD_URL`)
- Implement `allureSessionEnd` — flushes any pending result files and logs
  the results directory path; optionally invokes `allure generate` as a
  subprocess (controlled by `allure.generateOnEnd` config key)
- Subscribe to `TestExecutor` events via `ITestEvents`:
  - `step:end` → immediately write result file for that step (streaming,
    failure-tolerant — a crashed run still produces partial results)
  - `step:error` → populate `statusDetails` with `IStepError` before writing
  - `test:end` → trigger `allureSessionEnd`

#### 0.4 `allurerc.yaml` Configuration Support (Small)

- Generate `allurerc.yaml` in the results directory:
  - `historyPath: .allure/history.jsonl` (gitignored, persisted across runs)
  - `historyLimit: 30` (trend tracking for last 30 runs)
  - Report name sourced from suite/collection config
- Expose blong config keys: `allure.outputDir`, `allure.historyPath`,
  `allure.generateOnEnd`

**Dependencies**: None (standalone core package)

---

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
- Implement `ruleDispatch` handler:
  - Load `@infitx/decision` engine configured with YAML rule files
    (migrated from ml-testing-toolkit JSON rule files — see Phase 2.5)
  - Accept an incoming request context (`{path, method, body, pathParams,
    queryParams}`) and call `decide()` to determine the callback action
  - Supported decision types (mapped from ml-testing-toolkit event types):
    - `fixedCallback` — send the exact callback body defined in the rule
    - `mockCallback` — generate a mock callback from the OpenAPI spec
    - `fixedErrorCallback` — send a fixed error callback
    - `mockErrorCallback` — generate a mock error callback from the spec
    - `noCallback` — suppress the callback entirely
    - `fixedResponse` / `mockResponse` — for synchronous response rules
  - Configurable parameters (`$request.body.*`, `$request.params.*`, etc.)
    are resolved from the incoming request context before the decision fires
- Implement gateway to expose callback endpoints with configurable paths
  matching Mojaloop callback patterns

#### 1.4 Report Generation (Medium)

Report generation delegates to `blong-allure` (Phase 0) for HTML output.

- Implement `engineAllureWrite` handler (replaces `engineReportCreate`):
  - Calls `allureSessionStart` at the start of a collection run
  - Subscribes to `TestExecutor` events via the blong-allure lifecycle hooks
  - On completion, calls `allureSessionEnd` (which optionally invokes
    `allure generate`; in CI, generation is typically handled by the
    Allure GitHub Action separately)
- The `report.ts` adapter is replaced by `summary.ts`:
  - Console summary output only (pass/fail counts, duration, result dir path)
  - Machine-readable artifact is the `allure-results/` directory itself
- Attach raw request/response bodies from Mojaloop API calls using
  `allureAttachmentAdd` (added as `application/json` attachments on the step)
- Categories file (`categories.json`) written to `allure-results/` classifying
  common Mojaloop failure patterns (timeout, 404, validation error)

**Dependencies**: Phase 0 (`blong-allure`)

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
  - Detect and separately parse any co-located rule files (validation rules,
    callback rules, synchronous response rules)

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

#### 2.5 Rules Engine Migration (Medium)

ml-testing-toolkit rule files use `json-rules-engine` JSON format to control
validation and callback behaviour. blong-ttk replaces this with `@infitx/decision`
YAML. There is no runtime dependency on `json-rules-engine`.

- Implement `migrateRuleConvert` handler:
  - Accept one or more ml-testing-toolkit rule JSON files
  - Convert each rule to an `@infitx/decision` YAML rule entry:
    - `conditions.all[]/any[]` → `when` pattern object (using `@infitx/match`
      semantics; `all` maps to top-level object, `any` maps to an array)
    - `event.type` → `then` decision key (mapped per table below)
    - `event.params` → `then` decision value
    - `priority` → `priority` (higher numeric priority in json-rules-engine
      = higher priority; `@infitx/decision` uses the same convention)
  - Write the resulting YAML file to the target rule directory
- Implement `migrateRuleAnalyze` handler:
  - Summarise how many rules and which event types are present across
    collected rule files
  - Flag any `$function.*` advanced parameters (require manual review)

**Operator mapping** (`json-rules-engine` → `@infitx/match`):

| json-rules-engine operator | `@infitx/match` equivalent |
| --- | --- |
| `equal` / `notEqual` | exact value / negated match |
| `lessThan` / `lessThanInclusive` | `{max: n-1}` / `{max: n}` |
| `greaterThan` / `greaterThanInclusive` | `{min: n+1}` / `{min: n}` |
| `numericEqual` etc. | same as above with `coerceTypes: true` |
| `in` / `notIn` | array value with `includes` strategy |
| `contains` / `doesNotContain` | `superset` / negated `superset` |

**Event type mapping** (`json-rules-engine` → `@infitx/decision` then key):

| ml-testing-toolkit event type | `then` decision key in YAML |
| --- | --- |
| `FIXED_CALLBACK` | `fixedCallback` |
| `MOCK_CALLBACK` | `mockCallback` |
| `FIXED_ERROR_CALLBACK` | `fixedErrorCallback` |
| `MOCK_ERROR_CALLBACK` | `mockErrorCallback` |
| `NO_CALLBACK` | `noCallback` |
| `FIXED_RESPONSE` | `fixedResponse` |
| `MOCK_RESPONSE` | `mockResponse` |

**Example conversion:**

```json
// ml-testing-toolkit rule (json-rules-engine)
{
  "ruleId": 1,
  "priority": 2,
  "description": "Fixed error if transfer amount is 2 USD",
  "conditions": {
    "all": [
      {"fact": "path",   "operator": "equal", "value": "/transfers"},
      {"fact": "method", "operator": "equal", "value": "post"},
      {"fact": "body",   "operator": "equal", "value": "2",
       "path": "amount.amount"}
    ]
  },
  "event": {
    "type": "FIXED_ERROR_CALLBACK",
    "params": {
      "path": "/transfers/{$request.body.transferId}/error",
      "method": "put",
      "body": {"errorInformation": {"errorCode": "5001",
                                    "errorDescription": "Amount too small"}}
    }
  }
}
```

```yaml
# @infitx/decision YAML (migrated)
rules:
  - rule: rule-1
    priority: 2
    when:
      path: /transfers
      method: post
      body:
        amount:
          amount: "2"
    then:
      fixedErrorCallback:
        path: /transfers/{$request.body.transferId}/error
        method: put
        body:
          errorInformation:
            errorCode: "5001"
            errorDescription: Amount too small
```

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

Allure 3 natively provides the features previously planned as custom HTML.
This phase configures those native features rather than building a custom
report renderer:

| Previously planned custom feature | Allure 3 native equivalent |
| --- | --- |
| Collapsible test hierarchy | Nested `steps[]` in result files → Allure step tree view |
| Click-through to trace view | `links[]` with `type: "trace"` and blong-log URL |
| Execution timeline visualization | Allure Timeline tab (uses `start`/`stop` per step) |
| Parallel efficiency metrics | Allure Duration charts |
| Flaky test detection | `statusDetails.flaky: true` set from blong-chain retry detection |
| History / trend tracking | `historyPath` in `allurerc.yaml` + `history.jsonl` |

- Configure `allurerc.yaml`: history path, suite labels, trace link URL pattern
  pointing at the blong-log instance
- Define `categories.json` in `allure-results/` to classify Mojaloop failure
  patterns (timeout, HTTP 404, validation error, callback not received)
- Verify that Allure's Timeline tab correctly visualises parallel blong-chain
  step execution (steps running in parallel will show overlapping time ranges)
- Generate JUnit XML output for CI/CD integration (separate concern, kept)
- Generate TAP output for native blong integration (separate concern, kept)

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
  - Link to or embed the Allure HTML report for the current run
  - Compare runs using Allure's built-in history trend view

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
| --- | --- |
| `blong-chain` TestExecutor | Test collection execution with parallel steps |
| `blong-allure` lifecycle hooks | Allure 3 result file writing from TestExecutor events |
| `blong-openapi` orchestrator | Mojaloop API client generation from OpenAPI specs |
| `@infitx/decision` + YAML rules | Callback dispatch rules (replaces `json-rules-engine`) |
| `handler()` with semantic triples | Test steps and helper functions |
| `adapter.http` | HTTP calls to Mojaloop services |
| `adapter.http` (server mode) | Webhook/callback server for async flows |
| `orchestrator.dispatch` | Engine, migrate, and callback orchestrators |
| `group()` + nested arrays | Test organization and hierarchy |
| Checkpoints `[]` | Phase separation in test collections |
| `blong-sim-api` pattern | Mock servers for blong-ttk's own tests |
| Allure 3 `{uuid}-result.json` | Per-step test result files in `allure-results/` |
| `allure generate` CLI | HTML report generation from result files |
| `blong-mock-test` pattern | Server-side unit tests for blong-ttk |
| Snapshot testing | Response validation in migrated collections |

## Reference: ML-Testing-Toolkit Rules Engine Migration

The ml-testing-toolkit embeds a `json-rules-engine`-based rules engine used at
the simulator level to control callback behaviour. blong-ttk replaces this entirely
with `@infitx/decision` YAML rules — see Phase 2.5 for the full conversion mapping,
operator table, event-type mapping, and worked example.

**Rule types and their blong-ttk replacement:**

| TTK level | json-rules-engine rule file | Replaced by |
| --- | --- | --- |
| Validation Rules Engine | `validation_rules/*.json` | `@infitx/decision` YAML, `fixedErrorCallback` / `mockErrorCallback` decisions |
| Callbacks Rules Engine | `callback_rules/*.json` | `@infitx/decision` YAML, `fixedCallback` / `mockCallback` / `noCallback` decisions |
| Synchronous Response Rules Engine | `response_rules/*.json` | `@infitx/decision` YAML, `fixedResponse` / `mockResponse` decisions |

---

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
