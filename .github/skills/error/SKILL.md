---
name: blong-error
description: Define and throw typed errors in Blong framework. Errors are defined in the error layer or inline, with support for parameterized messages, HTTP status codes, and error wrapping. Use when defining domain-specific errors, implementing validation, or handling error conditions with proper error types.
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
        throw errors['protocol.parser.request']({params: {command: name}});
    }
});
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

export default handler(({errors}) =>
    async function userUserFind({userId}, $meta) {
        const user = await db.findUser(userId);
        if (!user) {
            throw errors.userNotFound({
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

export default handler(({errors}) => ({
    async parkingPay({zone}) {
        try {
            // External API call or database operation
            return await processPayment(zone);
        } catch (cause) {
            throw errors.parkingInvalidZone({
                cause,
                params: {zone}
            });
        }
    }
}));
```

### Multiple Parameters

```typescript
throw errors.paymentInsufficientFunds({
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

## Error Access Patterns

### In Handlers

```typescript
export default handler(({errors}) =>
    async function handler(params, $meta) {
        if (!valid) throw errors.invalidInput();
    }
);
```

### In Library Functions

```typescript
export default library(({errors}) =>
    function validate(input) {
        if (!input) throw errors.validationFailed();
        return input;
    }
);
```

### In Inline Definitions

```typescript
export default handler(({lib: {error}}) => {
    const errors = error({
        'custom.error': 'Custom error message'
    });
    return {
        handler() {
            throw errors['custom.error']();
        }
    };
});
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

## Testing Errors

### Test Expected Errors

```typescript
// realmname/test/test/testValidation.ts
import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({
    lib: {rename},
    handler: {subjectNumberSum}
}) => ({
    testErrorHandling: ({name = 'error handling'}, $meta) =>
        rename([
            async function testNegativeNumber(assert, {$meta}) {
                await assert.rejects(
                    subjectNumberSum([-1], {
                        ...$meta,
                        expect: 'subjectSum'  // Expected error type
                    }) as Promise<unknown>,
                    {type: 'subjectSum'},
                    'Should reject negative numbers'
                );
            }
        ], name)
}));
```

### Test Error Parameters

```typescript
async function testUserNotFound(assert, {$meta}) {
    try {
        await userUserFind({userId: 999}, $meta);
        assert.fail('Should have thrown error');
    } catch (error) {
        assert.equal(error.type, 'userNotFound');
        assert.equal(error.params.userId, 999);
    }
}
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

## Common Patterns

### Validation Errors

```typescript
export default {
    'validation.required': 'Field {field} is required',
    'validation.invalid': 'Field {field} has invalid value',
    'validation.tooShort': 'Field {field} must be at least {min} characters',
    'validation.tooLong': 'Field {field} must be at most {max} characters',
    'validation.pattern': 'Field {field} must match pattern {pattern}',
};
```

### Database Errors

```typescript
export default {
    'db.notFound': 'Record not found: {table}.{id}',
    'db.duplicate': 'Duplicate entry for {field}: {value}',
    'db.constraint': 'Constraint violation: {constraint}',
    'db.connection': 'Database connection failed',
};
```

### External API Errors

```typescript
export default {
    'api.timeout': 'API request timed out after {timeout}ms',
    'api.unauthorized': {
        message: 'API authentication failed',
        statusCode: 401
    },
    'api.rateLimit': {
        message: 'API rate limit exceeded',
        statusCode: 429
    },
    'api.unavailable': {
        message: 'External service unavailable',
        statusCode: 503
    }
};
```

### Business Logic Errors

```typescript
export default {
    'payment.insufficientFunds': 'Insufficient funds: required {required}, available {available}',
    'payment.invalidAmount': 'Payment amount must be positive',
    'payment.limitExceeded': 'Transaction limit exceeded: {amount} > {limit}',
    'transfer.sameAccount': 'Cannot transfer to same account',
    'transfer.accountClosed': 'Account {accountId} is closed',
};
```

## Examples from Codebase

- **Simple errors:** `core/test/demo/error/error.ts`
- **Hierarchical errors:** `core/test/payshield/error/error.ts`
- **Library errors:** `core/test/ctp/adapter/payshield/_errors.ts`
- **Inline errors:** `core/test/parking/orchestrator/parking.ts`
- **Error throwing:** `core/test/demo/orchestrator/subject/sum.ts`
- **Error testing:** `core/test/demo/test/test/testNumberSum.ts`

## Integration with Framework

Errors integrate with:

- **Gateway Layer:** Automatic HTTP status code mapping
- **Validation:** Failed validation throws typed errors
- **$meta.expect:** Test expected error types
- **Logging:** Errors logged with full context
- **Monitoring:** Error types tracked for observability
