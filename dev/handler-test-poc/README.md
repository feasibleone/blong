# Handler-Test POC Suite

Proof of concept exploring the **unified handler-test concept** — blending
handlers and tests into a continuum rather than keeping them as separate
concerns.

## Concepts Demonstrated

### 1. Checkpoint-Enabled Handlers

Handlers use `checkpoint?.()` to record progress through multi-step
operations. The optional chaining ensures zero overhead in production.

See: `order/orchestrator/order/orderOrderCreate.ts`

### 2. Optional Assertions in Handlers

Handlers accept an optional `assert?` parameter. In test mode, assertions
are active. In production, they are no-ops via optional chaining.

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
- Discount boundary behavior at exactly 100

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

## Structure

```
handler-test-poc/
├── server.ts              # Suite server entry
├── browser.ts             # Suite browser entry
├── index.ts               # API test entry
└── order/                 # Order realm
    ├── server.ts          # Realm definition
    ├── browser.ts         # Realm browser entry
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
        ├── testDispatch.ts
        ├── mock/                         # (mock handlers go here)
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

See `docs/blong/docs/rationale/unified-handler-test.md` for the full design.
