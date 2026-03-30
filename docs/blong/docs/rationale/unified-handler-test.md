# Unified Handler-Test Concept

## Rationale

### Problem

Handlers and tests are traditionally separate concepts with different APIs,
different execution models, and different tooling. Yet in practice, they share
deep structural similarities:

- **Tests look like higher-order handlers.** A test orchestrates a sequence of
  lower-level handler calls, validates intermediate results, and returns a
  summary. This is exactly what an orchestrator handler does.
- **Handlers can benefit from assertions.** In development and staging,
  having inline assertions that verify preconditions, postconditions, and
  invariants would catch bugs earlier. In production, these assertions should
  be zero-cost.
- **Tests are "handlers that didn't graduate."** Many test handlers implement
  valuable multi-step workflows that could become API handlers if the
  assertions were removed and the workflow was generalized.
- **Both need progress tracking.** Long-running multi-step handlers and test
  chains both benefit from tracing their progress through discrete
  checkpoints, for debugging, observability, and failure localization.

The traditional separation creates friction:

- **Duplicated patterns:** Orchestrator handlers and test handlers use
  slightly different APIs to do structurally similar work.
- **Lost knowledge:** When a developer writes a test workflow, the
  understanding of how to orchestrate those steps stays locked in the test
  layer and never migrates to production code.
- **Assertion gap:** Production handlers have no built-in mechanism for
  verifiable invariants, while tests have no mechanism to contribute
  production-ready orchestration logic.

### Solution

Unify the handler and test concepts along a **continuum** rather than a
**boundary**. The key ideas:

1. **Checkpoint function** — A framework-provided function available in both
   handlers and tests that records progress through multi-step operations.
   In tests, checkpoints drive assertions and test reporting. In production,
   they feed observability (structured logging, tracing, metrics).

2. **Optional assertions via `?.`** — JavaScript's optional chaining operator
   enables zero-overhead assertions in production. When the `assert` parameter
   is `undefined` (production mode), `assert?.equal(...)` is a no-op. When
   present (test/debug mode), assertions execute normally.

3. **Handler-test graduation** — Tests can be promoted to production handlers
   by adjusting configuration. The same code that validated a workflow in
   testing becomes the production orchestration, with assertions silenced.

4. **Shared step execution model** — Both handlers and tests use the same
   step execution model from `blong-chain`: named functions, thenable
   proxies for automatic dependency detection, and parallel execution.

5. **Unified naming context** — The execution context name (used for test
   report nesting, structured logging, and tracing) is injected into `$meta`
   by the framework, not passed as a handler parameter. This prevents `name`
   from conflicting with API parameters. Two mechanisms are planned:

   - **Proxy sub-property destructuring** — `{handler: {testPaymentFlow: {billPayment}}}` 
     returns the same handler but with `$meta.name = 'bill payment'` pre-injected
     (camelCase converted to sentence form).
   - **Annotation syntax** — `@annotationName params... handlerName` keys on the
     proxy. Annotations operate in two modes: **`$meta` injection** (plain-word
     params, e.g. `@name bill payment`) sets `$meta.annotationName` directly;
     **config-object mode** (`key=value` params or no params, e.g. `@cache ttl=10`)
     merges `config.import[annotationName]` into the call options with optional
     property overrides. Multiple annotations can be chained on one key.

### Design

#### The Checkpoint Function

The `checkpoint` function is a library function injected by the framework:

```typescript
export default handler(({lib: {checkpoint}, handler: {accountGet, transferCreate}}) =>
    async function paymentTransferExecute(params, $meta) {
        const account = await accountGet({id: params.accountId}, $meta);
        checkpoint?.('account-loaded', {accountId: account.id, balance: account.balance});

        const transfer = await transferCreate({amount: params.amount, from: account.id}, $meta);
        checkpoint?.('transfer-created', {transferId: transfer.id, state: transfer.state});

        return {transferId: transfer.id, state: transfer.state};
    }
);
```

The `checkpoint` function:

- **In production:** Is `undefined` by default. The `checkpoint?.()` call is
  a no-op with zero overhead (no function call, no object allocation).
- **In debug/staging mode:** Emits structured log entries with checkpoint
  names and data, feeding distributed tracing systems.
- **In test mode:** Records checkpoint data in the test context, enabling
  assertions on intermediate states without modifying the handler code.

#### Optional Assertions

Handlers can include assertions that are active only in non-production
environments:

```typescript
export default handler(({lib: {checkpoint}}) =>
    async function orderOrderProcess({orderId, items}, $meta, assert?) {
        const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        assert?.ok(total > 0, 'Order total must be positive');
        checkpoint?.('total-calculated', {total});

        const discount = await applyDiscount(total, $meta);
        assert?.ok(discount <= total, 'Discount cannot exceed total');
        checkpoint?.('discount-applied', {discount, final: total - discount});

        return {total: total - discount};
    }
);
```

The `assert` parameter uses the optional third parameter convention:

- **In production:** Called with two arguments `(params, $meta)` — `assert`
  is `undefined`, all `assert?.` calls are no-ops.
- **In test/debug mode:** Called with three arguments
  `(params, $meta, assert)` — assertions execute and failures are reported.

#### Handler-Test Graduation

A test handler that proves a workflow works correctly:

```typescript
// test/test/testPaymentFlow.ts — starts as a test
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
            const result = await paymentTransferExecute(
                {accountId: account.id, amount},
                $meta,
            );
            assert.equal(result.state, 'COMPLETED', 'Transfer completed');
            return result;
        },
    ],
}));
```

The handler signature is clean — no `name` parameter conflicts with API params.
The execution context name is injected into `$meta` by the framework
(see "Unified Naming and Context" below). The test handler simply returns
an array of steps.

Can graduate to a production handler:

```typescript
// orchestrator/payment/paymentFlowExecute.ts — graduated to production
export default handler(({handler: {accountCreate, paymentTransferExecute}, lib: {checkpoint}}) =>
    async function paymentFlowExecute({currency, balance, amount}, $meta, assert?) {
        const account = await accountCreate({currency, balance}, $meta);
        assert?.ok(account.id, 'Account created');
        checkpoint?.('account-ready', {accountId: account.id});

        const result = await paymentTransferExecute(
            {accountId: account.id, amount},
            $meta,
        );
        assert?.equal(result.state, 'COMPLETED', 'Transfer completed');
        checkpoint?.('transfer-done', {transferId: result.transferId});

        return result;
    }
);
```

The same logic, the same assertions, the same checkpoints — but now
accessible as a production API endpoint.

#### Unified Naming and Context

Traditionally, test handlers use the `group(name)([...steps...])` pattern to
wrap step arrays with a name for test reporting. This creates two problems in
the unified handler-test continuum:

1. **Parameter conflict** — A `name` property in the first parameter conflicts
   with legitimate API parameters (e.g., an item's `name` field).
2. **Asymmetry** — Production handlers don't need a `name` parameter for
   logging purposes; they use `$meta` for contextual metadata.

The unified concept eliminates both issues by injecting the execution context
name into `$meta` via the **handler proxy**, rather than passing it as a
parameter. Two approaches are planned:

##### Approach 1: Proxy Sub-Property Destructuring

When a handler is accessed via a nested destructuring from the proxy, the
property name becomes the execution context injected into `$meta`:

```typescript
// Instead of: testPaymentFlow({name: 'bill payment', amount: 150}, $meta)
// Destructure a named alias from the proxy:
export default handler(({handler: {testPaymentFlow: {billPayment, loanPayment}}}) => ({
    testPaymentScenarios: (params, $meta) => [
        // billPayment is identical to testPaymentFlow but $meta.name = 'bill payment'
        billPayment({amount: 150}, $meta),
        // loanPayment is identical to testPaymentFlow but $meta.name = 'loan payment'
        loanPayment({amount: 5000}, $meta),
    ],
}));
```

The proxy converts camelCase property names to sentence form: `billPayment` →
`'bill payment'`. Conversion rules: insert a space before each uppercase letter
and lowercase the result (e.g., `cardPaymentFlow` → `'card payment flow'`,
`httpRequest` → `'http request'`). For fully uppercase segments (acronyms),
the first letter of each word is preserved as-is in the lowercase result.
The same handler, the same API parameters, but with context
carried in `$meta` where it belongs.

This pattern works equally for production handlers — accessing
`{handler: {paymentExecute: {cardPayment}}}` produces a `cardPayment` function
that runs `paymentExecute` with `$meta.name = 'card payment'`. Most of the time
the name is purely informational (for logging and tracing), but handlers that
need it can read `$meta.name`.

##### Approach 2: Annotation Syntax (Side Task — Proxy Update Required)

In [ut-port](https://github.com/softwaregroup-bg/ut-port/blob/master/README.md),
`import` keys can be prefixed with one or more `@word` annotations. Each
annotation is a **single word** that refers to a config-object key — the
proxy merges those config objects into the method's call options, effectively
injecting properties into `$meta`. For example, `@shortCache namespace.entity.action`
merges `config.import.shortCache` (a config object with e.g. `{cache:{ttl:60000}}`)
into the options.

Blong extends this idea with **parameterised annotations**. The general format
for a key with annotations is:

```
@annotationName param1 param2... @annotationName2 param1... handlerName
│               │                 │                          │
│               └─ params for @annotationName               │
│                               └─ second annotation        │
└─ first annotation name                                     └─ handler to alias
```

**Parsing rules:**
1. The **last whitespace-delimited token** is the handler name (must not start with `@`).
2. Tokens starting with `@` open a new annotation; the annotation name is the
   word immediately after `@`.
3. Tokens between an annotation name and the next `@`-token (or the handler name)
   are the **parameters** of that annotation.

Each annotation operates in one of two modes depending on its parameter syntax:

---

**Mode A — `$meta` injection** (plain-word parameters, at least one parameter)

When all parameters are plain words (no `=`), the annotation name is used as
the `$meta` property key and the joined parameter words become its value:

```
@name bill payment    →   $meta.name = 'bill payment'
@timeout 5000         →   $meta.timeout = '5000'
```

This is the primary mode for contextual metadata such as the execution name
used in test reports and traces.

**Example — single `$meta` annotation:**

```typescript
export default handler(({
    handler: {
        '@name bill payment testPaymentFlow': billPayment,
        '@name loan payment testPaymentFlow': loanPayment,
    }
}) => ({
    testPaymentScenarios: (params, $meta) => [
        billPayment({amount: 150}, $meta),   // $meta.name = 'bill payment'
        loanPayment({amount: 5000}, $meta),  // $meta.name = 'loan payment'
    ],
}));
```

**Example — multiple `$meta` annotations:**

```typescript
export default handler(({
    handler: {
        '@name bill payment @timeout 5000 testPaymentFlow': billPayment,
    }
}) => ({
    testPaymentScenarios: (params, $meta) => [
        // $meta.name = 'bill payment', $meta.timeout = '5000'
        billPayment({amount: 150}, $meta),
    ],
}));
```

---

**Mode B — config-object reference** (`key=value` parameters or no parameters)

When the annotation has no parameters, or when any parameter uses `key=value`
syntax, the annotation name is treated as a **config key** — exactly as
ut-port does. The proxy looks up `config.import[annotationName]` and merges
that config object into the call options (which flow into `$meta`). This allows
the same shared config objects used in ut-port (e.g., cache policies, retry
profiles) to be reused in blong without any changes.

If parameters are present and use `key=value` syntax, each `key=value` token
**overrides** the corresponding property on the looked-up config object before
the merge. This lets a single call site customise a shared config without
defining a separate config entry:

```
@cache                      →  merge config.import.cache into $meta
@cache ttl=10               →  merge config.import.cache, then override cache.ttl = 10
@cache ttl=10 maxSize=500   →  merge config.import.cache, override multiple properties
```

**Example — config-object annotation with override:**

```typescript
// Configuration (e.g. in realm config):
// config.import.cache = { cache: { ttl: 60000, maxSize: 1000 } }

export default handler(({
    handler: {
        // Use the 'cache' config, but shorten TTL for this specific call
        '@cache ttl=10 namespace.entity.get': getCachedEntity,
    }
}) => ({
    testCachedLookup: (params, $meta) => [
        // Resolved as: merge({ cache: { ttl: 60000, maxSize: 1000 } }, { cache: { ttl: 10 } })
        // Effective: $meta.cache = { ttl: 10, maxSize: 1000 }
        getCachedEntity({id: '123'}, $meta),
    ],
}));
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

**Extensibility** — mode is selected purely by parameter syntax; any annotation
name can be used in either mode:
- `@name bill payment` → Mode A: `$meta.name = 'bill payment'`
- `@timeout 5000` → Mode A: `$meta.timeout = '5000'`
- `@cache` → Mode B: merges `config.import.cache` into call options
- `@cache ttl=10` → Mode B: merges `config.import.cache` then overrides `cache.ttl`
- `@retry maxAttempts=3 delay=100` → Mode B: merges `config.import.retry` with two overrides

This approach allows arbitrary multi-word names without relying on camelCase
conversion (which governs Approach 1), and it supports stacking multiple
independent context annotations on a single handler alias.

> **Implementation note:** Both approaches require updating the handler proxy
> in `layerProxy.ts`. The proxy already intercepts `handler.get` at one level
> (returning a wrapped function). The changes needed are:
> - **Approach 1:** Add a second `get` level on the returned wrapper so that
>   `handler.testFn.billPayment` converts `billPayment` → `'bill payment'`
>   (camelCase→sentence) and pre-injects `$meta.name`.
> - **Approach 2 / Mode A:** In the top-level `get`, detect keys starting with
>   `@`, parse the annotation tokens and handler name, look up the handler
>   normally, then wrap it to inject the parsed annotations into `$meta` before
>   the call. Plain-word parameters are joined and set directly on `$meta`.
> - **Approach 2 / Mode B:** For annotations whose parameters all use
>   `key=value` syntax (or have no parameters), look up the config object at
>   `config.import[annotationName]`, apply `key=value` overrides to a shallow
>   copy, then deep-merge the result into the call options (which flow into
>   `$meta`). This is backward-compatible with ut-port's config-object pattern.
> Both are tracked as a side task within this plan.

**Context nesting** — when the proxy-based naming is in place, test report
output automatically shows the handler invocation chain (e.g.,
"payment scenarios → bill payment → createTransfer"), making failure context
immediately visible without any boilerplate.

#### Checkpoint-Driven Test Assertions

When a handler with checkpoints is called from a test, the framework can
collect checkpoint data and make it available for assertions:

```typescript
export default handler(({handler: {paymentFlowExecute}}) => ({
    testPaymentFlowCheckpoints: (params, $meta) => [
        async function executeFlow(assert, {$meta}) {
            const result = await paymentFlowExecute(
                {currency: 'USD', balance: 1000, amount: 100},
                $meta,
            );
            // Assert on the result
            assert.ok(result.transferId);

            // Assert on checkpoints captured during execution
            const checkpoints = $meta.checkpoints;
            assert.equal(checkpoints[0].name, 'account-ready');
            assert.ok(checkpoints[0].data.accountId);
            assert.equal(checkpoints[1].name, 'transfer-done');
            assert.equal(checkpoints[1].data.transferId, result.transferId);
        },
    ],
}));
```

## Additional Ideas

### 1. Invariant Guards

Handlers can define **invariants** — conditions that must always hold true.
Unlike assertions (which check specific values), invariants check structural
properties:

```typescript
export default handler(({lib: {invariant}}) =>
    async function accountBalanceUpdate({accountId, amount}, $meta) {
        const before = await accountGet({accountId}, $meta);
        invariant?.('non-negative-balance', () => before.balance >= 0);

        const after = await accountUpdate({accountId, balance: before.balance + amount}, $meta);
        invariant?.('balance-consistency', () => after.balance === before.balance + amount);

        return after;
    }
);
```

Invariants use the same optional chaining pattern. In debug mode, a violated
invariant throws a typed error. In production, they are no-ops.

### 2. Replay and Time Travel Debugging

Checkpoint data, when captured in debug mode, creates a structured trace of
handler execution. This trace can be:

- **Replayed:** Re-execute the handler with the same inputs and verify
  checkpoints match, detecting non-determinism.
- **Compared:** Diff checkpoint traces between two runs to identify where
  behavior diverged.
- **Visualized:** Render checkpoint sequences as timeline diagrams for
  complex multi-handler flows.

### 3. Contract Testing via Checkpoints

When handler A calls handler B, the checkpoints emitted by B become part of
A's observable behavior. This creates an implicit **contract** between
handlers:

```typescript
// If handler B always emits checkpoint 'validation-passed' before
// 'record-saved', a test can verify this ordering contract:
assert.ok(
    checkpoints.findIndex(c => c.name === 'validation-passed') <
    checkpoints.findIndex(c => c.name === 'record-saved'),
    'Validation must precede persistence',
);
```

### 4. Canary Assertions

Some assertions should always run, even in production, but only log (not
throw) on failure. These "canary assertions" detect anomalies without
breaking the flow:

```typescript
export default handler(({lib: {canary}}) =>
    async function transferProcess(params, $meta) {
        const result = await process(params, $meta);
        canary?.('unusual-amount', result.amount < 1_000_000,
            {amount: result.amount, transferId: result.id});
        return result;
    }
);
```

Canary failures are reported to the observability system but never throw
exceptions. They serve as early warning signals for potential issues.

### 5. Step Metrics and SLA Tracking

Checkpoints naturally support duration measurement between consecutive
points. The framework can automatically compute:

- **Step duration:** Time between consecutive checkpoints
- **Total duration:** Time from first to last checkpoint
- **SLA violations:** Flag when step durations exceed configured thresholds

```typescript
checkpoint?.('query-started');
const result = await db.query(sql);
checkpoint?.('query-completed', {rows: result.length});
// Framework automatically measures duration between these two checkpoints
```

### 6. Progressive Verification Levels

Instead of a binary test/production split, support multiple verification
levels that can be configured per environment:

| Level | Assertions | Checkpoints | Invariants | Canaries |
|-------|-----------|-------------|------------|----------|
| 0 — Production | off | off | off | on |
| 1 — Monitoring | off | on (logging) | off | on |
| 2 — Staging | on (warn) | on (logging) | on (warn) | on |
| 3 — Debug | on (throw) | on (context) | on (throw) | on |
| 4 — Test | on (assert) | on (context) | on (assert) | on |

This turns the handler-test boundary into a **spectrum of verification
intensity**, configurable per deployment.

### 7. Handler Composition Chains

Since both handlers and tests use the same step model, handlers can be
composed into chains just like test steps:

```typescript
export default handler(({lib: {chain}, handler: {validate, enrich, persist, notify}}) =>
    async function orderProcess(params, $meta) {
        return chain([
            async function validateOrder() { return validate(params, $meta); },
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
    }
);
```

This makes the handler's internal flow visible, traceable, and testable
at each step — exactly like a test chain.
