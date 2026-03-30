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

5. **Unified naming context** — The `name` parameter, already conventional
   in test handlers, becomes a framework-managed execution context. The
   framework automatically extracts `name` from the first parameter and
   uses it for test report nesting, structured logging, and tracing.
   Handlers no longer need to explicitly call `group(name)([...])` — the
   framework provides the same grouping behind the scenes.

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
    testPaymentFlow: ({name = 'payment flow'}, $meta) => [
        async function createAccount(assert, {$meta}) {
            const account = await accountCreate({currency: 'USD', balance: 1000}, $meta);
            assert.ok(account.id, 'Account created');
            return account;
        },
        async function executeTransfer(assert, {createAccount, $meta}) {
            const account = await createAccount;
            const result = await paymentTransferExecute(
                {accountId: account.id, amount: 100},
                $meta,
            );
            assert.equal(result.state, 'COMPLETED', 'Transfer completed');
            return result;
        },
    ],
}));
```

The framework automatically uses the `name` parameter for test report nesting
and structured logging — no explicit `group()` call needed. The test handler
simply returns an array of steps.

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
wrap step arrays with a name for test reporting. This explicit wrapping creates
friction in the handler-test continuum because it adds ceremony that handlers
don't need.

The unified concept eliminates explicit `group()` calls. Instead, the framework
automatically extracts the `name` property from the handler's first parameter
and uses it as the **execution context**:

```typescript
// No group() needed — framework reads name from the first parameter
export default handler(({handler: {transferCreate}}) => ({
    testPaymentFlow: ({name = 'payment flow', amount = 100}, $meta) => [
        async function createTransfer(assert, {$meta}) {
            const result = await transferCreate({amount}, $meta);
            assert.ok(result.transferId);
            return result;
        },
    ],
}));
```

The `name` serves multiple purposes depending on context:

| Context | Name Purpose |
|---------|-------------|
| **Test reporting** | Creates nesting in test output — identifies which context a reused test handler was invoked in (e.g., "bill payment" vs "loan payment") |
| **Structured logging** | Appears in log entries as the operation context |
| **Tracing** | Sets the span name for distributed tracing |
| **Handler logic** | Available as a regular parameter when the name needs to influence behavior |

**Reuse with different contexts** — the key benefit of naming. When the same
test handler is invoked with different parameters, the `name` distinguishes
each invocation in test reports:

```typescript
export default handler(({handler: {testPaymentFlow}}) => ({
    testPaymentScenarios: ({name = 'payment scenarios'}, $meta) => [
        // Each invocation gets its own name in the test report
        testPaymentFlow({name: 'bill payment',  amount: 150}, $meta),
        testPaymentFlow({name: 'loan payment',  amount: 5000}, $meta),
        testPaymentFlow({name: 'zero payment',  amount: 0}, $meta),
    ],
}));
```

If a test fails, the report shows exactly which context failed (e.g.,
"payment scenarios → loan payment → createTransfer"), making it clear whether
the issue is specific to a particular scenario or systemic.

The same naming pattern applies to **production handlers**. Most of the time
the name is purely informational (for logging and tracing), but handlers can
also use it to influence behavior:

```typescript
export default handler(({handler: {rateGet, transferCreate}, lib: {checkpoint}}) =>
    async function paymentExecute({name = 'payment', type, amount}, $meta, assert?) {
        // Name used for observability
        checkpoint?.('payment-started', {name, type, amount});

        // Name can also influence logic when needed
        const rate = type === 'international'
            ? await rateGet({currency: 'FX'}, $meta)
            : {rate: 1};

        const result = await transferCreate({amount: amount * rate.rate}, $meta);
        checkpoint?.('payment-completed', {name, transferId: result.id});
        return result;
    }
);
```

This unification means:

- **No `group()` import needed** — the framework handles naming automatically
- **Tests and handlers are structurally identical** — both return results
  from a function with `(params, $meta)` signature
- **Context nesting is preserved** — test reports still show hierarchical
  grouping based on handler invocation chains
- **Reuse is natural** — the same handler can run with different `name`
  values to test different scenarios or serve different API consumers

#### Checkpoint-Driven Test Assertions

When a handler with checkpoints is called from a test, the framework can
collect checkpoint data and make it available for assertions:

```typescript
export default handler(({handler: {paymentFlowExecute}}) => ({
    testPaymentFlowCheckpoints: ({name = 'payment flow checkpoints'}, $meta) => [
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
