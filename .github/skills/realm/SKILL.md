---
name: blong-realm
description: Create business domain boundaries in Blong framework. Realms separate business logic into independent, modular units that can be deployed as monolith or microservices. Use when creating a new business domain, configuring deployment modes, or organizing related functionality.
---

# Implementing a Realm

## Overview

A realm is a business domain boundary in the Blong framework. Realms separate business logic into independent, modular units that can be developed independently and deployed together (monolith) or separately (microservices).

**Key Pattern:** Layer folders declare their own activation via `layer.server.ts` / `layer.browser.ts` — no explicit `children` or activation config needed in `server.ts`.

## Purpose

- **Modular Development:** Focus on specific business functionality
- **Team Independence:** Teams can develop realms end-to-end
- **Deployment Flexibility:** Same code can run as monolith or microservices
- **Clear Boundaries:** Avoid coupling between different business domains

## File Structure

```
realmname/
├── server.ts           # Optional realm entry point (only for realm-level config/validation)
├── package.json        # Package definition (if separate package)
├── adapter/
│   ├── layer.server.ts # Declares activation per environment
│   └── db.ts           # Self-contained adapter
├── orchestrator/
│   ├── layer.server.ts
│   └── dispatch.ts     # Self-contained orchestrator
├── gateway/
│   └── layer.server.ts
├── error/
│   └── layer.server.ts
└── test/
    └── layer.browser.ts # Browser-side activation
```

## layer.server.ts / layer.browser.ts

Each layer folder declares its own activation using a `layer.server.ts` (server-side) or `layer.browser.ts` (browser-side) file. This replaces activation config in the parent `server.ts`.

```typescript
// adapter/layer.server.ts
import {layer} from '@feasibleone/blong';

export default layer({
    microservice: true,   // active in microservice deployment
    dev: true,            // active in development
});
```

```typescript
// test/layer.browser.ts
import {layer} from '@feasibleone/blong';

export default layer({
    integration: true,   // active only for integration tests
});
```

### Well-known Folder Defaults

If no `layer.server.ts` exists, these folder names use default activation:

| Folder | Server default | Browser default |
|--------|---------------|-----------------|
| `error` | always active | — |
| `adapter` | always active | always active |
| `orchestrator` | always active | — |
| `gateway` | always active | — |
| `sim` | `integration` only | — |
| `test` | `test` only | `integration` only |

## Minimal server.ts (Only When Needed)

`server.ts` is **only needed** when the realm has:
- Realm-level validation schema
- Realm-level default config (e.g. keys, URLs shared across layers)

```typescript
// realmname/server.ts — only when realm-level config is needed
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,

    // Realm-level validation (for config like JWT keys, URLs)
    validation: blong.type.Object({
        myService: blong.type.Object({
            url: blong.type.String(),
        }),
    }),

    // Realm-level defaults shared across layers
    config: {
        default: {
            myService: {
                url: 'http://localhost:8080',
            },
        },
    },
}));
```

### Layer Files Define Their Own Config

Each adapter/orchestrator defines its own configuration:

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

### Local Paths (with auto-discovery)

```typescript
children: [
    './adapter',      // Scans adapter/ folder for self-contained layer files
    './orchestrator'  // No server.ts needed in these folders
]
```

The framework auto-discovers `.ts` files in each child folder. If a `server.ts` exists in the child folder, it is used as the realm entry point instead (for nested realms like sub-domains).

### Async Imports (for external packages)

When including external realm packages, use async imports in the APPLICATION-level `server.ts` / `browser.ts`:

```typescript
children: [
    async () => import('@feasibleone/blong-login/server.js'),
    async () => import('@feasibleone/blong-openapi/server.js')
]
```

## Best Practices

1. **Use `layer.server.ts`:** Put activation config in each layer folder, not in a parent `server.ts`
2. **Omit `server.ts`** for standard realms — the framework auto-discovers well-known layer folders
3. **Name Consistency:** Use the same name for realm folder, package name, and namespace prefix
4. **Co-located Config:** Put adapter/orchestrator config inside the adapter/orchestrator file using the `adapter(blong => ...)` pattern
5. **Keep server.ts** only when realm-level validation schema or shared default config is needed

## Examples from Codebase

See `core/test/demo/` for a complete example without server.ts:
- `adapter/layer.server.ts`, `orchestrator/layer.server.ts`, etc. declare activation
- Each adapter/orchestrator file is self-contained with its own config

