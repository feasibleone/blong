# Layer Improvement Summary

## Quick Overview

This document provides a high-level summary of the proposed changes to make layers self-contained in the Blong framework.

## Current State (Before)

### Folder Structure
```
realmname/
├── server.ts                 # Required - defines all config and children
├── browser.ts               # Required - defines all config and children  
├── package.json
├── adapter/
│   ├── db.ts                # Just extends base adapter
│   └── http.ts              # Just extends base adapter
├── orchestrator/
│   └── dispatch.ts          # Just extends base orchestrator
└── gateway/
    └── api/
        └── user.yaml
```

### Layer Definition (Current)
```typescript
// adapter/db.ts - minimal, no config
export default adapter(() => ({
    extends: 'adapter.sql'
}));
```

### Configuration (Current - Centralized in server.ts)
```typescript
// server.ts - defines EVERYTHING
export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        db: blong.type.Object({
            host: blong.type.String(),
            port: blong.type.Number()
        }),
        http: blong.type.Object({...}),
        dispatch: blong.type.Object({...})
    }),
    children: [
        './adapter',      // Must explicitly list
        './orchestrator',
        './gateway'
    ],
    config: {
        default: {
            db: {
                namespace: ['user'],
                imports: ['realmname.user']
            },
            http: {
                url: 'http://api.external.com'
            },
            dispatch: {
                namespace: ['user'],
                imports: ['realmname.user']
            }
        },
        dev: {
            db: {host: 'localhost', port: 5432},
            http: {logLevel: 'trace'}
        }
    }
}));
```

### Problems
1. ❌ Config separated from layer implementation
2. ❌ Must maintain server.ts/browser.ts as layer catalog
3. ❌ Can't tell if layer is server/browser from the layer itself
4. ❌ Rigid folder structure (layers must be direct children)
5. ❌ Difficult to reuse layers across realms

## Proposed State (After)

### Folder Structure (More Flexible)
```
realmname/
├── package.json            # Realm boundary marker
├── adapter/
│   ├── db.ts              # Self-contained with config
│   └── http.ts            # Self-contained with config
├── orchestrator/
│   └── dispatch.ts        # Self-contained with config
└── gateway/
    └── api/
        └── user.yaml

# OR nested structure (also works)
realmname/
├── package.json
└── backend/
    ├── adapter/
    │   └── db.ts
    └── orchestrator/
        └── dispatch.ts
```

### Layer Definition (Proposed - Self-Contained with Activation)
```typescript
// adapter/db.ts - self-contained, defines own config and activation
export default adapter(() => ({
    extends: 'adapter.sql',
        
    // Co-located validation (only loaded if activated)
    validation: blong.type.Object({
        host: blong.type.String(),
        port: blong.type.Number(),
        database: blong.type.String(),
        logLevel: blong.type.Optional(blong.type.String())
    }),
    
    activation: {
        default: {
            namespace: ['user'],
            imports: ['realmname.user'],
            port: 5432
        },
        dev: {
            host: 'localhost',
            database: 'realmname_dev',
            logLevel: 'trace'
        },
        prod: {
            host: process.env.DB_HOST,
            database: 'realmname_prod',
            logLevel: 'warn'
        }
    }
}));
```

### Configuration (Proposed - No server.ts Needed)
```typescript
// No server.ts file!
// Framework auto-discovers layers and loads them conditionally:
// - Scans for adapter/db.ts, orchestrator/dispatch.ts, etc.
// - Loads activation config first (lightweight)
// - Only imports layers that are activated for current environment
// - Children of inactive layers are not loaded
```

### Benefits
1. ✅ Config co-located with layer code
2. ✅ No need to maintain central catalog
3. ✅ Layer type automatically determined
4. ✅ Conditional activation preserved (performance optimization)
5. ✅ Flexible folder organization
6. ✅ Easy to reuse layers (just copy folder)
7. ✅ Better for team collaboration
8. ✅ Clearer ownership and boundaries

## Side-by-Side Comparison

### Adding a New Adapter

#### Before (Current)
```typescript
// 1. Create adapter/newadapter.ts
export default adapter(() => ({
    extends: 'adapter.http'
}));

// 2. Update server.ts validation
validation: blong.type.Object({
    // ... existing validations
    newadapter: blong.type.Object({
        url: blong.type.String(),
        timeout: blong.type.Number()
    })
})

// 3. Update server.ts children
children: [
    './adapter',    // Already there, but need to know
    './orchestrator',
    './gateway'
]

// 4. Update server.ts config
config: {
    default: {
        newadapter: {
            url: 'http://api.example.com',
            timeout: 5000
        }
    }
}

// Result: Touch 2 files, edit 3 places in server.ts
```

#### After (Proposed)
```typescript
// 1. Create adapter/newadapter.ts
export default adapter(() => ({
    extends: 'adapter.http',
    
    validation: blong.type.Object({
        url: blong.type.String(),
        timeout: blong.type.Number()
    }),
    
    activation: {
        default: {
            url: 'http://api.example.com',
            timeout: 5000
        }
    }
}));

// 2. Done! Framework auto-discovers it

// Result: Touch 1 file, everything co-located
```

## Layer Type Auto-Detection

### Server-Side Layers (Automatic)
- `adapter` - External system integration
- `orchestrator` - Business logic coordination
- `gateway` - API gateway
- `error` - Error definitions
- `test` - Test automation
- `eft` - Electronic funds transfer

### Browser-Side Layers (Automatic)
- `backend` - Browser adapter to server
- `component` - UI components
- `browser` - Server-side browser asset serving

### Custom Layers (Explicit)
```typescript
// If layer name doesn't match well-known types
export default layer(() => ({
    type: 'server',  // or 'browser'
    kind: 'myCustomLayer',
    // ... rest of config
}));
```

## Realm Discovery

### How Framework Finds Realm

```
Current directory: realmname/adapter/db.ts

↑ Look for package.json
↑ Found: realmname/adapter/package.json (not a realm)
↑ Look for package.json
↑ Found: realmname/package.json ✓

Realm boundary: realmname/
Realm name: From package.json "name" field
```

### Package.json Marker (Optional)
```json
{
  "name": "@company/realmname",
  "version": "1.0.0",
  "realm": true,           // Optional marker
  "type": "module"
}
```

## Migration Path

**⚠️ Breaking Change in v2.0:** All projects must migrate to the new pattern.

### Automated Migration (Recommended)
```bash
# Use migration tool
$ blong migrate-layers ./realmname

# Analyzes server.ts/browser.ts
# Extracts config for each layer
# Creates self-contained layer files
# Removes server.ts/browser.ts (creates backups)

✓ Migrated adapter/db.ts
✓ Migrated adapter/http.ts
✓ Migrated orchestrator/dispatch.ts
✓ Created backups: server.ts.backup
✓ Migration complete!

# Test your application
$ npm test
$ npm start

# If successful, remove backups
$ rm *.backup
```

### Manual Migration

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for:
- Step-by-step instructions
- Before/after examples
- Troubleshooting guide
- Common scenarios

### Migration Timeline

**v1.x Support:** 6 months after v2.0 release  
**Migration Tool:** Available with v2.0  
**Support:** Active help during transition period

## Configuration Merge Priority

When same property defined in multiple places:

```
1. CLI parameter               --config.db.host=localhost
2. Environment variable        BLONG_DB_HOST=localhost
3. Environment config (dev)    config.dev.db.host
4. Layer default config        layer's config.default.db.host
5. Framework default           Built-in sensible defaults

Highest priority wins ↑
```

## Example: Complete Self-Contained Layer

```typescript
// adapter/database.ts - Everything in one place
import {adapter} from '@feasibleone/blong';

export default adapter((blong) => ({
    // Base functionality
    extends: 'adapter.sql',
    
    // What this layer needs configured
    validation: blong.type.Object({
        host: blong.type.String(),
        port: blong.type.Number(),
        database: blong.type.String(),
        username: blong.type.String(),
        password: blong.type.String(),
        pool: blong.type.Optional(blong.type.Object({
            min: blong.type.Number(),
            max: blong.type.Number()
        })),
        logLevel: blong.type.Optional(blong.type.String())
    }),
    
    // Configuration per environment
    activation: {
        // Always active
        default: {
            namespace: ['user', 'role', 'permission'],
            imports: ['realmname.user', 'realmname.role'],
            port: 5432,
            pool: {
                min: 2,
                max: 10
            }
        },
        
        // Development overrides
        dev: {
            host: 'localhost',
            database: 'realmname_dev',
            username: 'dev_user',
            password: 'dev_pass',
            logLevel: 'trace'
        },
        
        // Production configuration
        prod: {
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            username: process.env.DB_USER,
            password: process.env.DB_PASS,
            logLevel: 'warn',
            pool: {
                min: 5,
                max: 50
            }
        },
        
        // Testing configuration
        test: {
            host: 'localhost',
            database: 'realmname_test',
            username: 'test_user',
            password: 'test_pass',
            logLevel: 'silent'
        }
    },
    
    // Optional: Handler groups to load
    children: [
        './database/user',      // Handler group
        './database/role'
    ]
}));
```

## Timeline

- **Week 1-2:** Foundation (APIs, discovery, type inference)
- **Week 3-4:** Core functionality (scanning, config, dependencies, migration tool)
- **Week 4-5:** Polish (testing, migration guide, docs, optimization)

**Total:** 4-5 weeks for full implementation (faster without backward compatibility)

**Version:** 2.0 (Breaking Change)

## Key Decisions

1. **Breaking change with migration support** - Clean implementation
2. **Type inference from layer name** - Less boilerplate
3. **package.json marks realm boundary** - Clear, standard
4. **Co-located configuration** - Better developer experience
5. **Excellent migration tool provided** - Smooth transition

## Questions?

See documentation:
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - How to migrate your code
- [IMPLEMENTATION_PLAN_LAYER_IMPROVEMENT.md](./IMPLEMENTATION_PLAN_LAYER_IMPROVEMENT.md) - Technical specs
- [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) - Visual guides

## Next Steps

1. ✅ Review implementation plan
2. ⏳ Stakeholder approval  
3. ⏳ Begin Phase 1 development
4. ⏳ Create proof-of-concept
5. ⏳ Beta testing with real projects
6. ⏳ Production release (v2.0)
7. ⏳ Migration support period

---

*Last Updated: 2026-02-23*
*Version: 2.0 Breaking Change*
