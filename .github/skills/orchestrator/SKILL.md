---
name: blong-orchestrator
description: Implement business logic coordination in Blong, decoupled from integration protocols. Orchestrators coordinate between adapters, define API namespaces, and become Kubernetes services. Use for business workflows, multi-adapter coordination, saga patterns, or when implementing sequence diagrams.
---

# Implementing an Orchestrator

## Overview

Orchestrators provide an intermediate point in the architecture where business logic is implemented, decoupled from integration protocols and APIs. They coordinate work between adapters and define API namespaces.

## Purpose

- **Business Logic:** Implement business processes and workflows
- **Protocol Independence:** Decouple business logic from integration details
- **Service Discovery:** Define namespaces that become Kubernetes services
- **Coordination:** Orchestrate calls between adapters and other orchestrators
- **Distributed Transactions:** Enable saga/orchestration patterns for microservices

## When to Use

- Implementing business process workflows (sequence diagrams)
- Coordinating multiple adapter calls
- Implementing business rules and validations
- Creating reusable business operations
- Each orchestrator typically handles one namespace

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

export default orchestrator(() => ({
    extends: 'orchestrator.dispatch'
}));
```

**Configuration:**

```typescript
// In realmname/server.ts
config: {
    default: {
        dispatch: {
            namespace: ['entity1', 'entity2'],        // Namespaces to expose
            imports: ['realmname.entity1', 'realmname.entity2'],  // Handler groups
            validations: ['realmname.entity1.validation'],        // Validation groups
            destination: 'sql',                        // Fallback when no handler exists
            logLevel: 'info'
        }
    }
}
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

export default orchestrator(() => ({
    extends: 'orchestrator.schedule'
}));
```

**Configuration:**

```typescript
config: {
    default: {
        schedule: {
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

### Common Properties

```typescript
orchestratorname: {
    // Prefixes for calling orchestrator API
    namespace: ['entity1', 'entity2'],

    // Handler groups to attach (string or regex)
    imports: ['realmname.entity1', 'realmname.entity2'],
    // Or use regex to match multiple groups:
    imports: [/^realmname\./],

    // Validation groups to attach (string or regex)
    validations: ['realmname.entity1.validation'],
    // Or use regex:
    validations: [/^realmname\.\w+\.validation$/],

    // Fallback destination when no handler exists
    destination: 'sql',

    // Log level (trace, debug, info, warn, error, fatal)
    logLevel: 'info'
}
```

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

When a realm has multiple concerns, create separate orchestrators:

```typescript
// realmname/server.ts
config: {
    default: {
        userDispatch: {
            namespace: ['user'],
            imports: ['realmname.user']
        },
        roleDispatch: {
            namespace: ['role'],
            imports: ['realmname.role']
        },
        permissionDispatch: {
            namespace: ['permission'],
            imports: ['realmname.permission']
        }
    }
}
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

1. **One Namespace Per Orchestrator:** Keep orchestrators focused on a single business entity
2. **Protocol Independence:** Don't reference protocol-specific details (HTTP, TCP, etc.)
3. **Business Logic Only:** Keep technical concerns in adapters
4. **Call Adapters, Not Other Realms' Adapters:** Call other orchestrators, not their adapters directly
5. **Error Handling:** Use domain errors, implement compensation for distributed transactions
6. **Reusable Functions:** Extract common logic to library functions
7. **Minimal Transformation:** Do necessary business transformations, not format conversions
8. **Configuration Over Code:** Use configuration for destinations and fallbacks
9. **Type Safety:** Define Handler types for automatic validation
10. **Testing:** Write comprehensive test handlers for orchestration logic

## Deployment Considerations

- **Microservices:** Each orchestrator becomes a Kubernetes service
- **Monolith:** All orchestrators run in single process
- **Service Discovery:** Namespace becomes service name in Kubernetes
- **Load Balancing:** Framework handles load balancing between orchestrators
- **Scaling:** Orchestrators can scale independently

## Examples from Codebase

- **Simple dispatch:** `core/test/demo/orchestrator/subjectDispatch.ts`
- **Multi-entity:** `ml/agreement/orchestrator/agreementDispatch.ts`
- **Complex workflow:** `ml/payment/orchestrator/`
