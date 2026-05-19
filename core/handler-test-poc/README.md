# Handler-Test POC Suite

Proof of concept demonstrating the **unified handler-test concept** — blending
handlers and tests into a continuum rather than keeping them as separate
concerns.

## Concepts Demonstrated

### 1. Checkpoint-Enabled Handlers

Handlers use `$meta.checkpoint?.()` to record progress through multi-step
operations. The optional chaining ensures zero overhead in production.
Checkpoints are recorded in `$meta.checkpoints` when checkpoint mode
is enabled via `registry.checkpointMode: 'test'`.

See: `order/orchestrator/order/orderOrderCreate.ts`

### 2. Optional Assertions in Handlers

Handlers destructure `assert` from `lib`, just like `checkpoint`. Both
follow the same pattern: `undefined` in production (zero-cost via `?.`),
active in test/debug mode. No handler signature changes needed — both
are captured at definition time and used at call time.

```typescript
export default handler(({lib: {assert}}) =>
    async function orderOrderCreate({items, customerId}, $meta) {
        assert?.ok(total > 0, 'Order total must be positive');
        $meta.checkpoint?.('total-calculated', {total});
    }
);
```

See: `order/orchestrator/order/orderOrderCreate.ts`, `orderOrderConfirm.ts`

### 3. Handler-Test Graduation

The `orderFlowExecute` handler was "graduated" from a test. Compare:

- **Test version:** `order/test/test/testOrderGraduate.ts` (manual flow)
- **Production version:** `order/orchestrator/order/orderFlowExecute.ts`

Same logic, but with optional assertions and checkpoints.

### 4. Invariant Guards

Tests verify structural properties (invariants) of handlers:

- Total is always sum of (price × quantity)
- Discounted total ≤ total
- Discount boundary behaviour at exactly 100

See: `order/test/test/testOrderInvariant.ts`

### 5. Canary Assertions

Soft checks that detect anomalies without breaking the flow. In production,
they log warnings. In tests, they can be verified.

See: `order/test/test/testOrderCanary.ts`

### 6. Progressive Verification Levels

The same handler code supports multiple verification levels:

| Level | Assertions | Checkpoints | Invariants | Canaries |
|-------|-----------|-------------|------------|----------|
| 0 — Production | off | off | off | on |
| 1 — Monitoring | off | on | off | on |
| 2 — Staging | warn | on | warn | on |
| 3 — Debug | throw | on | throw | on |
| 4 — Test | assert | on | assert | on |

## Implementation

### Framework Changes

1. **`IMeta`** extended with `name?: string` and `checkpoints?: Array<{name, data, timestamp}>`
2. **`ILib`** extended with `checkpoint: CheckpointFn | undefined` and `assert: typeof Assert | undefined`
3. **`checkpoint.ts`** — `AsyncLocalStorage`-based checkpoint function that finds the current `$meta`
4. **`Registry._createHandlers`** — creates checkpoint and assert based on `checkpointMode` config
5. **`layerProxy.ts` handler proxy** — wraps handler calls with `withMeta()` to bind `$meta`
   in `AsyncLocalStorage` for checkpoint recording

### Configuration

Enable checkpoint mode in the suite's server config:

```typescript
config: {
    default: {
        registry: {
            checkpointMode: 'test',  // or 'debug', default: 'production'
        },
    },
}
```

### Test Dispatch

The `testDispatch` imports both test and order handlers so all calls
resolve through its handler proxy, which wraps calls with `withMeta()`.
This keeps checkpoint data in the same `$meta.checkpoints` array:

```typescript
activation: {
    integration: {
        namespace: ['test', 'order'],
        imports: ['order.test', 'order.order'],
    },
}
```

### Internal API Testing

The suite uses server-only (internal API) testing. Both test handlers
and business handlers run in the same process, so checkpoints stay
in the same `$meta` object without crossing HTTP boundaries:

```typescript
// index.ts
export default async (load): Promise<void> => {
    const platforms = await Promise.all([
        load(server, 'handler-test-poc', 'handler-test-poc', ['microservice', 'integration', 'dev']),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[0].test();
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
```

## Structure

```
handler-test-poc/
├── server.ts              # Suite server entry (enables checkpointMode)
├── browser.ts             # Suite browser entry (unused in internal API testing)
├── index.ts               # API test entry (server-only)
└── order/                 # Order realm
    ├── server.ts          # Realm definition (activates test layer)
    ├── browser.ts         # Realm browser entry
    ├── gateway/
    │   └── order/
    │       ├── orderOrderCreate.ts       # Gateway validation
    │       ├── orderOrderConfirm.ts      # Gateway validation
    │       └── orderFlowExecute.ts       # Gateway validation
    ├── orchestrator/
    │   ├── orderDispatch.ts
    │   └── order/
    │       ├── error.ts                  # Typed errors
    │       ├── calculateTotal.ts         # Library function
    │       ├── orderOrderCreate.ts       # Handler with checkpoints + optional assert
    │       ├── orderOrderConfirm.ts      # Handler with checkpoints + optional assert
    │       └── orderFlowExecute.ts       # Graduated handler (was a test)
    └── test/
        ├── mockDispatch.ts
        ├── testDispatch.ts               # Imports both test + order handlers
        └── test/
            ├── testOrderCheckpoint.ts    # Checkpoint assertion test
            ├── testOrderGraduate.ts      # Graduation pattern test
            ├── testOrderInvariant.ts     # Invariant guard test
            └── testOrderCanary.ts        # Canary assertion test
```

## Further Ideas to Explore

1. **Replay/time-travel debugging:** Capture checkpoint traces and replay them
2. **Contract testing via checkpoints:** Verify checkpoint ordering between handlers
3. **Step metrics and SLA tracking:** Measure duration between checkpoints
4. **Handler composition chains:** Use blong-chain's step model inside handlers
5. **Checkpoint snapshots:** Combine with snapshot testing for regression detection
6. **Proxy sub-property destructuring:** `{handler: {testFn: {scenarioA}}}` to inject `$meta.name`
7. **Annotation syntax:** `@name bill payment testPaymentFlow` for context injection

See `docs/blong/docs/rationale/unified-handler-test.md` for the full design.
