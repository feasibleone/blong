---
name: blong-realm
description: Create business domain boundaries in Blong framework. Realms separate business logic into independent, modular units that can be deployed as monolith or microservices. Use when creating a new business domain, configuring deployment modes, or organizing related functionality.
---

# Implementing a Realm

## Overview

A realm is a business domain boundary in the Blong framework. Realms separate business logic into independent, modular units that can be developed independently and deployed together (monolith) or separately (microservices).

## Purpose

- **Modular Development:** Focus on specific business functionality
- **Team Independence:** Teams can develop realms end-to-end
- **Deployment Flexibility:** Same code can run as monolith or microservices
- **Clear Boundaries:** Avoid coupling between different business domains

## File Structure

```
realmname/
├── server.ts           # Realm entry point (required)
├── browser.ts          # Client-side entry (optional)
├── package.json        # Package definition (if separate package)
├── adapter/            # External system integrations
├── orchestrator/       # Business process coordination
├── gateway/            # API layer
├── error/              # Domain error definitions
└── test/               # Test automation
    └── test/           # Test handlers namespace
```

## Implementation Pattern

### Basic Realm (server.ts)

```typescript
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    // Required: URL of the realm module
    url: import.meta.url,

    // Required: Validation schema for realm configuration
    validation: blong.type.Object({
        // Define config properties for this realm
        adaptername: blong.type.Optional(blong.type.Object({})),
        orchestratorname: blong.type.Optional(blong.type.Object({}))
    }),

    // Required: Child layers/modules to load
    children: [
        './error',        // Error definitions (load first)
        './adapter',      // Adapters for external systems
        './orchestrator', // Business logic orchestration
        './gateway',      // API gateway layer
        './test'          // Test automation
    ],

    // Required: Configuration for different environments/modes
    config: {
        // Base configuration (always active)
        default: {
            // Configure orchestrators
            orchestratorDispatch: {
                namespace: ['entity1', 'entity2'],
                imports: ['realmname.entity1', 'realmname.entity2']
            },
            // Configure adapters
            adaptername: {
                namespace: ['external'],
                imports: ['codec.openapi']
            }
        },

        // Development environment
        dev: {
            adaptername: {
                logLevel: 'trace',
                url: 'http://localhost:8080'
            }
        },

        // Production environment
        prod: {
            adaptername: {
                logLevel: 'warn'
            }
        },

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
        }
    }
}));
```

### Browser Entry (browser.ts)

```typescript
// realmname/browser.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        backend: blong.type.Optional(blong.type.Object({}))
    }),
    children: ['./backend', './component'],
    config: {
        default: {
            backend: {
                namespace: ['realmname'],
                imports: ['codec.jsonrpc', 'codec.mle']
            }
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

Set layer names to `true` to activate them:

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

### Component Configuration

Configure adapters and orchestrators by name:

```typescript
config: {
    default: {
        httpAdapter: {
            url: 'http://example.com',
            namespace: ['external'],
            imports: ['codec.openapi']
        }
    }
}
```

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

### Mixed

```typescript
children: [
    './local-layer',
    async () => import('@external/package/server.js')
]
```

## Common Patterns

### Minimal Realm

```typescript
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./orchestrator'],
    config: {
        default: {},
        test: {orchestrator: true}
    }
}));
```

### Realm with External API Integration

```typescript
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        http: blong.type.Object({})
    }),
    children: ['./adapter', './orchestrator'],
    config: {
        default: {
            http: {
                namespace: ['external'],
                imports: ['codec.openapi']
            },
            dispatch: {
                namespace: ['entity'],
                imports: ['realmname.entity']
            }
        },
        dev: {
            http: {
                'codec.openapi': {
                    namespace: {
                        external: ['./api/swagger.yaml']
                    }
                }
            }
        }
    }
}));
```

### Multi-Orchestrator Realm

```typescript
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./orchestrator'],
    config: {
        default: {
            entityDispatch: {
                namespace: ['entity'],
                imports: ['realmname.entity']
            },
            workflowDispatch: {
                namespace: ['workflow'],
                imports: ['realmname.workflow']
            }
        }
    }
}));
```

## Best Practices

1. **Name Consistency:** Use the same name for realm folder, package name, and namespace prefix
2. **Error First:** Load error definitions before other layers
3. **Minimal Config:** Keep default config minimal, use environment-specific overrides
4. **Clear Namespaces:** Use descriptive namespace names matching business entities
5. **Validation Schema:** Define complete validation schema for type safety
6. **Layer Order:** Load in order: error → adapter → orchestrator → gateway → test
7. **Import URL:** Always use `import.meta.url` for the url property
8. **Deployment Modes:** Define both `test` and `microservice` configurations

## Examples from Codebase

See `core/test/demo/server.ts` for a complete example with:

- OpenAPI codec configuration
- Multiple namespaces
- Environment-specific overrides
- Microservice deployment config
