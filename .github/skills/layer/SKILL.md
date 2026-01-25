---
name: blong-layer
description: Organize handlers into named functional groups within a Blong realm. Layers include gateway (API), adapter (external systems), orchestrator (business logic), error (domain errors), and test (automation). Use when organizing code by functional concern, defining handler groups, or controlling deployment activation.
---

# Implementing a Layer

## Overview

Layers are named groups of handlers that organize code by functional concern within a realm. They enable clear separation of responsibilities and support the framework's modular architecture.

## Purpose

- **Separation of Concerns:** Group related functionality together
- **Code Organization:** Clear folder structure for handlers
- **Deployment Control:** Layers can be activated/deactivated per environment
- **Team Coordination:** Different teams can work on different layers

## Recommended Layer Names

### Server-Side Layers

- **`gateway`** - API gateway: routes, validation, documentation (minimal business logic)
- **`adapter`** - External system communication: SQL, HTTP, FTP, mail protocols
- **`orchestrator`** - Business process coordination between adapters
- **`error`** - Domain-specific error definitions
- **`test`** - Test automation (dev/build only)
- **`eft`** - Electronic Funds Transfer (high TPS OLTP requirements)

### Browser-Side Layers

- **`backend`** - Browser adapter talking to server
- **`component`** - React UI components
- **`browser`** - Server-side code serving browser assets

## Folder Structure

### Typical Realm with Layers

```
realmname/
├── server.ts                 # Realm entry point
├── error/                    # Error layer
│   └── error.ts             # Error definitions
├── adapter/                  # Adapter layer
│   ├── db.ts                # Database adapter
│   ├── http.ts              # HTTP adapter
│   └── db/                  # Handler group: realmname.db
│       ├── userUserAdd.ts
│       └── userUserFind.ts
├── orchestrator/             # Orchestrator layer
│   ├── dispatch.ts          # Orchestrator entry
│   ├── user/                # Handler group: realmname.user
│   │   ├── userUserAdd.ts
│   │   ├── userUserEdit.ts
│   │   └── validateUser.ts  # Library function
│   └── role/                # Handler group: realmname.role
│       ├── userRoleAdd.ts
│       └── userRoleFind.ts
├── gateway/                  # Gateway layer
│   └── api/
│       └── user.yaml        # OpenAPI specs
└── test/                     # Test layer
    └── test/                 # Handler group: test.test
        ├── testUserAdd.ts
        └── testUserRole.ts
```

## Handler Group Pattern

### Group Naming Convention

Groups are named in format: `realmname.foldername`

Example:

- Realm: `user`
- Folder: `orchestrator/user/`
- Group name: `user.user`

### Referencing Groups

Groups are referenced in the `imports` property:

```typescript
config: {
    default: {
        userDispatch: {
            namespace: ['user'],
            imports: ['user.user', 'user.role']
        }
    }
}
```

## Implementation Patterns

### Error Layer

```typescript
// realmname/error/error.ts
export default {
    userNotFound: 'User not found',
    userExists: 'User already exists',
    invalidEmail: 'Invalid email format',
    permissionDenied: 'Permission denied'
};
```

### Adapter Layer Structure

```
adapter/
├── db.ts              # Database adapter definition
├── http.ts            # HTTP adapter definition
├── db/                # Handler group for db operations
│   ├── userAdd.ts
│   └── userFind.ts
└── http/              # Handler group for HTTP operations
    ├── send.ts
    └── receive.ts
```

### Orchestrator Layer Structure

```
orchestrator/
├── dispatch.ts        # Orchestrator definition
├── entity1/           # Handler group: realmname.entity1
│   ├── ~.schema.ts   # Auto-generated validation
│   ├── helper.ts     # Library function
│   └── realmEntity1Action.ts
└── entity2/           # Handler group: realmname.entity2
    ├── ~.schema.ts
    └── realmEntity2Action.ts
```

### Gateway Layer Structure

```
gateway/
└── api/
    ├── entity1.yaml   # OpenAPI spec for entity1
    └── entity2.yaml   # OpenAPI spec for entity2
```

Or with custom validation:

```
gateway/
└── entity/
    ├── entityAction1.ts  # Manual validation
    └── entityAction2.ts
```

### Test Layer Structure

```
test/
└── test/              # Handler group: test.test
    ├── testEntity1.ts
    ├── testEntity2.ts
    └── testWorkflow.ts
```

## Layer Activation

### In Realm Configuration

```typescript
export default realm(blong => ({
    config: {
        // Activate for automated testing
        test: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true,
            test: true
        },

        // Activate for microservice deployment
        microservice: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true
        },

        // Activate for single realm dev focus
        realm: {
            adapter: true,
            orchestrator: true
        },

        // Development with full stack
        dev: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true
        }
    }
}));
```

## One Handler Per File Pattern

### Benefits

1. **Fast Discovery:** Use `ctrl+p` in VS Code to find handlers quickly
   - Example: `ctrl+p uua` finds `userUserAdd.ts`
2. **Easier Code Review:** Smaller files, less nesting
3. **Better Isolation:** Clear boundaries between handlers
4. **Git-Friendly:** Smaller diffs, fewer conflicts

### Naming Convention

File name = handler name:

- Handler: `userUserAdd` → File: `userUserAdd.ts`
- Handler: `mathNumberSum` → File: `mathNumberSum.ts`
- Library: `validateEmail` → File: `validateEmail.ts`

## Configuration Per Layer

### Adapter Configuration

```typescript
config: {
    default: {
        adaptername: {
            namespace: ['external'],
            imports: ['realmname.handlers'],
            logLevel: 'info'
        }
    }
}
```

### Orchestrator Configuration

```typescript
config: {
    default: {
        orchestratorname: {
            namespace: ['entity'],
            imports: ['realmname.entity'],
            validations: ['realmname.entity.validation'],
            destination: 'db'  // fallback when no handler exists
        }
    }
}
```

## Multi-Layer Example

### Complete Realm Structure

```
payment/
├── server.ts
├── browser.ts
├── error/
│   └── error.ts
├── adapter/
│   ├── db.ts
│   ├── fspiop.ts
│   └── db/
│       ├── paymentCreate.ts
│       └── paymentFind.ts
├── orchestrator/
│   ├── paymentDispatch.ts
│   ├── transfer/
│   │   ├── ~.schema.ts
│   │   ├── calculateFees.ts
│   │   ├── paymentTransferPrepare.ts
│   │   └── paymentTransferCommit.ts
│   └── quote/
│       ├── ~.schema.ts
│       └── paymentQuoteCreate.ts
├── gateway/
│   └── api/
│       ├── transfer.yaml
│       └── quote.yaml
└── test/
    └── test/
        ├── testTransfer.ts
        └── testQuote.ts
```

### Configuration

```typescript
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        db: blong.type.Object({}),
        fspiop: blong.type.Object({})
    }),
    children: [
        './error',
        './adapter',
        './orchestrator',
        './gateway',
        './test'
    ],
    config: {
        default: {
            db: {
                namespace: ['sql'],
                imports: ['payment.db']
            },
            fspiop: {
                namespace: ['fspiop'],
                imports: ['codec.openapi']
            },
            paymentDispatch: {
                namespace: ['transfer', 'quote'],
                imports: ['payment.transfer', 'payment.quote'],
                validations: ['payment.transfer.validation'],
                destination: 'sql'
            }
        },
        test: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true,
            test: true
        },
        microservice: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true
        }
    }
}));
```

## Best Practices

1. **Clear Separation:** Keep business logic in orchestrator, not gateway
2. **Consistent Naming:** Use lowercase single words for layer names
3. **Group by Entity:** Organize handlers by business entity within layers
4. **Library Functions:** Extract reusable code into library functions
5. **Error Definitions:** Always define errors in error layer first
6. **Test Coverage:** Create test layer with comprehensive test handlers
7. **One File Per Handler:** Follow the one handler per file pattern
8. **Validation:** Use `~.schema.ts` for automatic validation generation
9. **Deployment Flexibility:** Configure layer activation for different modes
10. **Import Order:** Load layers in order: error → adapter → orchestrator → gateway → test

## Examples from Codebase

- **Complete realm:** `core/test/demo/`
- **Payment realm:** `ml/payment/`
- **Agreement realm:** `ml/agreement/`
