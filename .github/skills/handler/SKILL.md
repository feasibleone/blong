---
name: blong-handler
description: Create API handlers and library functions in Blong using semantic triple naming (subjectObjectPredicate). Handlers implement business operations, protocol tasks, or reusable logic. Use when creating API endpoints, implementing business logic, defining library functions, or working with adapter loops.
---

# Implementing Handlers

## Overview

Handlers are functions called by adapters and orchestrators to implement functionality. They follow the framework's conventions for naming, parameter passing, and interoperability.

## Purpose

- **Business Logic:** Implement specific business operations
- **API Implementation:** Expose business functionality through semantic names
- **Reusable Functions:** Share common logic via library functions
- **Protocol Handling:** Implement adapter loop handlers (send, receive, encode, decode)
- **Type Safety:** Define types for automatic validation

## Handler Types

### 1. Internal Handlers

Predefined handlers for adapter/protocol operations:

- **`send`** - Prepare data for sending, adapt for protocol
- **`receive`** - Transform received data, remove protocol details
- **`encode`** - Convert JavaScript object to Buffer (TCP)
- **`decode`** - Convert Buffer to JavaScript object (TCP)
- **`exec`** - Default handler when no specific handler exists
- **`ready`** - Called when adapter is ready
- **`idleSend`** - Send keep-alive message
- **`idleReceive`** - Handle idle timeout
- **`drainSend`** - Called when send queue is empty

### 2. API Handlers

Business functionality using semantic triple naming

### 3. Library Functions

Reusable functions shared between handlers

## Naming Convention: Semantic Triples

API handlers use `subjectObjectPredicate` format:

- **subject** - namespace/realm name
- **object** - entity within realm
- **predicate** - action on entity

### Examples

| Handler Name | Subject | Object | Predicate | Purpose |
|-------------|---------|--------|-----------|---------|
| `userUserAdd` | user | user | add | Create a user |
| `userRoleEdit` | user | role | edit | Edit a role |
| `paymentTransferPrepare` | payment | transfer | prepare | Prepare transfer |
| `mathNumberSum` | math | number | sum | Sum numbers |

### Realm Structure Example

Realm: `user` with namespaces `identity`, `permission`, `user`

```
user/
├── orchestrator/
│   ├── identityDispatch.ts
│   ├── permissionDispatch.ts
│   ├── userDispatch.ts
│   ├── identity/
│   │   ├── identityTokenCreate.ts
│   │   └── identityTokenValidate.ts
│   ├── permission/
│   │   ├── permissionUserCheck.ts
│   │   └── permissionRoleGrant.ts
│   └── user/
│       ├── userUserAdd.ts
│       ├── userUserEdit.ts
│       ├── userUserFind.ts
│       └── userRoleEdit.ts
```

## Handler Pattern

### Basic Handler

```typescript
// realmname/orchestrator/entity/realmEntityAction.ts
import {IMeta, handler} from '@feasibleone/blong';

// Define type for automatic validation
type Handler = ({
    param1: string;
    param2: number;
}) => Promise<{
    result: string;
}>;

export default handler(({
    lib: {
        helperFunction    // Library function
    },
    errors,               // Domain errors
    config,               // Configuration
    handler: {
        adapterHandler,   // Other handlers
        otherHandler
    }
}) =>
    async function realmEntityAction(
        params: Parameters<Handler>[0],
        $meta: IMeta
    ): ReturnType<Handler> {
        // Implementation
        const processed = helperFunction(params.param1);

        const result = await adapterHandler({
            data: processed,
            count: params.param2
        }, $meta);

        return {
            result: result.value
        };
    }
);
```

### Library Function

```typescript
// realmname/orchestrator/entity/helperFunction.ts
import {library} from '@feasibleone/blong';

export default library(({errors}) =>
    function helperFunction(input: string): string {
        if (!input) {
            throw errors.invalidInput();
        }
        return input.toUpperCase();
    }
);
```

## API Parameter: Destructuring

The `api` parameter provides access to framework and realm functionality:

### Available Properties

```typescript
handler(({
    // Framework libraries
    lib: {
        error,          // Error factory
        type,           // TypeBox (for manual validation)
        bitsyntax,      // Binary protocol parser
        sum,            // User-defined library function
        rename          // Rename test arrays
    },

    // Domain errors (defined in error layer)
    errors: {
        entityNotFound,
        invalidInput,
        permissionDenied
    },

    // Configuration for this component
    config: {
        timeout,
        maxRetries,
        apiKey
    },

    // Logger instance
    log,

    // Other handlers (from imports)
    handler: {
        sqlUserFind,
        httpNotificationSend,
        otherRealmHandler
    }
}) => {
    // Return handler function
})
```

## File Organization

### One Handler Per File

**Benefits:**

1. Fast discovery: `ctrl+p uua` finds `userUserAdd.ts`
2. Easier code review
3. Clear boundaries
4. Git-friendly diffs

**Convention:**

- File name = handler name
- `userUserAdd.ts` exports `userUserAdd` handler
- `validateEmail.ts` exports `validateEmail` library function

### Folder Structure

```
orchestrator/
├── dispatch.ts
└── entity/
    ├── ~.schema.ts              # Auto-validation
    ├── helperLib.ts             # Library function
    ├── realmEntityAction1.ts    # Handler
    ├── realmEntityAction2.ts    # Handler
    └── realmEntityAction3.ts    # Handler
```

Group name: `realmname.entity` (referenced in `imports`)

## Complete Examples

### Orchestrator Handler with Validation

```typescript
// user/orchestrator/user/userUserAdd.ts
import {IMeta, handler} from '@feasibleone/blong';

/** @description "Create a new user" */
type Handler = ({
    /** @description "Username" */
    username: string;
    /** @description "Email address" */
    email: string;
    /** @description "User role" */
    role: string;
}) => Promise<{
    /** @description "Created user ID" */
    userId: number;
    /** @description "Username" */
    username: string;
}>;

export default handler(({
    lib: {validateEmail},
    errors,
    handler: {sqlUserFind, sqlUserAdd}
}) =>
    async function userUserAdd(
        params: Parameters<Handler>[0],
        $meta: IMeta
    ): ReturnType<Handler> {
        // Validate
        if (!validateEmail(params.email)) {
            throw errors.invalidEmail();
        }

        // Check existence
        const existing = await sqlUserFind(
            {username: params.username},
            $meta
        );
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

### Library Function with Error Handling

```typescript
// user/orchestrator/user/validateEmail.ts
import {library} from '@feasibleone/blong';

export default library(() =>
    function validateEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
);
```

### Adapter Handler

```typescript
// user/adapter/db/userAdd.ts
import {IMeta, handler} from '@feasibleone/blong';

type Handler = ({
    username: string;
    email: string;
    role: string;
}) => Promise<{
    userId: number;
    username: string;
}>;

export default handler(({errors}) =>
    async function userAdd(
        params: Parameters<Handler>[0],
        $meta: IMeta
    ): ReturnType<Handler> {
        // Call stored procedure
        const result = await $meta.connection.raw(
            'CALL user_add(?, ?, ?)',
            [params.username, params.email, params.role]
        );

        if (!result.rows[0]) {
            throw errors.userCreateFailed();
        }

        return {
            userId: result.rows[0].user_id,
            username: result.rows[0].username
        };
    }
);
```

### TCP Encode Handler

```typescript
// hsm/adapter/tcp/encode.ts
import {handler} from '@feasibleone/blong';

export default handler(({lib: {bitsyntax}, config}) =>
    function encode(message) {
        const command = message.command.padEnd(2, ' ');
        const data = message.data || '';
        const payload = command + data;

        const header = bitsyntax.build(
            config.headerFormat,
            {value: payload.length}
        );

        return Buffer.concat([
            header,
            Buffer.from(payload, 'ascii')
        ]);
    }
);
```

### HTTP Send Handler

```typescript
// api/adapter/http/send.ts
import {handler} from '@feasibleone/blong';

export default handler(({config}) =>
    function send(params, $meta) {
        return {
            ...params,
            headers: {
                'Authorization': `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json'
            },
            timestamp: new Date().toISOString()
        };
    }
);
```

## Calling Other Handlers

### From Orchestrator

```typescript
export default handler(({
    handler: {
        sqlUserFind,           // Database adapter
        paymentTransferCreate, // Other orchestrator
        httpNotificationSend   // HTTP adapter
    }
}) =>
    async function userUserNotify(params, $meta) {
        const user = await sqlUserFind({userId: params.userId}, $meta);

        const payment = await paymentTransferCreate({
            userId: params.userId,
            amount: 100
        }, $meta);

        await httpNotificationSend({
            email: user.email,
            subject: 'Payment Created',
            body: `Payment ${payment.id} created`
        }, $meta);

        return {success: true};
    }
);
```

### Using $meta

The `$meta` parameter carries context:

```typescript
async function handlerName(params, $meta) {
    // Call with original context
    await otherHandler(params, $meta);

    // Override method
    await adapterHandler(params, {
        ...$meta,
        method: 'specificOperationId'
    });

    // Expect specific error
    await riskyHandler(params, {
        ...$meta,
        expect: 'expectedErrorType'
    });
}
```

## Error Handling

### Throwing Domain Errors

```typescript
export default handler(({errors}) =>
    async function userUserFind(params, $meta) {
        if (!params.userId) {
            throw errors.invalidInput({
                field: 'userId',
                reason: 'required'
            });
        }

        const user = await sqlUserFind({id: params.userId}, $meta);

        if (!user) {
            throw errors.userNotFound({userId: params.userId});
        }

        return user;
    }
);
```

### Wrapping External Errors

```typescript
export default handler(({errors}) =>
    async function callExternalAPI(params, $meta) {
        try {
            return await externalApiCall(params, $meta);
        } catch (error) {
            if (error.code === 'TIMEOUT') {
                throw errors.externalTimeout({cause: error});
            }
            throw errors.externalError({
                message: error.message,
                cause: error
            });
        }
    }
);
```

## Configuration Access

```typescript
export default handler(({config}) =>
    async function processWithTimeout(params, $meta) {
        const timeout = config.timeout || 5000;

        return Promise.race([
            actualProcessing(params, $meta),
            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error('Timeout')),
                    timeout
                )
            )
        ]);
    }
);
```

## Automatic Validation

### Define Handler Type

```typescript
/** @description "Description for API docs" */
type Handler = ({
    /** @description "Parameter description" */
    param1: string;
    param2?: number;  // Optional parameter
}) => Promise<{
    /** @description "Result description" */
    result: string;
}>;
```

### Create ~.schema.ts

Place `~.schema.ts` in handler folder:

- Auto-regenerates when handler types change
- Provides validation schemas
- Generates API documentation

### Use Types in Handler

```typescript
export default handler(() =>
    async function handlerName(
        params: Parameters<Handler>[0],
        $meta: IMeta
    ): ReturnType<Handler> {
        // Type-safe implementation
        return {result: params.param1.toUpperCase()};
    }
);
```

## Best Practices

1. **Semantic Naming:** Use subject-object-predicate consistently
2. **One Handler Per File:** Easier navigation and review
3. **Type Definitions:** Define Handler types for validation
4. **Library Functions:** Extract reusable logic
5. **Error Handling:** Use domain errors, not generic exceptions
6. **Async by Default:** Framework converts all handlers to async
7. **$meta Propagation:** Always pass $meta to handler calls
8. **Minimal Dependencies:** Import only what you need from api
9. **Documentation:** Use JSDoc descriptions in types
10. **Test Coverage:** Write test handlers for all business handlers

## Handler Conversion

All handlers are converted to async functions:

```typescript
// Synchronous handler
export default handler(() =>
    function syncHandler(params) {
        return {result: 'done'};
    }
);

// Framework converts to:
async function syncHandler(params) {
    return {result: 'done'};
}
```

## Examples from Codebase

- **API handler:** `core/test/demo/orchestrator/subject/subjectNumberSum.ts`
- **Library function:** `core/test/demo/orchestrator/subject/sum.ts`
- **Adapter handler:** `core/test/demo/adapter/http.ts`
- **TCP codec:** `core/test/payshield/adapter/tcp/encode.ts`
- **Multiple handlers:** `ml/payment/orchestrator/transfer/`
