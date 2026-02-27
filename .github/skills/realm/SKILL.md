---
name: blong-realm
description: Create business domain boundaries in Blong framework. Realms separate business logic into independent, modular units that can be deployed as monolith or microservices. Use when creating a new business domain, configuring deployment modes, or organizing related functionality.
---

# Implementing a Realm

## Overview

A realm is a business domain boundary in the Blong framework. Realms separate business logic into independent, modular units that can be developed independently and deployed together (monolith) or separately (microservices).

**Key Pattern:** The `server.ts` is minimal — it only controls layer activation. Each layer (adapter, orchestrator, etc.) defines its own configuration co-located with its implementation.

## Purpose

- **Modular Development:** Focus on specific business functionality
- **Team Independence:** Teams can develop realms end-to-end
- **Deployment Flexibility:** Same code can run as monolith or microservices
- **Clear Boundaries:** Avoid coupling between different business domains

## File Structure

```
realmname/
├── server.ts           # Minimal realm entry point (activation only)
├── browser.ts          # Client-side entry (optional)
├── package.json        # Package definition (if separate package)
├── adapter/            # External system integrations (each self-contained)
├── orchestrator/       # Business process coordination (each self-contained)
├── gateway/            # API layer
├── error/              # Domain error definitions
└── test/               # Test automation
    └── test/           # Test handlers namespace
```

## Implementation Pattern

### Minimal Realm (server.ts)

The `server.ts` only controls WHICH layers are activated for each environment. Layer-specific configuration belongs in the layer files themselves.

```typescript
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    // Required: URL of the realm module
    url: import.meta.url,

    // Minimal validation - no per-layer config needed here
    validation: blong.type.Object({}),

    // Required: Child layers to load
    children: [
        './error',        // Error definitions (load first)
        './adapter',      // Adapters for external systems
        './orchestrator', // Business logic orchestration
        './gateway',      // API gateway layer
        './test'          // Test automation
    ],

    // Controls WHICH layers are active per environment
    config: {
        default: {},

        // Automated testing
        test: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true,
            test: true
        },

        // Microservice deployment mode
        microservice: {
            error: true,
            adapter: true,
            orchestrator: true,
            gateway: true
        },

        // Single realm focus (dev mode)
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

### Layer Files Define Their Own Config

Each layer (adapter, orchestrator) defines its own configuration:

```typescript
// adapter/db.ts - configuration lives here, not in server.ts
import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.knex',
    validation: blong.type.Object({
        namespace: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        imports: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
    }),
    config: {
        default: {
            namespace: 'db/$subject',
            imports: '$subject.db',
        },
    },
}));
```

```typescript
// orchestrator/dispatch.ts - configuration lives here, not in server.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    config: {
        default: {
            destination: 'db',
            namespace: ['$subject'],
            imports: [/^$subject\./],
            validations: [/^$subject\.\w+\.validation$/],
        },
    },
}));
```

### Browser Entry (browser.ts)

```typescript
// realmname/browser.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./backend', './component'],
    config: {
        default: {},
        integration: {
            test: true
        }
    }
}));
```

## Configuration Concepts

### Environment Activations

- **`default`:** Base configuration active for all cases
- **`dev`:** Development environment overrides
- **`prod`:** Production/UAT environment overrides
- **`test`:** Automated testing activation
- **`db`:** Database creation/migration mode
- **`realm`:** Single realm focus for development
- **`microservice`:** Production microservice deployment
- **`integration`:** Integration testing mode

### Layer Activation

Set layer names to `true` to activate them in server.ts:

```typescript
config: {
    test: {
        error: true,
        adapter: true,
        orchestrator: true,
        gateway: true,
        test: true
    }
}
```

### Config Priority (highest to lowest)

1. CLI parameters (`--config.db.host=localhost`)
2. Environment variables (`BLONG_DB_HOST`)
3. Environment-specific layer config (layer's `config.dev`)
4. Layer's default config (layer's `config.default`)
5. Framework defaults

## Loading Children

Children can be loaded as:

### Local Paths

```typescript
children: [
    './adapter',      // Local folder
    './orchestrator'
]
```

### Async Imports (for external packages)

```typescript
children: [
    async () => import('@feasibleone/blong-login/server.js'),
    async () => import('@feasibleone/blong-openapi/server.js')
]
```

## Best Practices

1. **Minimal server.ts:** Only activation config in server.ts — all layer config belongs in the layer
2. **Name Consistency:** Use the same name for realm folder, package name, and namespace prefix
3. **Error First:** Load error definitions before other layers
4. **Co-located Config:** Put adapter/orchestrator config inside the adapter/orchestrator file
5. **Layer Order:** Load in order: error → adapter → orchestrator → gateway → test
6. **Import URL:** Always use `import.meta.url` for the url property
7. **Deployment Modes:** Define both `test` and `microservice` configurations

## Examples from Codebase

See `core/test/demo/server.ts` for a complete example with:

- Multiple layers with self-contained configs
- Environment-specific overrides
- Microservice deployment config

