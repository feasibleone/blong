# Handler-Test POC Suite

Proof of concept demonstrating the **unified handler-test concept** — blending handlers and tests
into a continuum rather than keeping them as separate concerns.

## Concepts Demonstrated

### 1. Checkpoint-Enabled Handlers

Handlers use `$meta.checkpoint?.()` to record progress through multi-step operations. The optional
chaining ensures zero overhead in production. Points are recorded in `$meta.progress` when
checkpoint mode is enabled via `registry.checkpointMode: 'test'` — the same list also holds any
branch the handler takes with `$meta.decide`, which is what lets a report group the points a branch
produced.

See: `order/orchestrator/order/orderOrderCreate.ts`

### 2. Optional Assertions in Handlers

Handlers destructure `assert` from `lib`, just like `checkpoint`. Both follow the same pattern:
`undefined` in production (zero-cost via `?.`), active in test/debug mode. No handler signature
changes needed — both are captured at definition time and used at call time.

```typescript
export default handler(
    ({lib: {assert}}) =>
        async function orderOrderCreate({items, customerId}, $meta) {
            assert?.ok(total > 0, 'Order total must be positive');
            $meta.checkpoint?.('total-calculated', {total});
        },
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

Soft checks that detect anomalies without breaking the flow. In production, they log warnings. In
tests, they can be verified.

See: `order/test/test/testOrderCanary.ts`

### 6. Progressive Verification Levels

The same handler code supports multiple verification levels:

| Level          | Assertions | Checkpoints | Invariants | Canaries |
| -------------- | ---------- | ----------- | ---------- | -------- |
| 0 — Production | off        | off         | off        | on       |
| 1 — Monitoring | off        | on          | off        | on       |
| 2 — Staging    | warn       | on          | warn       | on       |
| 3 — Debug      | throw      | on          | throw      | on       |
| 4 — Test       | assert     | on          | assert     | on       |

## Implementation

### Framework Changes

1. **`IMeta`** extended with `name?: string` and
   `progress?: Array<IProgressPoint | IProgressRegion>`, one list holding the points a handler
   announced and the branches it took, in the order it announced them
2. **`ILib`** extended with `checkpoint?: PointFn` (the ambient half of the pair, `undefined` in
   production) and `assert: IAssert | undefined`
3. **`checkpoint.ts`** — `AsyncLocalStorage`-based checkpoint function that finds the current
   `$meta`
4. **`Registry._createHandlers`** — creates checkpoint and assert based on `checkpointMode` config
5. **`layerProxy.ts` handler proxy** — wraps handler calls with `withMeta()` to bind `$meta` in
   `AsyncLocalStorage` for checkpoint recording

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

The `testDispatch` imports both test and order handlers so all calls resolve through its handler
proxy. This keeps the progress a handler announces on the same `$meta.progress` list as the test's
own assertions:

```typescript
activation: {
    integration: {
        namespace: ['test', 'order'],
        imports: ['order.test', 'order.order'],
    },
}
```

### How the scenarios run

The five scenarios are registered on the **browser** platform (`browser.ts`, under
`integration.watch.test`) and driven by `index.test.ts`, which is what `blong-dev test` runs. Their
steps call the order handlers, and those live on the server side of the realm, so each call crosses
to the server through the test client's backend adapter.

The login step is what establishes the bearer token those calls carry, so the scenarios open with
one and every authenticated step awaits it: the token is what the login _response_ delivered, and a
call sent before that response lands goes out without it. Three realms make that login possible, and
each is in `server.ts` for a stated reason:

- `srv` (blong-server) gives the realms their subject dispatch, and with it the
  `/rpc/ports/{namespace}/request` route a realm-to-realm call uses. Without it the login's call to
  the access realm answers 404.
- `access` is `blong-access-mock`, which answers `access.credential.check` from a constant. The real
  access realm would work too, but it brings a database and the framework realms the demo does not
  otherwise need.
- `login.login.methods` sets `sessionCreate`, `auditRecord` and `sessionCleanup` to `false`, so the
  login mints a stateless token and touches no session table. That is what keeps the demo
  database-free.

The scenarios log in by calling `loginTokenCreate` directly rather than through the codec realm's
`testLoginTokenCreate` helper: that helper resolves `loginTokenCreate` inside the codec namespace's
own port, where a suite that keeps its scenarios elsewhere has nothing to reach. The `index.ts`
entry point drives the same groups for the CLI:

```typescript
// index.test.ts — the tap runner (abridged; see the file for the platform load arguments)
const [serverPlatform, browserPlatform] = await Promise.all([
    load(serverSuite, 'handler-test-poc', 'handler-test-poc', intents, manifest),
    load(browserSuite, 'handler-test-poc', 'handler-test-poc', intents, manifest),
]);
await Promise.all([serverPlatform.start({}), browserPlatform.start({})]);
await tap.test('handler-test-poc scenarios', async (test: Test) => {
    await browserPlatform.test(test);
});
await Promise.all([serverPlatform.stop(), browserPlatform.stop()]);
```

## Structure

```text
handler-test-poc/
├── server.ts              # Suite server entry (enables checkpointMode)
├── browser.ts             # Suite browser entry (registers the five scenarios)
├── index.ts               # Suite entry: loads both platforms for the CLI
├── index.test.ts          # tap runner used by blong-dev test
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
