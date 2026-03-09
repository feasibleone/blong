---
name: blong-error
description: Define and throw typed errors in Blong framework. Errors are defined in the error layer or inline, with support for parameterized messages, HTTP status codes, and error wrapping. Make sure to use this skill whenever defining, throwing, or handling errors in Blong — including error.ts files, validation failures, domain-specific exceptions, or any 'throw' that needs a typed error.
---

# Implementing Error Management

## Overview

Typed errors in the Blong framework provide structured error handling with domain-specific error types, parameterized messages, and proper error propagation. Errors are defined once and thrown consistently throughout the codebase.

## Purpose

- **Type Safety:** Define errors with specific types for better catching
- **Parameterized Messages:** Include dynamic values in error messages
- **Error Wrapping:** Preserve original error context with `cause`
- **HTTP Status Codes:** Associate errors with HTTP response codes
- **Centralized Definitions:** Define errors in one place, use everywhere
- **Namespace Prefixes:** Avoid name collisions across realms

## Error Definition Approaches

### 1. Error Layer (Recommended)

Define errors in `error/error.ts` within a realm:

```typescript
// realmname/error/error.ts
export default {
    'entity.notFound': 'Entity not found',
    'entity.invalidInput': 'Invalid input: {field}',
    'entity.permissionDenied': 'Permission denied',
};
```

**Configuration:**

```typescript
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    children: ['./error', './adapter', './orchestrator'],
    config: {
        default: {}
    }
}));
```

The framework automatically loads `error/error.ts` and makes errors available via the `errors` property.

### 2. Inline Error Definition

Define errors within handlers using `lib.error`:

```typescript
// realmname/orchestrator/entity/handler.ts
import {handler} from '@feasibleone/blong';

export default handler(({lib: {error}}) => {
    const errors = error({
        'parking.invalidZone': 'Invalid zone'
    });

    return {
        parkingTest({zone}: {zone: string}) {
            if (!['blue', 'green'].includes(zone)) {
                throw errors['parking.invalidZone']();
            }
            return {zone, price: {blue: 2, green: 1}[zone]};
        },
    };
});
```

### 3. Library Error Definition

Define errors in library functions for reusable error sets:

```typescript
// realmname/adapter/protocol/_errors.ts
import {library} from '@feasibleone/blong';

export default library(({lib: {error}}) => ({
    errors: error({
        'protocol.parser.header': 'Cannot parse header pattern',
        'protocol.parser.request': 'Cannot parse request pattern for command: {command}',
        'protocol.parser.response': 'Cannot parse response pattern for command: {command}',
        'protocol.unknownResponseCode': 'Unknown response code: {code}',
        'protocol.notImplemented': 'Not implemented opcode: {opcode}',
    })
}));
```

**Usage:**

```typescript
// Import and use in other handlers
import {library} from '@feasibleone/blong';

export default library(({lib: {errors}}) => {
    // Use errors from library
    if (!pattern) {
        throw errors['protocol.parser.request']({
            params: {command: name}
        });
    }
});
```
## Referencing Errors in Handlers

The framework provides two ways to reference errors in handlers via destructuring: the simplified syntax (recommended) and the legacy dot notation syntax (for backwards compatibility).

### Simplified Syntax (Recommended)

Use camelCase variable names with "error" prefix. The framework automatically maps these to the corresponding dot-notation error keys:

```typescript
// release/orchestrator/job/releaseJobTrigger.ts
import {handler, IMeta} from '@feasibleone/blong';

export default handler(
    ({errors: {errorReleaseJobTrigger}}) =>
        async function releaseJobTrigger(
            params: unknown,
            $meta: IMeta
        ) {
            // Use the error
            throw errorReleaseJobTrigger({
                params: {jobName: 'test-job'}
            }, $meta);
        }
);
```

**Naming Convention:**
- Error key: `'release.jobTrigger'` → Variable: `errorReleaseJobTrigger`
- Error key: `'user.notFound'` → Variable: `errorUserNotFound`
- Error key: `'payment.insufficientFunds'` → Variable: `errorPaymentInsufficientFunds`

**Benefits:**
- Simpler, cleaner syntax
- No string quotes needed
- Better IDE autocomplete
- Case-insensitive matching (errorreleasjobtrigger works too)
- Less typing

### Legacy Dot Notation Syntax (Backwards Compatible)

Use the original dot notation with quoted strings:

```typescript
export default handler(
    ({errors: {'release.jobTrigger': errorReleaseJobTrigger}}) =>
        async function releaseJobTrigger(params, $meta) {
            throw errorReleaseJobTrigger({params: {jobName: 'test-job'}}, $meta);
        }
);
```

This syntax continues to work for backwards compatibility, but the simplified syntax is recommended for new code.

### Error Detection

The framework throws immediately when referencing non-existent errors, catching typos during destructuring:

```typescript
export default handler(
    ({errors: {errorUserNotFound, errorTypoInName}}) => // ❌ Throws immediately
        async function handler(params, $meta) {
            // Error: Error 'errorTypoInName' not found. Available errors: user.notFound, user.exists, ...
        }
);
```

This ensures bugs are caught early during development rather than at runtime.

### Multiple Errors

Destructure multiple errors in one statement:

```typescript
// Simplified syntax
export default handler(
    ({errors: {errorUserNotFound, errorUserInvalidEmail, errorUserExists}}) =>
        async function userUserAdd(params, $meta) {
            if (!params.email) throw errorUserInvalidEmail();
            
            const existing = await checkUser(params.username);
            if (existing) throw errorUserExists();
            
            // ... rest of logic
        }
);

// Legacy syntax (still supported)
export default handler(
    ({errors: {
        'user.notFound': errorUserNotFound,
        'user.invalidEmail': errorUserInvalidEmail,
        'user.exists': errorUserExists
    }}) =>
        async function userUserAdd(params, $meta) {
            // ... same logic
        }
);
```

### Direct Access (Without Destructuring)

You can also access errors directly without destructuring:

```typescript
export default handler(
    ({errors}) =>
        async function handler(params, $meta) {
            // Simplified syntax
            throw errors.errorUserNotFound();
            
            // Legacy syntax (still works)
            throw errors['user.notFound']();
        }
);
```
## Error Definition Patterns

### Simple Error (String Message)

```typescript
export default {
    'realm.errorType': 'Error message'
};
```

### Parameterized Error (Template Variables)

```typescript
export default {
    'user.notFound': 'User {userId} not found',
    'payment.insufficientFunds': 'Insufficient funds: required {required}, available {available}',
    'validation.fieldRequired': 'Field {fieldName} is required',
};
```

### Advanced Error (Object with Properties)

```typescript
export default {
    'gateway.jwtMissingHeader': {
        message: 'Missing bearer authorization header',
        statusCode: 401
    },
    'gateway.unauthorized': {
        message: 'Unauthorized access',
        statusCode: 401
    },
    'gateway.forbidden': {
        message: 'Forbidden: {reason}',
        statusCode: 403
    },
    'gateway.notFound': {
        message: 'Resource not found',
        statusCode: 404
    }
};
```

### Complex Error Definitions

```typescript
export default {
    // Simple error
    'hsm.generic': 'HSM generic error',

    // Hierarchical naming
    'hsm.notConnected': 'No connection to HSM',
    'hsm.timeout': 'HSM timed out',

    // Parameterized errors
    'hsm.missingParameters': 'Missing parameters',
    'hsm.invalidParameters': 'Invalid parameters',

    // Method-specific errors
    'hsm.badArqcMethod': 'Bad ARQC method',

    // Protocol-specific errors with codes
    'payshield.01': 'Verification failure or warning of imported key parity error',
    'payshield.generateArqc3.01': 'ARQC/TC/AAC verification failed',
    'payshield.generateArqc4.01': 'ARQC/TC/AAC/MPVV verification failure',

    // Validation errors
    'payshield.decryptDataBlock.02': 'Invalid Mode Flag field',
    'payshield.encryptDataBlock.03': 'Invalid Input Format Flag field',
};
```

## Throwing Errors

### Basic Error Throw

```typescript
import {library} from '@feasibleone/blong';

export default library(({errors}) =>
    function sum(params: number[]) {
        return params.reduce((prev, cur) => {
            if (cur < 0) throw errors.subjectSum();
            return prev + cur;
        }, 0);
    }
);
```

### Parameterized Error Throw

```typescript
import {handler} from '@feasibleone/blong';

export default handler(({errors: {errorUserNotFound}}) =>
    async function userUserFind({userId}, $meta) {
        const user = await db.findUser(userId);
        if (!user) {
            throw errorUserNotFound({
                params: {userId}
            });
        }
        return user;
    }
);
```

### Error with Cause (Error Wrapping)

```typescript
import {handler} from '@feasibleone/blong';

export default handler(({errors: {errorParkingInvalidZone}}) => ({
    async parkingPay({zone}) {
        try {
            // External API call or database operation
            return await processPayment(zone);
        } catch (cause) {
            throw errorParkingInvalidZone({
                cause,
                params: {zone}
            });
        }
    }
}));
```

### Multiple Parameters

```typescript
// Assuming errorPaymentInsufficientFunds is destructured from errors
throw errorPaymentInsufficientFunds({
    params: {
        required: 100.50,
        available: 75.25,
        accountId: '12345'
    }
});
```

## Naming Conventions

### Namespace Prefix

Always use namespace prefixes to avoid collisions:

- ✅ `'user.notFound'`
- ✅ `'payment.insufficientFunds'`
- ✅ `'validation.fieldRequired'`
- ❌ `'notFound'` (too generic)

### Hierarchical Naming

Use dots to create hierarchy:

```typescript
export default {
    // Top level
    'hsm.generic': 'HSM error',

    // Category level
    'hsm.connection.timeout': 'Connection timeout',
    'hsm.connection.refused': 'Connection refused',

    // Operation level
    'hsm.operation.generateKey.failed': 'Key generation failed',
    'hsm.operation.verifyPin.invalid': 'PIN verification failed',
};
```

### Protocol/Method-Specific Errors

For protocol implementations, include operation and error code:

```typescript
export default {
    'payshield.generateKey.01': 'Key generation error code 01',
    'payshield.verifyPin.02': 'PIN verification error code 02',
    'iso8583.field.missing': 'Required field missing',
    'iso8583.field.invalid': 'Invalid field format',
};
```

## File Structure

### Recommended Structure

```
realmname/
├── server.ts
├── error/
│   └── error.ts              # Realm-wide error definitions
├── adapter/
│   ├── protocol.ts
│   └── protocol/
│       └── _errors.ts        # Protocol-specific errors (library)
└── orchestrator/
    ├── dispatch.ts
    └── entity/
        └── handler.ts        # May throw errors from error layer
```

### Error Layer Example

```typescript
// user/error/error.ts
export default {
    // User entity errors
    'user.notFound': 'User {userId} not found',
    'user.alreadyExists': 'User {username} already exists',
    'user.invalidEmail': 'Invalid email address: {email}',

    // Role entity errors
    'role.notFound': 'Role {roleId} not found',
    'role.insufficientPermissions': 'Insufficient permissions for operation',

    // Authentication errors
    'auth.invalidCredentials': {
        message: 'Invalid username or password',
        statusCode: 401
    },
    'auth.tokenExpired': {
        message: 'Authentication token expired',
        statusCode: 401
    },
    'auth.forbidden': {
        message: 'Access forbidden: {reason}',
        statusCode: 403
    }
};
```

## Best Practices

1. **Use Error Layer:** Define errors in `error/error.ts` for realm-wide access
2. **Namespace Prefixes:** Always prefix errors with realm/entity name
3. **Parameterize Messages:** Use `{param}` syntax for dynamic values
4. **Wrap External Errors:** Use `cause` to preserve error context
5. **HTTP Status Codes:** Include `statusCode` for gateway errors
6. **Hierarchical Names:** Use dots for logical grouping
7. **Descriptive Messages:** Make error messages actionable
8. **Consistent Naming:** Follow `realm.entity.action` pattern
9. **Document Error Codes:** Add comments for protocol-specific errors
10. **Test Error Paths:** Write tests for error conditions

## Examples from Codebase

- **Simple errors:** `core/test/demo/error/error.ts`
- **Hierarchical errors:** `core/test/payshield/error/error.ts`
- **Library errors:** `core/test/ctp/adapter/payshield/_errors.ts`
- **Inline errors:** `core/test/parking/orchestrator/parking.ts`
- **Error throwing:** `core/test/demo/orchestrator/subject/sum.ts`
- **Error testing:** `core/test/demo/test/test/testNumberSum.ts`
