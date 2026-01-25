---
name: blong-validation
description: Define input/output validation for Blong handlers using TypeScript types or TypeBox schemas. Automatic validation generates OpenAPI documentation and runtime checks. Use when adding API parameter validation, generating API docs, or defining type-safe handler contracts.
---

# Implementing Validation

## Overview

Validation definitions are used for API documentation, parameter validation, and response construction. They can be automatically derived from TypeScript types or manually specified using TypeBox.

## Purpose

- **API Documentation:** Generate OpenAPI specs automatically
- **Parameter Validation:** Ensure inputs meet requirements
- **Response Validation:** Verify outputs match contracts
- **Type Safety:** Enforce contracts at runtime
- **Developer Experience:** Auto-completion and type checking

## Validation Approaches

### 1. Automatic Validation (Recommended)

- Define TypeScript `Handler` type
- Framework auto-generates validation schema
- Updates automatically when types change

### 2. Manual Validation

- Define validation using TypeBox
- Place in `gateway` layer
- Full control over validation rules

## Automatic Validation

### Step 1: Define Handler Type

```typescript
// realmname/orchestrator/entity/realmEntityAction.ts
import {IMeta, handler} from '@feasibleone/blong';

/** @description "Description for API documentation" */
type Handler = ({
    /** @description "Parameter 1 description" */
    param1: string;
    /** @description "Optional parameter description" */
    param2?: number;
    /** @description "Enum parameter" */
    status: 'active' | 'inactive';
}) => Promise<{
    /** @description "Result property description" */
    resultId: number;
    /** @description "Result message" */
    message: string;
}>;

export default handler(() =>
    async function realmEntityAction(
        params: Parameters<Handler>[0],
        $meta: IMeta
    ): ReturnType<Handler> {
        return {
            resultId: 123,
            message: 'Success'
        };
    }
);
```

### Step 2: Create ~.schema.ts

Place `~.schema.ts` file in the handler folder:

```typescript
// realmname/orchestrator/entity/~.schema.ts
/* eslint-disable indent,semi */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @rushstack/typedef-var */

import { validationHandlers } from '@feasibleone/blong'
import { Type, Static } from '@sinclair/typebox'

type realmEntityAction = Static<typeof realmEntityAction>
const realmEntityAction = Type.Function(
  [
    Type.Object({
      param1: Type.String({ description: 'Parameter 1 description' }),
      param2: Type.Optional(Type.Number({ description: 'Optional parameter description' })),
      status: Type.Union([
        Type.Literal('active'),
        Type.Literal('inactive')
      ], { description: 'Enum parameter' })
    })
  ],
  Type.Promise(
    Type.Object({
      resultId: Type.Number({ description: 'Result property description' }),
      message: Type.String({ description: 'Result message' })
    })
  ),
  { description: 'Description for API documentation' }
)

export default validationHandlers({
  realmEntityAction
})
```

**Note:** This file is auto-generated/updated by the framework when:

- File is older than handler files
- Handler types have changed
- Framework detects Handler type definitions

### Step 3: Configure Validation

```typescript
// In realmname/server.ts
config: {
    default: {
        orchestratorDispatch: {
            namespace: ['entity'],
            imports: ['realmname.entity'],
            // Reference validation explicitly:
            validations: ['realmname.entity.validation']
            // Or use regex to match multiple validation groups:
            validations: [/^realmname\.\w+\.validation$/]
        }
    }
}
```

**Regex Validation Patterns:**

The `validations` property can accept regex patterns to match multiple validation groups automatically:

```typescript
// Match all validation groups in realmname:
validations: [/^realmname\.\w+\.validation$/]

// Match specific pattern:
validations: [/^realmname\.(entity1|entity2)\.validation$/]

// Mix strings and regex:
validations: [
    'realmname.entity1.validation',
    /^realmname\.entity2\./
]
```

## Manual Validation

### Define in Gateway Layer

```typescript
// realmname/gateway/entity/realmEntityAction.ts
import {validation} from '@feasibleone/blong';

export default validation(({lib: {type}}) =>
    function realmEntityAction() {
        return {
            // Parameter validation
            params: type.Object({
                param1: type.String({
                    description: 'Parameter 1',
                    minLength: 3,
                    maxLength: 50
                }),
                param2: type.Optional(type.Number({
                    description: 'Optional number',
                    minimum: 0,
                    maximum: 100
                })),
                email: type.String({
                    format: 'email',
                    description: 'Email address'
                }),
                status: type.Union([
                    type.Literal('active'),
                    type.Literal('inactive')
                ])
            }),

            // Result validation
            result: type.Object({
                resultId: type.Number({description: 'ID'}),
                message: type.String({description: 'Message'})
            }),

            // Optional overrides
            description: 'Perform entity action',
            method: 'POST',              // HTTP method (default: POST)
            path: '/entity/action',      // Custom path
            auth: true,                  // Require authentication (default: true)
            tags: ['entity']             // OpenAPI tags
        };
    }
);
```

### Configure Manual Validation

```typescript
config: {
    default: {
        orchestratorDispatch: {
            namespace: ['entity'],
            imports: ['realmname.entity'],
            validations: ['realmname.gateway.entity']  // Gateway validation
        }
    }
}
```

## TypeBox Schema Builders

The `type` object provides TypeBox builders:

### Basic Types

```typescript
type.String({
    description: 'String value',
    minLength: 1,
    maxLength: 100,
    pattern: '^[a-zA-Z]+$'    // Regex pattern
})

type.Number({
    description: 'Number value',
    minimum: 0,
    maximum: 100,
    multipleOf: 5
})

type.Integer({
    description: 'Integer value',
    minimum: 1
})

type.Boolean({
    description: 'Boolean value'
})

type.Null()
```

### String Formats

```typescript
type.String({
    format: 'email'           // Email format
})

type.String({
    format: 'uri'             // URI format
})

type.String({
    format: 'date'            // ISO date (YYYY-MM-DD)
})

type.String({
    format: 'date-time'       // ISO datetime
})

type.String({
    format: 'uuid'            // UUID format
})
```

### Composite Types

```typescript
// Object
type.Object({
    prop1: type.String(),
    prop2: type.Number()
}, {
    description: 'Object type',
    additionalProperties: false
})

// Array
type.Array(type.String(), {
    description: 'Array of strings',
    minItems: 1,
    maxItems: 10
})

// Union (one of)
type.Union([
    type.Literal('option1'),
    type.Literal('option2'),
    type.Literal('option3')
])

// Enum
type.Enum({
    ACTIVE: 'active',
    INACTIVE: 'inactive'
})

// Tuple (fixed array)
type.Tuple([
    type.String(),
    type.Number(),
    type.Boolean()
])
```

### Optional and Nullable

```typescript
// Optional property (may be undefined)
type.Optional(type.String())

// Nullable (may be null)
type.Union([type.String(), type.Null()])

// Optional and nullable
type.Optional(type.Union([type.String(), type.Null()]))
```

### Complex Objects

```typescript
type.Object({
    // Nested object
    user: type.Object({
        id: type.Number(),
        name: type.String(),
        email: type.String({format: 'email'})
    }),

    // Array of objects
    items: type.Array(type.Object({
        id: type.Number(),
        name: type.String(),
        quantity: type.Number({minimum: 1})
    })),

    // Optional nested array
    tags: type.Optional(type.Array(type.String())),

    // Union type
    status: type.Union([
        type.Literal('pending'),
        type.Literal('approved'),
        type.Literal('rejected')
    ])
})
```

## Complete Examples

### User Creation Handler

```typescript
// user/orchestrator/user/userUserAdd.ts
import {IMeta, handler} from '@feasibleone/blong';

/** @description "Create a new user" */
type Handler = ({
    /** @description "Username (3-20 characters)" */
    username: string;
    /** @description "Email address" */
    email: string;
    /** @description "User role" */
    role: 'admin' | 'user' | 'guest';
    /** @description "User profile" */
    profile?: {
        firstName: string;
        lastName: string;
        age?: number;
    };
}) => Promise<{
    /** @description "Created user ID" */
    userId: number;
    /** @description "Username" */
    username: string;
    /** @description "Creation timestamp" */
    createdAt: string;
}>;

export default handler(({handler: {sqlUserAdd}}) =>
    async function userUserAdd(
        params: Parameters<Handler>[0],
        $meta: IMeta
    ): ReturnType<Handler> {
        const result = await sqlUserAdd(params, $meta);
        return {
            userId: result.userId,
            username: result.username,
            createdAt: new Date().toISOString()
        };
    }
);
```

### Manual Validation with Custom Rules

```typescript
// payment/gateway/transfer/paymentTransferCreate.ts
import {validation} from '@feasibleone/blong';

export default validation(({lib: {type}}) =>
    function paymentTransferCreate() {
        return {
            params: type.Object({
                fromAccount: type.String({
                    description: 'Source account number',
                    pattern: '^ACC[0-9]{6}$'
                }),
                toAccount: type.String({
                    description: 'Destination account number',
                    pattern: '^ACC[0-9]{6}$'
                }),
                amount: type.Number({
                    description: 'Transfer amount',
                    minimum: 0.01,
                    maximum: 1000000,
                    multipleOf: 0.01
                }),
                currency: type.String({
                    description: 'Currency code',
                    pattern: '^[A-Z]{3}$',
                    default: 'USD'
                }),
                reference: type.Optional(type.String({
                    description: 'Payment reference',
                    maxLength: 100
                })),
                metadata: type.Optional(type.Record(
                    type.String(),
                    type.Any()
                ))
            }),

            result: type.Object({
                transferId: type.String({
                    description: 'Transfer ID',
                    format: 'uuid'
                }),
                status: type.Literal('pending'),
                createdAt: type.String({format: 'date-time'})
            }),

            description: 'Create a new transfer',
            method: 'POST',
            path: '/transfer',
            tags: ['payment']
        };
    }
);
```

### Array Validation

```typescript
/** @description "Calculate average of numbers" */
type Handler = ({
    /** @description "Array of numbers" */
    numbers: number[];
}) => Promise<{
    /** @description "Average value" */
    average: number;
}>;
```

Generates:

```typescript
const handler = Type.Function(
  [
    Type.Object({
      numbers: Type.Array(Type.Number(), {
        description: 'Array of numbers'
      })
    })
  ],
  Type.Promise(
    Type.Object({
      average: Type.Number({ description: 'Average value' })
    })
  )
)
```

## Validation Configuration

### Overriding Defaults

```typescript
export default validation(({lib: {type}}) =>
    function handlerName() {
        return {
            params: type.Object({/* ... */}),
            result: type.Object({/* ... */}),

            // Override defaults
            auth: false,              // Disable authentication
            method: 'GET',            // Use GET instead of POST
            path: '/custom/path',     // Custom endpoint path
            description: 'Custom description',
            summary: 'Brief summary',
            tags: ['tag1', 'tag2'],
            deprecated: false,

            // Response codes
            responses: {
                '200': {
                    description: 'Success',
                    content: type.Object({/* ... */})
                },
                '400': {
                    description: 'Bad request'
                },
                '404': {
                    description: 'Not found'
                }
            }
        };
    }
);
```

## OpenAPI Generation

Validations automatically generate OpenAPI documentation:

### Endpoint Path Convention

**Automatic (from semantic triple):**

- Handler: `userUserAdd`
- Path: `/rpc/user/user/add`

**Manual override:**

```typescript
path: '/users'  // Use /users instead
```

### HTTP Method

**Default:** POST for all handlers

**Override:**

```typescript
method: 'GET'     // GET request
method: 'PUT'     // PUT request
method: 'DELETE'  // DELETE request
```

### OpenAPI Tags

Group endpoints in documentation:

```typescript
tags: ['user', 'authentication']
```

## Best Practices

1. **Use Automatic Validation:** Prefer automatic over manual when possible
2. **Descriptive JSDoc:** Include descriptions for all properties
3. **Validate Formats:** Use `format` for emails, URIs, dates, UUIDs
4. **Set Constraints:** Define min/max, minLength/maxLength, patterns
5. **Optional vs Required:** Make optional what should be optional
6. **Enums for Fixed Values:** Use unions/literals for fixed value sets
7. **Keep ~.schema.ts Updated:** Let framework regenerate it
8. **Document Errors:** Document possible error responses
9. **Consistent Types:** Use same types for same concepts across API
10. **Test Validation:** Verify validation catches invalid inputs

## Validation in Tests

Test that validation works:

```typescript
async function testValidation(assert, {$meta}) {
    // Should reject invalid email
    await assert.rejects(
        userUserAdd({
            username: 'test',
            email: 'invalid-email',
            role: 'user'
        }, $meta),
        'Validation should reject invalid email'
    );

    // Should accept valid input
    const result = await userUserAdd({
        username: 'test',
        email: 'test@example.com',
        role: 'user'
    }, $meta);

    assert.ok(result.userId);
}
```

## Examples from Codebase

- **Auto-validation:** `core/test/demo/orchestrator/subject/~.schema.ts`
- **Handler with types:** `core/test/demo/orchestrator/subject/subjectAge.ts`
- **Manual validation:** Check gateway folders in realms
