---
name: blong-realm
description: Create business domain boundaries in Blong framework. Realms separate business logic into independent, modular units that can be deployed as monolith or microservices. Make sure to use this skill whenever creating a new business domain or service in Blong — even if the user says 'add a new module', 'create a new service', or 'set up a new package'.
---

# Implementing a Realm

## Overview

A realm is a business domain boundary in the Blong framework. Realms separate business logic into independent, modular units that can be developed independently and deployed together (monolith) or separately (microservices).

**Key Pattern:** Well-known layer folders (`error`, `adapter`, `orchestrator`, `gateway`, `sim`, `test`) are auto-discovered — no `layer.server.ts` needed. Custom folder names can add a `layer.server.ts` / `layer.browser.ts` to declare activation.

## Purpose

- **Modular Development:** Focus on specific business functionality
- **Team Independence:** Teams can develop realms end-to-end
- **Deployment Flexibility:** Same code can run as monolith or microservices
- **Clear Boundaries:** Avoid coupling between different business domains

## File Structure

```
realmname/
├── server.ts           # Optional — only for realm-level config/validation
├── package.json        # Package definition (if separate package)
├── adapter/            # Auto-discovered (well-known name)
│   └── db.ts           # Self-contained adapter
├── orchestrator/       # Auto-discovered (well-known name)
│   └── dispatch.ts     # Self-contained orchestrator
├── gateway/            # Auto-discovered (well-known name)
├── error/              # Auto-discovered (well-known name)
└── test/               # Auto-discovered (well-known name)
```

Custom layer folders need a `layer.server.ts`:

```
realmname/
└── myCustomLayer/
    └── layer.server.ts  # Required: declares activation for non-well-known folder
```

## layer.server.ts / layer.browser.ts

Only needed for non-well-known folder names. Declares activation per environment.

```typescript
// myCustomLayer/layer.server.ts
import {layer} from '@feasibleone/blong';

export default layer({
    default: true,        // active in all environments (regardless of intents)
    microservice: true,   // additionally active when the microservice intent is present
});
```

```typescript
// myBrowserLayer/layer.browser.ts
import {layer} from '@feasibleone/blong';

export default layer({
    integration: true,   // active only when the integration intent is present
});
```

### Well-known Folder Defaults

Well-known folders are automatically activated without any `layer.*.ts` file.
The key in each cell is the **intent** that must be active for the layer to load:

| Folder | Server intent | Browser intent |
|--------|--------------|----------------|
| `error` | `default` (always) | — |
| `adapter` | `default` (always) | `default` (always) |
| `orchestrator` | `default` (always) | — |
| `gateway` | `default` (always) | — |
| `sim` | `integration` | — |
| `test` | `integration` | `integration` |

Override any default by adding a `layer.server.ts` / `layer.browser.ts` to the folder.
See the **blong-intent** skill for the full intents reference and how to create custom intents.

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
    activation: {
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
    activation: {
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

1. **Well-known folders are zero-config:** `error`, `adapter`, `orchestrator`, `gateway`, `sim`, `test` are auto-discovered with sensible defaults — no `layer.server.ts` needed
2. **Use `layer.server.ts` only for custom folders:** Non-well-known layer names must declare activation
3. **Omit `server.ts`** for standard realms — the framework auto-discovers well-known layer folders
4. **Name Consistency:** Use the same name for realm folder, package name, and namespace prefix
5. **Co-located Config:** Put adapter/orchestrator config inside the adapter/orchestrator file using the `adapter(blong => ...)` pattern
6. **Keep server.ts** only when realm-level validation schema or shared default config is needed

## Examples from Codebase

See `core/test/demo/` for a complete example without server.ts:
- No `layer.server.ts` files — auto-discovered via well-known folder names
- Each adapter/orchestrator file is self-contained with its own config

