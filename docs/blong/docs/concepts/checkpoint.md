# Checkpoint

A checkpoint is a framework-provided function that records progress through
multi-step operations. Checkpoints serve different purposes depending on the
execution context:

- **In tests:** Checkpoints drive assertions and test reporting, capturing
  intermediate states for verification.
- **In debug/staging:** Checkpoints emit structured log entries that feed
  distributed tracing and observability systems.
- **In production:** Checkpoints are disabled via optional chaining (`?.`),
  resulting in zero runtime overhead.

## Motivation

Long-running handlers and test chains share a common need: visibility into
what happened at each stage of a multi-step operation. Without checkpoints,
debugging a failed handler requires sifting through logs, and debugging a
failed test requires adding temporary assertions.

Checkpoints provide a single mechanism that serves both needs — tracing for
production and assertions for tests — without duplicating logic.

## Usage

### In Handlers

Handlers access `checkpoint` through the `lib` parameter. Since `checkpoint`
may be `undefined` in production, always use optional chaining:

```typescript
import {handler, type IMeta} from '@feasibleone/blong';

export default handler(({lib: {checkpoint}, handler: {accountGet, transferCreate}}) =>
    async function paymentTransferExecute(
        {accountId, amount}: {accountId: string; amount: number},
        $meta: IMeta,
    ) {
        const account = await accountGet({id: accountId}, $meta);
        checkpoint?.('account-loaded', {accountId: account.id, balance: account.balance});

        if (account.balance < amount) throw new Error('Insufficient funds');
        checkpoint?.('balance-verified', {available: account.balance, requested: amount});

        const transfer = await transferCreate({amount, from: account.id}, $meta);
        checkpoint?.('transfer-created', {transferId: transfer.id});

        return {transferId: transfer.id, state: transfer.state};
    }
);
```

### In Tests

Tests can assert on checkpoints captured during handler execution:

```typescript
import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {paymentTransferExecute}}) => ({
    testPaymentCheckpoints: ({name = 'payment checkpoints'}, $meta) =>
        group(name)([
            async function executeAndVerify(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const result = await paymentTransferExecute(
                    {accountId: 'acc-1', amount: 100},
                    $meta,
                );
                assert.ok(result.transferId, 'Transfer created');

                // Verify checkpoints recorded during execution
                const checkpoints = $meta.checkpoints;
                assert.equal(checkpoints.length, 3);
                assert.equal(checkpoints[0].name, 'account-loaded');
                assert.equal(checkpoints[1].name, 'balance-verified');
                assert.equal(checkpoints[2].name, 'transfer-created');
            },
        ]),
}));
```

### Checkpoint Data

Each checkpoint records:

- **`name`** — A descriptive string identifying the checkpoint
  (e.g., `'account-loaded'`, `'transfer-created'`).
- **`data`** — An optional object with relevant state at that point.
- **`timestamp`** — Automatically added by the framework.

## Modes

| Environment | `checkpoint` value | Behavior |
|-------------|-------------------|----------|
| Production | `undefined` | No-op via `?.` — zero overhead |
| Monitoring | logging function | Emits structured log entries |
| Debug | tracing function | Records data + timestamps in `$meta.checkpoints` |
| Test | recording function | Records data for test assertions |

The mode is controlled by configuration — no code changes needed.

## Relationship to Handlers and Tests

Checkpoints are a key element of the
[unified handler-test concept](../rationale/unified-handler-test). They blur
the line between handlers and tests:

- A handler with checkpoints **is already instrumented for testing** —
  tests can call it and verify the checkpoint sequence.
- A test with checkpoints **is already instrumented for production** —
  when the test graduates to a handler, the checkpoints become
  observability points.

See the [handler-test POC suite](/docs/concepts/handler-test-poc) for
working examples.

## Related Concepts

- [Handler](../patterns/handler) — Checkpoint usage in handlers
- [Test](../patterns/test) — Checkpoint usage in tests
- [Unified Handler-Test](../rationale/unified-handler-test) — Design rationale
