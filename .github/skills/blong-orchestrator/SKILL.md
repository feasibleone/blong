---
name: blong-orchestrator
description: Implement business logic coordination in Blong, decoupled from integration protocols. Orchestrators coordinate between adapters, define API namespaces, and become Kubernetes services. Use this skill whenever implementing business workflows, coordinating multiple adapter calls, adding business rules, defining new namespaces, or translating sequence diagrams to code — even without the word 'orchestrator'.
---

# Implementing an Orchestrator

## [CRITICAL_GUARDRAILS]

- **Business logic only, decoupled from protocols** — adapters handle integrations.
- **Call other orchestrators and adapters; never another realm's adapters directly.**
- **Always forward `$meta`** on every downstream call.
- **One namespace per orchestrator** (namespace → K8s service in microservice mode).
- **Domain errors + compensation** for distributed transactions (saga).
- **Co-locate `activation` config** in the orchestrator file — not the realm `server.ts`.

Canonical framework rules + archetypes:
`.github/skills/_shared/conventions.md` → `[CRITICAL_GUARDRAILS]`, `[ARCHETYPE: ORCHESTRATOR_DISPATCH]`,
`[CONFIG_EXAMPLE]`. For business workflows see **blong-handler**; for adapters see **blong-adapter**.

## File Structure

```
orchestrator/
├── dispatch.ts              # Orchestrator definition
├── entity1/                 # Handler group: realmname.entity1
│   ├── ~.schema.ts         # Auto-generated validation
│   ├── helper.ts           # Library function
│   ├── realmEntity1Add.ts  # Business handler
│   └── realmEntity1Edit.ts
└── entity2/                 # Handler group: realmname.entity2
    ├── ~.schema.ts
    ├── realmEntity2Find.ts
    └── validate.ts          # Library function
```

## Built-in Orchestrators

### 1. Dispatch Orchestrator

The most common orchestrator type. Enables calling attached handlers using configured namespaces, with optional fallback to another destination.

**Use Cases:**

- Standard business logic implementation
- Coordinating between different entities
- Fallback to database adapter when no handler exists

**Implementation:**

```typescript
// realmname/orchestrator/dispatch.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',

    // Co-located configuration (no need to add to server.ts)
    activation: {
        default: {
            namespace: ['entity1', 'entity2'],        // Namespaces to expose
            imports: ['realmname.entity1', 'realmname.entity2'],  // Handler groups
            validations: ['realmname.entity1.validation'],        // Validation groups
            destination: 'sql',                        // Fallback when no handler exists
            logLevel: 'info'
        }
    }
}));
```

### 2. Schedule Orchestrator

Invokes functionality based on predefined schedules using cron patterns.

**Use Cases:**

- Periodic batch processing
- Scheduled reports
- Cleanup tasks
- Health checks

**Implementation:**

```typescript
// realmname/orchestrator/schedule.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.schedule',

    activation: {
        default: {
            namespace: ['batch'],
            imports: ['realmname.batch'],
            schedule: {
                batchProcessDaily: '0 2 * * *',      // Run at 2 AM daily
                batchCleanup: '0 0 * * 0',           // Run at midnight on Sunday
                batchHealthCheck: '*/5 * * * *'      // Run every 5 minutes
            }
        }
    }
}
```

## Handler Implementation in Orchestrator

### Business Logic Handler

```typescript
// realmname/orchestrator/user/userUserAdd.ts
import {IMeta, handler} from '@feasibleone/blong';

type Handler = ({
    username: string;
    email: string;
    role: string;
}) => Promise<{
    userId: number;
    username: string;
}>;

export default handler(({
    lib: {
        validateEmail  // Library function
    },
    errors,
    handler: {
        sqlUserFind,   // Adapter handler
        sqlUserAdd     // Adapter handler
    }
}) =>
    async function userUserAdd(
        params: Parameters<Handler>[0],
        $meta: IMeta
    ): ReturnType<Handler> {
        // Validate input
        if (!validateEmail(params.email)) {
            throw errors.invalidEmail();
        }

        // Check if user exists
        const existing = await sqlUserFind({username: params.username}, $meta);
        if (existing.length > 0) {
            throw errors.userExists();
        }

        // Create user
        const result = await sqlUserAdd(params, $meta);

        return {
            userId: result.userId,
            username: result.username
        };
    }
);
```

### Library Function

```typescript
// realmname/orchestrator/user/validateEmail.ts
import {library} from '@feasibleone/blong';

export default library(() =>
    function validateEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
);
```

## Configuration Properties

`namespace`, `imports`, `destination`, `logLevel` — see the Dispatch `activation` above. Extras:

- `imports` / `validations` accept **regex** to match many groups: `imports: [/^realmname\./]`,
  `validations: [/^realmname\.\w+\.validation$/]`.

### Schedule-Specific Properties

```typescript
schedule: {
    namespace: ['batch'],
    imports: ['realmname.batch'],
    schedule: {
        handlerName1: '0 0 * * *',    // Cron pattern
        handlerName2: '*/15 * * * *'   // Every 15 minutes
    }
}
```

## Orchestration Patterns

### Simple Orchestration

Single adapter call with transformation:

```typescript
export default handler(({handler: {sqlUserFind}}) =>
    async function userUserGet(params, $meta) {
        const users = await sqlUserFind(params, $meta);
        return users.map(user => ({
            id: user.userId,
            name: user.username
        }));
    }
);
```

### Multi-Adapter Orchestration

Coordinate between multiple adapters:

```typescript
export default handler(({
    handler: {
        sqlUserFind,
        sqlPermissionFind,
        httpNotificationSend
    }
}) =>
    async function userUserGrantPermission(params, $meta) {
        // Get user
        const user = await sqlUserFind({userId: params.userId}, $meta);

        // Grant permission
        await sqlPermissionFind({
            userId: params.userId,
            permission: params.permission
        }, $meta);

        // Send notification
        await httpNotificationSend({
            email: user.email,
            subject: 'Permission Granted',
            body: `You have been granted ${params.permission}`
        }, $meta);

        return {success: true};
    }
);
```

### Cross-Realm Orchestration

Call orchestrators from other realms:

```typescript
export default handler(({
    handler: {
        paymentTransferPrepare,  // From payment realm
        ledgerAccountDebit,      // From ledger realm
        sqlTransactionCreate     // Local adapter
    }
}) =>
    async function transferMoneyBetweenAccounts(params, $meta) {
        // Create transaction record
        const tx = await sqlTransactionCreate(params, $meta);

        // Prepare payment
        const payment = await paymentTransferPrepare({
            transactionId: tx.id,
            amount: params.amount
        }, $meta);

        // Update ledger
        await ledgerAccountDebit({
            accountId: params.fromAccount,
            amount: params.amount,
            reference: payment.id
        }, $meta);

        return {
            transactionId: tx.id,
            paymentId: payment.id
        };
    }
);
```

### Saga Pattern (Distributed Transaction)

Implement compensation logic for failures:

```typescript
export default handler(({
    handler: {
        paymentTransferPrepare,
        ledgerAccountDebit,
        paymentTransferCommit,
        paymentTransferCancel,
        ledgerAccountCredit
    },
    errors
}) =>
    async function transferWithCompensation(params, $meta) {
        let payment, debit;

        try {
            // Step 1: Prepare payment
            payment = await paymentTransferPrepare(params, $meta);

            // Step 2: Debit account
            debit = await ledgerAccountDebit({
                accountId: params.fromAccount,
                amount: params.amount
            }, $meta);

            // Step 3: Commit payment
            await paymentTransferCommit({paymentId: payment.id}, $meta);

            return {success: true, paymentId: payment.id};

        } catch (error) {
            // Compensation: Undo what was done
            if (debit) {
                await ledgerAccountCredit({
                    accountId: params.fromAccount,
                    amount: params.amount
                }, $meta);
            }
            if (payment) {
                await paymentTransferCancel({paymentId: payment.id}, $meta);
            }
            throw errors.transferFailed({cause: error});
        }
    }
);
```

## Multiple Orchestrators Per Realm

When a realm has multiple concerns, create separate orchestrators — each co-locates its own config:

```typescript
// orchestrator/userDispatch.ts
export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {default: {namespace: ['user'], imports: ['realmname.user']}}
}));

// orchestrator/roleDispatch.ts
export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {default: {namespace: ['role'], imports: ['realmname.role']}}
}));

// orchestrator/permissionDispatch.ts
export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {default: {namespace: ['permission'], imports: ['realmname.permission']}}
}));
```

```
orchestrator/
├── userDispatch.ts
├── roleDispatch.ts
├── permissionDispatch.ts
├── user/
├── role/
└── permission/
```

## Best Practices

- **One namespace per orchestrator**; business logic only, no protocol detail.
- **Call current realms' adapters, any orchestrators, not other realms' adapters.**
- **Domain errors + saga compensation** for distributed transactions.
- **Extract shared logic to library functions**; minimal transformation.
- **Config over code** for destinations/fallbacks; `Handler` types for validation.
- **Test handlers** covering orchestration logic.

## Deployment Considerations

- Each orchestrator namespace becomes a Kubernetes service (microservice) or runs in-process
  (monolith) — same code. The framework ensures k8s handles the load balancing between the services.

## Examples from Codebase

- **Simple dispatch:** `core/test/demo/orchestrator/subjectDispatch.ts`
- **Multi-entity:** `ml/agreement/orchestrator/agreementDispatch.ts`
- **Complex workflow:** `ml/payment/orchestrator/`
