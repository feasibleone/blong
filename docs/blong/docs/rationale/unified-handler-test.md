# Unified Handler-Test Concept

## Problem

Handlers and tests are traditionally separate concepts with different APIs, different execution
models, and different tooling. Yet in practice, they share deep structural similarities:

- **Tests look like higher-order handlers.** A test orchestrates a sequence of lower-level handler
  calls, validates intermediate results, and returns a summary. This is exactly what an orchestrator
  handler does.
- **Handlers can benefit from assertions.** In development and staging, having inline assertions
  that verify preconditions, postconditions, and invariants would catch bugs earlier. In production,
  these assertions should be zero-cost.
- **Tests are "handlers that didn't graduate."** Many test handlers implement valuable multi-step
  workflows that could become API handlers if the assertions were removed and the workflow was
  generalized.
- **Both need progress tracking.** Long-running multi-step handlers and test chains both benefit
  from tracing their progress through discrete checkpoints, for debugging, observability, and
  failure localization.

The traditional separation creates friction:

- **Duplicated patterns:** Orchestrator handlers and test handlers use slightly different APIs to do
  structurally similar work.
- **Lost knowledge:** When a developer writes a test workflow, the understanding of how to
  orchestrate those steps stays locked in the test layer and never migrates to production code.
- **Assertion gap:** Production handlers have no built-in mechanism for verifiable invariants, while
  tests have no mechanism to contribute production-ready orchestration logic.

## Solution

Unify the handler and test concepts along a **continuum** rather than a **boundary**. The key ideas:

1. **Checkpoint function** — A framework-provided function available in both handlers and tests that
   records progress through multi-step operations. In tests, checkpoints drive assertions and test
   reporting. In production, they feed observability (structured logging, tracing, metrics).

2. **Optional assertions via `?.`** — JavaScript's optional chaining operator enables zero-overhead
   assertions in production. When the `assert` parameter is `undefined` (production mode),
   `assert?.equal(...)` is a no-op. When present (test/debug mode), assertions execute normally.

3. **Handler-test graduation** — Tests can be promoted to production handlers by adjusting
   configuration. The same code that validated a workflow in testing becomes the production
   orchestration, with assertions silenced.

4. **Shared step execution model** — Both handlers and tests use the same step execution model from
   `blong-chain`: named functions, thenable proxies for automatic dependency detection, and parallel
   execution.

5. **Unified naming context** — The execution context name (used for test report nesting, structured
   logging, and tracing) is injected into `$meta` by the framework, not passed as a handler
   parameter. This prevents `name` from conflicting with API parameters. Two mechanisms are
   implemented:
    - **Proxy sub-property destructuring** — `{handler: {testPaymentFlow: {billPayment}}}` returns
      the same handler but with `$meta.name = 'bill payment'` pre-injected (camelCase converted to
      sentence form).
    - **Annotation syntax** — `@annotationName params... handlerName` keys on the proxy. Annotations
      operate in two modes: **`$meta` injection** (plain-word params, e.g. `@name bill payment`)
      sets `$meta.annotationName` directly; **config-object mode** (`key=value` params or no params,
      e.g. `@cache ttl=10`) merges `config.handler[annotationName]` into the call options with
      optional property overrides. Multiple annotations can be chained on one key.

## Design

### Progress Points: One Channel, Two Shapes

A checkpoint and a decision look like two features and are one. Both are **progress points** —
moments in the logic that explain the shape a run took — recorded in one place and drawn one way
([R11, R26, R27](semantic-log.md)). They differ in exactly one respect, and it is a property of the
concept rather than an accident of the API: **a point may be dropped, a branch may not.** A missing
checkpoint costs a note; a missing branch would skip the work. So `checkpoint` is optional-chained
and `decide` never is, while everything else about the two is shared.

#### A checkpoint is a point

A point is announced with `$meta.checkpoint?.(name, data)`, or with `lib.checkpoint?.(…)` from code
that has no `$meta` — a library function, far from the record the point will land on. The recorder
is implemented in `core/blong-gogo/src/checkpoint.ts`:

```typescript
const checkpoint: CheckpointFn = function (this: IMeta, name, data) {
    (this.checkpoints ??= []).push({name, data, timestamp: Date.now()});
    vocabulary.point(name, data); // and the same moment is announced to the log
};

/** `decide` in every mode — it selects. `checkpoint` only where points are recorded. */
export function createAttachCheckpoint(mode: 'test' | 'debug' | 'production') {
    const recording = mode !== 'production';
    return (meta: IMeta): void => {
        meta.decide ??= decide;
        if (recording) meta.checkpoint ??= checkpoint;
        // production: `checkpoint` is never set → `?.` is a zero-cost no-op
    };
}
```

**Real handler using checkpoints**
(`demo/handler-test-poc/order/orchestrator/order/orderOrderCreate.ts`):

```typescript
export default handler(
    ({lib: {assert, calculateTotal}}) =>
        async function orderOrderCreate({items, customerId}, $meta) {
            const total = calculateTotal(items) as number;
            assert?.ok(total > 0, 'Order total must be positive');
            $meta.checkpoint?.('total-calculated', {total, itemCount: items.length});

            const discount = total > 100 ? 0.1 : 0;
            const discountedTotal = total * (1 - discount);
            assert?.ok(discountedTotal <= total, 'Discounted total must not exceed original');
            $meta.checkpoint?.('discount-applied', {discount, discountedTotal});

            const orderId = `ORD-${customerId}-${Date.now()}`;
            $meta.checkpoint?.('order-created', {orderId, status: 'PENDING'});
            return {orderId, total, discountedTotal, status: 'PENDING'};
        },
);
```

**Test reading those checkpoints** (`demo/handler-test-poc/order/test/test/testOrderCheckpoint.ts`):

```typescript
$meta.checkpoints = [];
const result = await orderOrderCreate({items: [...], customerId: 'customer-1'}, $meta);

assert.equal(result.total, 200);
const checkpoints = $meta.checkpoints!;
assert.equal(checkpoints.length, 3);
assert.equal(checkpoints[0].name, 'total-calculated');
assert.equal((checkpoints[0].data as any).total, 200);
```

#### What both handles share

| `checkpointMode` | `checkpoint` | recorded | emitted | drawn as | `assert`      |
| ---------------- | ------------ | -------- | ------- | -------- | ------------- |
| `production`     | `undefined`  | no       | no      | —        | `undefined`   |
| `debug`          | recorder     | yes      | yes     | a note   | `node:assert` |
| `test`           | recorder     | yes      | yes     | a note   | `node:assert` |

- **Recorded** means the point lands on the invocation's captured list (`$meta.checkpoints`), which
  is what a test asserts on.
- **Emitted** means it reaches the semantic log as a point, so the record carries it and the
  sequence diagram draws it as a note over the participant that reported it. Its **name** travels;
  its `data` stays in the local record and cache, where the inspector can show it and a caller's
  `redact` patterns can withhold it — the same rule a decision's evaluated values follow.
- **Not built yet:** the `invariant` and `canary` guards, `lib.chain`, and the rendering of points
  as test-report steps. They are named because the design anticipates them, not because they run.

#### A decision is a region

A branch is a progress point too, and it uses the same channel — but it _selects_, so it is a
function rather than a notification, and it is never optional-chained:

```typescript
export default handler(
    ({lib: {decide}}) =>
        async function paymentRateQuote({rate, rateLimit}, $meta) {
            const accepted = decide('rate-within-limit', {rate, rateLimit}, [
                {name: 'decline', when: v => v.rate > v.rateLimit, run: () => false},
                {name: 'accept', when: () => true, run: () => true},
            ]);
            logger.warn('rate declined', {rate, rateLimit}); // the rationale lands on this record
            return accepted ? publishRate(rate) : decline('rate above provider limit');
        },
);
```

Taking the branch _is_ announcing it, so the recorded rationale cannot disagree with the branch the
code took — which is what [R11](semantic-log.md) asks for when it says "deterministically, not as
prose". The chosen branch is a **region**: the records emitted inside it carry its position, so the
diagram draws an `alt`/`else`/`end` block spanning the calls the branch made, with every candidate
drawn and the unchosen ones empty. A region with no alternatives — a phase — stays a band.

### Optional Assertions

Handlers destructure `assert` from `lib`, following the same pattern as `checkpoint`: `undefined` in
production, active in test/debug. Both are captured at handler definition time and used with
optional chaining for zero-overhead in production:

```typescript
export default handler(
    ({lib: {assert}}) =>
        async function orderOrderProcess({orderId, items}, $meta) {
            const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            assert?.ok(total > 0, 'Order total must be positive');
            $meta.checkpoint?.('total-calculated', {total});

            const discount = await applyDiscount(total, $meta);
            assert?.ok(discount <= total, 'Discount cannot exceed total');
            $meta.checkpoint?.('discount-applied', {discount, final: total - discount});

            return {total: total - discount};
        },
);
```

The `assert` value is controlled by `checkpointMode` configuration:

- **In production (`checkpointMode: 'production'`):** `assert` is `undefined`. All `assert?.` calls
  are no-ops with zero overhead.
- **In test/debug mode (`checkpointMode: 'test'` or `'debug'`):** `assert` is `node:assert`.
  Assertions execute and failures are reported normally.

### Handler-Test Graduation

**Flow execution handler composing two sub-handlers**
(`demo/handler-test-poc/order/orchestrator/order/orderFlowExecute.ts`):

```typescript
export default handler(
    ({lib: {assert}, handler: {orderOrderCreate, orderOrderConfirm}}) =>
        async function orderFlowExecute({items, customerId, paymentMethod}, $meta) {
            const order = await orderOrderCreate({items, customerId}, $meta);
            assert?.ok(order.orderId);
            $meta.checkpoint?.('order-phase-complete', {orderId: order.orderId});

            const confirmed = await orderOrderConfirm(
                {orderId: order.orderId, paymentMethod},
                $meta,
            );
            assert?.equal(confirmed.status, 'CONFIRMED');
            $meta.checkpoint?.('confirm-phase-complete', {status: confirmed.status});
            return {...order, ...confirmed};
        },
);
```

A test handler that proves a workflow works correctly:

```typescript
// server/test/test/testPaymentFlow.ts — starts as a test
export default handler(({handler: {accountCreate, paymentTransferExecute}}) => ({
    testPaymentFlow: ({currency = 'USD', balance = 1000, amount = 100}, $meta) => [
        // $meta.name is injected by the framework proxy (e.g., 'bill payment', 'loan payment')
        async function createAccount(assert, {$meta}) {
            const account = await accountCreate({currency, balance}, $meta);
            assert.ok(account.id, 'Account created');
            return account;
        },
        async function executeTransfer(assert, {createAccount, $meta}) {
            const account = await createAccount;
            const result = await paymentTransferExecute({accountId: account.id, amount}, $meta);
            assert.equal(result.state, 'COMPLETED', 'Transfer completed');
            return result;
        },
    ],
}));
```

The handler signature is clean — no `name` parameter conflicts with API params. The execution
context name is injected into `$meta` by the framework (see "Unified Naming and Context" below). The
test handler simply returns an array of steps.

Can graduate to a production handler:

```typescript
// orchestrator/payment/paymentFlowExecute.ts — graduated to production
export default handler(
    ({handler: {accountCreate, paymentTransferExecute}, lib: {assert}}) =>
        async function paymentFlowExecute({currency, balance, amount}, $meta) {
            const account = await accountCreate({currency, balance}, $meta);
            assert?.ok(account.id, 'Account created');
            $meta.checkpoint?.('account-ready', {accountId: account.id});

            const result = await paymentTransferExecute({accountId: account.id, amount}, $meta);
            assert?.equal(result.state, 'COMPLETED', 'Transfer completed');
            $meta.checkpoint?.('transfer-done', {transferId: result.transferId});

            return result;
        },
);
```

The same logic, the same assertions, the same checkpoints — but now accessible as a production API
endpoint.

### blong-chain Step Execution

Both handlers and tests use the same parallel step execution model from `blong-chain`. Thenable
proxies detect dependencies automatically, allowing independent steps to run concurrently:

```typescript
// Real example from core/blong-chain/examples/demo.test.ts
const executor = new TestExecutor({concurrency: 10});

const databaseOperations = [
    async function connectToDatabase() {
        return {connection: 'db-123', status: 'connected'};
    },
    async function createTable(assert, context) {
        const db = await context.connectToDatabase; // thenable proxy — auto-dep
        assert.equal(db.status, 'connected');
        return {table: 'users', created: true};
    },
];
databaseOperations.name = 'Database Setup'; // group name → nested indent in report

const steps = [
    async function initializeSystem() {
        return {systemReady: true};
    },
    databaseOperations, // nested group, steps run in parallel within group
    async function verifySystem(assert, context) {
        const system = await context.initializeSystem; // depends on step 1
        assert.equal(system.systemReady, true);
    },
];
await executor.execute(steps, {}, t);
```

The `Proxy` wrapping each step result intercepts `.then` / property access to record which step a
given step depends on, then runs them via `PQueue` at the natural concurrency limit.

### Unified Naming and Context

Traditionally, test handlers use the `group(name)([...steps...])` pattern to wrap step arrays with a
name for test reporting. This creates two problems in the unified handler-test continuum:

1. **Parameter conflict** — A `name` property in the first parameter conflicts with legitimate API
   parameters (e.g., an item's `name` field).
2. **Asymmetry** — Production handlers don't need a `name` parameter for logging purposes; they use
   `$meta` for contextual metadata.

The unified concept eliminates both issues by injecting the execution context name into `$meta` via
the **handler proxy**, rather than passing it as a parameter. Two approaches are implemented:

#### Approach 1: Proxy Sub-Property Destructuring

When a handler is accessed via a nested destructuring from the proxy, the property name becomes the
execution context injected into `$meta`:

```typescript
// Instead of: testPaymentFlow({name: 'bill payment', amount: 150}, $meta)
// Destructure a named alias from the proxy:
export default handler(
    ({
        handler: {
            testPaymentFlow: {billPayment, loanPayment},
        },
    }) => ({
        testPaymentScenarios: (params, $meta) => [
            // billPayment is identical to testPaymentFlow but $meta.name = 'bill payment'
            billPayment({amount: 150}, $meta),
            // loanPayment is identical to testPaymentFlow but $meta.name = 'loan payment'
            loanPayment({amount: 5000}, $meta),
        ],
    }),
);
```

The proxy converts camelCase property names to sentence form: `billPayment` → `'bill payment'`.
Conversion rules: insert a space before each uppercase letter and lowercase the result (e.g.,
`cardPaymentFlow` → `'card payment flow'`, `httpRequest` → `'http request'`). For fully uppercase
segments (acronyms), the first letter of each word is preserved as-is in the lowercase result. The
same handler, the same API parameters, but with context carried in `$meta` where it belongs.

The alias is not test-only: accessing `{handler: {paymentExecute: {cardPayment}}}` in a production
handler produces a `cardPayment` function that runs `paymentExecute` with
`$meta.name = 'card payment'`. Most of the time the name is only informational — it reaches the logs
and the traces — but a handler that needs it can read `$meta.name`.

#### Approach 2: Annotation Syntax

In [ut-port](https://github.com/softwaregroup-bg/ut-port/blob/master/README.md), `import` keys can
be prefixed with one or more `@word` annotations. Each annotation is a **single word** that refers
to a config-object key — the proxy merges those config objects into the method's call options,
effectively injecting properties into `$meta`. For example, `@shortCache namespace.entity.action`
merges `config.handler.shortCache` (a config object with e.g. `{cache:{ttl:60000}}`) into the
options.

Blong extends this idea with **parameterised annotations**. The general format for a key with
annotations is:

```text
@annotationName param1 param2... @annotationName2 param1... handlerName
│               │                 └─ second annotation      └─ handler to alias
│               └─ params for @annotationName
└─ first annotation name
```

**Parsing rules:**

1. The **last whitespace-delimited token** is the handler name (must not start with `@`).
2. Tokens starting with `@` open a new annotation; the annotation name is the word immediately after
   `@`.
3. Tokens between an annotation name and the next `@`-token (or the handler name) are the
   **parameters** of that annotation.

Each annotation operates in one of two modes depending on its parameter syntax:

---

**Mode A — `$meta` injection** (plain-word parameters, at least one parameter)

When all parameters are plain words (no `=`), the annotation name is used as the `$meta` property
key and the joined parameter words become its value:

```text
@name bill payment    →   $meta.name = 'bill payment'
@timeout 5000         →   $meta.timeout = '5000'
```

This is the primary mode for contextual metadata such as the execution name used in test reports and
traces.

**Example — single `$meta` annotation:**

```typescript
export default handler(
    ({
        handler: {
            '@name bill payment testPaymentFlow': billPayment,
            '@name loan payment testPaymentFlow': loanPayment,
        },
    }) => ({
        testPaymentScenarios: (params, $meta) => [
            billPayment({amount: 150}, $meta), // $meta.name = 'bill payment'
            loanPayment({amount: 5000}, $meta), // $meta.name = 'loan payment'
        ],
    }),
);
```

**Example — multiple `$meta` annotations:**

```typescript
export default handler(
    ({handler: {'@name bill payment @timeout 5000 testPaymentFlow': billPayment}}) => ({
        testPaymentScenarios: (params, $meta) => [
            // $meta.name = 'bill payment', $meta.timeout = '5000'
            billPayment({amount: 150}, $meta),
        ],
    }),
);
```

---

**Mode B — config-object reference** (`key=value` parameters or no parameters)

When the annotation has no parameters, or when any parameter uses `key=value` syntax, the annotation
name is treated as a **config key** — exactly as ut-port does. The proxy looks up
`config.handler[annotationName]` and merges that config object into the call options (which flow
into `$meta`). This allows the same shared config objects used in ut-port (e.g., cache policies,
retry profiles) to be reused in blong without any changes.

If parameters are present and use `key=value` syntax, each `key=value` token **overrides** the
corresponding top-level property of the looked-up config object before the merge. This lets a single
call site customise a shared config without defining a separate config entry:

```text
@cache                      →  merge config.handler.cache into call options
@cache ttl=10               →  merge config.handler.cache, then override its ttl = 10
@cache ttl=10 maxSize=500   →  merge config.handler.cache, override multiple properties
```

**Example — config-object annotation with override:**

```typescript
// Configuration (e.g. in realm config):
// config.handler.cache = { ttl: 60000, maxSize: 1000 }

export default handler(
    ({
        handler: {
            // Use the 'cache' config, but shorten TTL for this specific call
            '@cache ttl=10 namespace.entity.get': getCachedEntity,
        },
    }) => ({
        testCachedLookup: (params, $meta) => [
            // Resolved as: merge({ ttl: 60000, maxSize: 1000 }, { ttl: 10 })
            // Effective call options: { ttl: 10, maxSize: 1000 }
            getCachedEntity({id: '123'}, $meta),
        ],
    }),
);
```

---

**Disambiguation** — the proxy determines which mode to apply at parse time:

- If all parameters are plain words (none contains `=`), Mode A (`$meta` injection) is used.
- If any parameter contains `=`, Mode B (config-object reference with overrides) is used.
- If there are no parameters at all, Mode B is used (pure config-object lookup, like ut-port).

This allows both modes to coexist in the same annotation list:

```typescript
// @name is Mode A ($meta.name injection)
// @cache is Mode B (config-object lookup with ttl override)
'@name bill payment @cache ttl=10 namespace.entity.get': getCachedEntity
```

**Extensibility** — mode is selected purely by parameter syntax; any annotation name can be used in
either mode:

- `@name bill payment` → Mode A: `$meta.name = 'bill payment'`
- `@timeout 5000` → Mode A: `$meta.timeout = '5000'`
- `@cache` → Mode B: merges `config.handler.cache` into call options
- `@cache ttl=10` → Mode B: merges `config.handler.cache` then overrides `cache.ttl`
- `@retry maxAttempts=3 delay=100` → Mode B: merges `config.handler.retry` with two overrides

This approach allows arbitrary multi-word names without relying on camelCase conversion (which
governs Approach 1), and it supports stacking multiple independent context annotations on a single
handler alias.

> **Implementation note:** Both approaches are implemented in `core/blong-gogo/src/handlerProxy.ts`,
> driven by two helpers in `core/blong-gogo/src/lib.ts`:
>
> - **Approach 1** — the resolved handler is wrapped in a second `Proxy` whose `get` turns a
>   sub-property access into an alias: the property name is converted with `camelToSentence` and
>   pre-injected as `$meta.name`.
> - **Approach 2** — a key starting with `@` is split by `parseAnnotatedKey` into the handler name
>   and its annotations. Plain-word parameters become `$meta` properties (Mode A). `key=value`
>   parameters, or no parameters at all, look up `config.handler[annotationName]`, apply the
>   overrides, and deep-merge the result into the call options (Mode B).
>
> `core/blong-gogo/src/lib.test.ts` covers the parsing and the conversion, and
> `demo/handler-test-poc/order/test/test/testOrderNaming.ts` exercises both modes and the
> mixed-annotation case end to end.

#### Checkpoint-Driven Test Assertions

When a handler with checkpoints is called from a test, the framework collects checkpoint data and
makes it available for assertions:

```typescript
export default handler(({handler: {paymentFlowExecute}}) => ({
    testPaymentFlowCheckpoints: (params, $meta) => [
        async function executeFlow(assert, {$meta}) {
            const result = await paymentFlowExecute(
                {currency: 'USD', balance: 1000, amount: 100},
                $meta,
            );
            assert.ok(result.transferId);

            const checkpoints = $meta.checkpoints;
            assert.equal(checkpoints[0].name, 'account-ready');
            assert.ok(checkpoints[0].data.accountId);
            assert.equal(checkpoints[1].name, 'transfer-done');
            assert.equal(checkpoints[1].data.transferId, result.transferId);
        },
    ],
}));
```

The list read here is the same list the sequence diagram is drawn from, so a test and a picture
cannot disagree about what happened.

## Future Ideas

Nothing in this section is built, and it is recorded here so a reader does not mistake the code
examples for capabilities. Of the `lib` members named below, only `assert` exists today:
`invariant`, `canary` and `chain` do not.

1. **Handler coverage matrix** — record which handlers are called by which test steps and generate a
   "handler coverage" report analogous to code coverage. This exposes API paths that are never
   exercised by tests, making it easy to identify gaps without inspecting individual test files.

2. **`@retry n` step annotation** — mark flaky steps with a retry policy via the annotation syntax
   (`@retry 3 executeTransfer`) without modifying the step body. The retry concern stays separate
   from business logic and the annotation is visible in test reports.

3. **`@parallel` step annotation** — allow `@parallel stepA stepB` to declare that two named steps
   can overlap in execution even if they share a common dependency, enabling more aggressive
   parallelism for steps that each only read (not write) the dependency's result.

### Invariant Guards

Handlers can define **invariants** — conditions that must always hold true. Unlike assertions (which
check specific values), invariants check structural properties:

```typescript
export default handler(
    ({lib: {invariant}}) =>
        async function accountBalanceUpdate({accountId, amount}, $meta) {
            const before = await accountGet({accountId}, $meta);
            invariant?.('non-negative-balance', () => before.balance >= 0);

            const after = await accountUpdate({accountId, balance: before.balance + amount}, $meta);
            invariant?.('balance-consistency', () => after.balance === before.balance + amount);

            return after;
        },
);
```

Invariants use the same optional chaining pattern. In debug mode, a violated invariant throws a
typed error. In production, they are no-ops.

### Replay and Time Travel Debugging

Checkpoint data, when captured in debug mode, creates a structured trace of handler execution. This
trace can be:

- **Replayed:** Re-execute the handler with the same inputs and verify checkpoints match, detecting
  non-determinism.
- **Compared:** Diff checkpoint traces between two runs to identify where behaviour diverged.
- **Visualized:** Render checkpoint sequences as timeline diagrams for complex multi-handler flows.

### Contract Testing via Checkpoints

When handler A calls handler B, the checkpoints emitted by B become part of A's observable
behaviour. This creates an implicit **contract** between handlers:

```typescript
// If handler B always emits checkpoint 'validation-passed' before
// 'record-saved', a test can verify this ordering contract:
assert.ok(
    checkpoints.findIndex(c => c.name === 'validation-passed') <
        checkpoints.findIndex(c => c.name === 'record-saved'),
    'Validation must precede persistence',
);
```

### Canary Assertions

Some assertions should always run, even in production, but only log (not throw) on failure. These
"canary assertions" detect anomalies without breaking the flow:

```typescript
export default handler(
    ({lib: {canary}}) =>
        async function transferProcess(params, $meta) {
            const result = await process(params, $meta);
            canary?.('unusual-amount', result.amount < 1_000_000, {
                amount: result.amount,
                transferId: result.id,
            });
            return result;
        },
);
```

Canary failures are reported to the observability system but never throw exceptions. They serve as
early warning signals for potential issues.

### Step Metrics and SLA Tracking

Checkpoints naturally support duration measurement between consecutive points. The framework can
automatically compute:

- **Step duration:** Time between consecutive checkpoints
- **Total duration:** Time from first to last checkpoint
- **SLA violations:** Flag when step durations exceed configured thresholds

```typescript
$meta.checkpoint?.('query-started');
const result = await db.query(sql);
$meta.checkpoint?.('query-completed', {rows: result.length});
// Framework automatically measures duration between these two checkpoints
```

### Progressive Verification Levels

Instead of a binary test/production split, support multiple verification levels that can be
configured per environment:

| Level          | Assertions  | Checkpoints  | Invariants  | Canaries |
| -------------- | ----------- | ------------ | ----------- | -------- |
| 0 — Production | off         | off          | off         | on       |
| 1 — Monitoring | off         | on (logging) | off         | on       |
| 2 — Staging    | on (warn)   | on (logging) | on (warn)   | on       |
| 3 — Debug      | on (throw)  | on (context) | on (throw)  | on       |
| 4 — Test       | on (assert) | on (context) | on (assert) | on       |

This turns the handler-test boundary into a **spectrum of verification intensity**, configurable per
deployment.

### Handler Composition Chains

Since both handlers and tests use the same step model, handlers can be composed into chains just
like test steps:

```typescript
export default handler(
    ({lib: {chain}, handler: {validate, enrich, persist, notify}}) =>
        async function orderProcess(params, $meta) {
            return chain([
                async function validateOrder() {
                    return validate(params, $meta);
                },
                async function enrichOrder({validateOrder}) {
                    return enrich(await validateOrder, $meta);
                },
                async function persistOrder({enrichOrder}) {
                    return persist(await enrichOrder, $meta);
                },
                async function notifyParties({persistOrder}) {
                    return notify(await persistOrder, $meta);
                },
            ]);
        },
);
```

This makes the handler's internal flow visible, traceable, and testable at each step — exactly like
a test chain.
