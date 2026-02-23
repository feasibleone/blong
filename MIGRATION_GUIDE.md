# Migration Guide: v1.x to v2.0 - Self-Contained Layers

## Overview

Blong v2.0 introduces a **breaking change** that eliminates `server.ts` and `browser.ts` files in favor of self-contained, auto-discovered layers. This guide will help you migrate your existing realms to the new pattern.

## Why This Change?

**Benefits of the new pattern:**
- ✅ Configuration co-located with layer implementation
- ✅ No central catalog to maintain
- ✅ Auto-discovery of layers
- ✅ Flexible folder organization
- ✅ Cleaner, more maintainable code

**This is a breaking change** that requires migration, but excellent tooling makes the process straightforward.

## Before You Start

### Prerequisites
- [ ] Blong v1.x currently installed
- [ ] All code committed to version control
- [ ] Working test suite
- [ ] Backup of your project

### Compatibility Check
```bash
# Check your current version
npm list @feasibleone/blong

# Run pre-migration validation
npx blong validate-migration ./path/to/realm

# Review validation report
```

## Migration Options

### Option 1: Automated Migration (Recommended)

**Best for:** Most projects with standard structure

**Steps:**
1. Run the migration tool
2. Review generated files
3. Test your application
4. Clean up old files

**Time:** 15-30 minutes per realm

### Option 2: Manual Migration

**Best for:** Complex custom configurations

**Steps:**
1. Create self-contained layer files
2. Move configuration from server.ts
3. Add validation schemas
4. Test thoroughly

**Time:** 1-2 hours per realm

## Automated Migration Process

### Step 1: Run Migration Tool

```bash
# Navigate to your realm directory
cd /path/to/your/realm

# Run migration tool
npx blong migrate-layers .

# Or specify realm path
npx blong migrate-layers ./path/to/realm
```

**The tool will:**
1. ✓ Analyze server.ts and browser.ts
2. ✓ Extract configuration for each layer
3. ✓ Generate self-contained layer files
4. ✓ Create backups of original files
5. ✓ Validate all config is preserved
6. ✓ Generate migration report

### Step 2: Review Generated Files

The tool creates new files for each layer:

**Before:**
```
realmname/
├── server.ts              # All config here
├── browser.ts             # All config here
├── adapter/
│   ├── db.ts             # Minimal
│   └── http.ts           # Minimal
└── orchestrator/
    └── dispatch.ts        # Minimal
```

**After:**
```
realmname/
├── server.ts.backup       # Backed up
├── browser.ts.backup      # Backed up
├── adapter/
│   ├── db.ts             # Self-contained with config
│   └── http.ts           # Self-contained with config
└── orchestrator/
    └── dispatch.ts        # Self-contained with config
```

### Step 3: Review Migration Report

```
Migration Report
================
Realm: user-service
Original files: server.ts, browser.ts

Layers Migrated:
✓ adapter/db.ts
  - Config extracted: 45 lines
  - Validation added: 12 properties
  - Namespaces: user, role

✓ adapter/http.ts
  - Config extracted: 32 lines
  - Validation added: 8 properties
  - Namespaces: external

✓ orchestrator/dispatch.ts
  - Config extracted: 28 lines
  - Validation added: 6 properties
  - Namespaces: user

Summary:
- 3 layers migrated successfully
- 0 errors
- 0 warnings
- Backups created: server.ts.backup, browser.ts.backup

Next Steps:
1. Review generated layer files
2. Run tests: npm test
3. Start application: npm start
4. If successful, delete .backup files
```

### Step 4: Test Your Application

```bash
# Run your test suite
npm test

# Start your application
npm start

# Manual testing
# - Test critical workflows
# - Check logs for errors
# - Verify configuration is working
```

### Step 5: Clean Up

Once everything works:

```bash
# Remove backup files
rm server.ts.backup browser.ts.backup

# Commit changes
git add .
git commit -m "Migrate to Blong v2.0 self-contained layers"
```

## Manual Migration Process

### Step 1: Understand Your Current Structure

Review your `server.ts`:

```typescript
// OLD: server.ts
export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        db: blong.type.Object({
            host: blong.type.String(),
            port: blong.type.Number()
        }),
        http: blong.type.Object({
            url: blong.type.String()
        }),
        dispatch: blong.type.Object({
            namespace: blong.type.Array(blong.type.String())
        })
    }),
    children: ['./adapter', './orchestrator', './gateway'],
    config: {
        default: {
            db: {
                host: 'localhost',
                port: 5432,
                namespace: ['user'],
                imports: ['realmname.user']
            },
            http: {
                url: 'http://api.external.com',
                namespace: ['external']
            },
            dispatch: {
                namespace: ['user'],
                imports: ['realmname.user']
            }
        },
        dev: {
            db: {logLevel: 'trace'},
            http: {logLevel: 'trace'}
        },
        prod: {
            db: {logLevel: 'warn'},
            http: {logLevel: 'warn'}
        }
    }
}));
```

### Step 2: Create Self-Contained Adapter

```typescript
// NEW: adapter/db.ts
import {adapter} from '@feasibleone/blong';

export default adapter((blong) => ({
    extends: 'adapter.sql',
    
    // Move validation from server.ts
    validation: blong.type.Object({
        host: blong.type.String(),
        port: blong.type.Number(),
        namespace: blong.type.Array(blong.type.String()),
        imports: blong.type.Array(blong.type.String()),
        logLevel: blong.type.Optional(blong.type.String())
    }),
    
    // Move config from server.ts
    config: {
        default: {
            host: 'localhost',
            port: 5432,
            namespace: ['user'],
            imports: ['realmname.user']
        },
        dev: {
            logLevel: 'trace'
        },
        prod: {
            logLevel: 'warn'
        }
    }
}));
```

### Step 3: Repeat for Each Layer

```typescript
// NEW: adapter/http.ts
import {adapter} from '@feasibleone/blong';

export default adapter((blong) => ({
    extends: 'adapter.http',
    
    validation: blong.type.Object({
        url: blong.type.String(),
        namespace: blong.type.Array(blong.type.String()),
        logLevel: blong.type.Optional(blong.type.String())
    }),
    
    config: {
        default: {
            url: 'http://api.external.com',
            namespace: ['external']
        },
        dev: {
            logLevel: 'trace'
        },
        prod: {
            logLevel: 'warn'
        }
    }
}));
```

```typescript
// NEW: orchestrator/dispatch.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator((blong) => ({
    extends: 'orchestrator.dispatch',
    
    validation: blong.type.Object({
        namespace: blong.type.Array(blong.type.String()),
        imports: blong.type.Array(blong.type.String())
    }),
    
    config: {
        default: {
            namespace: ['user'],
            imports: ['realmname.user']
        }
    }
}));
```

### Step 4: Remove Old Files

```bash
# Delete server.ts (after backing up)
mv server.ts server.ts.backup

# Delete browser.ts if it exists
mv browser.ts browser.ts.backup
```

### Step 5: Test and Validate

```bash
# Framework will auto-discover layers
npm start

# Run tests
npm test
```

## Common Migration Scenarios

### Scenario 1: Simple Realm (2-3 layers)

**Estimated Time:** 15 minutes with tool, 30 minutes manually

**Before:**
- server.ts with basic config
- 2-3 standard layers (adapter, orchestrator)

**After:**
- Each layer self-contained
- server.ts deleted

**Migration:** Use automated tool

### Scenario 2: Complex Realm (5+ layers)

**Estimated Time:** 30 minutes with tool, 1-2 hours manually

**Before:**
- server.ts with complex config
- Multiple adapters and orchestrators
- Environment-specific overrides

**After:**
- All layers self-contained
- Config distributed appropriately

**Migration:** Use automated tool with manual review

### Scenario 3: Monorepo with Multiple Realms

**Estimated Time:** 20-30 minutes per realm

**Process:**
1. Run migration tool on each realm separately
2. Test each realm independently
3. Test integration between realms

**Notes:**
- Migration tool handles one realm at a time
- Realm boundaries detected via package.json

### Scenario 4: Custom Layer Types

**Estimated Time:** 45 minutes to 1 hour

**Considerations:**
- Custom layers may need explicit type declaration
- Migration tool may need manual adjustments
- Review generated code carefully

**Example:**
```typescript
// Custom layer with explicit type
export default layer((blong) => ({
    type: 'server', // Explicit since not well-known name
    kind: 'analytics',
    validation: blong.type.Object({...}),
    config: {...}
}));
```

## Troubleshooting

### Issue 1: Migration Tool Fails

**Symptom:** Tool exits with errors

**Causes:**
- Invalid server.ts/browser.ts syntax
- Circular dependencies
- Missing files

**Solution:**
```bash
# Run with verbose logging
npx blong migrate-layers . --verbose

# Check validation first
npx blong validate-migration .

# Review error messages and fix issues
```

### Issue 2: Config Not Preserved

**Symptom:** Missing configuration after migration

**Solution:**
1. Check migration report for warnings
2. Review .backup files
3. Manually copy missing config
4. Re-run migration tool

### Issue 3: Layer Not Discovered

**Symptom:** Layer not loaded after migration

**Causes:**
- Non-standard layer name
- Missing layer file
- Wrong file location

**Solution:**
```typescript
// Add explicit type if custom name
export default layer((blong) => ({
    type: 'server',
    kind: 'customlayer',
    // ... rest of config
}));
```

### Issue 4: Namespace Conflicts

**Symptom:** Namespace collision errors

**Solution:**
1. Review namespace definitions in each layer
2. Ensure unique namespaces per layer
3. Update imports references

### Issue 5: Environment Config Issues

**Symptom:** Wrong config in different environments

**Solution:**
1. Verify environment-specific config in each layer
2. Check config merge priority
3. Use environment variables for sensitive data

## Validation Checklist

After migration, verify:

### Functionality
- [ ] Application starts without errors
- [ ] All API endpoints respond correctly
- [ ] Database connections work
- [ ] External services connect properly
- [ ] Authentication/authorization works

### Configuration
- [ ] All environment configs present (dev, prod, test)
- [ ] Namespaces correctly defined
- [ ] Imports properly configured
- [ ] Validation schemas complete

### Testing
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing of key workflows
- [ ] Performance is acceptable

### Code Quality
- [ ] No server.ts or browser.ts references
- [ ] All layers have validation
- [ ] All layers have config
- [ ] Code follows new patterns

## Breaking Changes Summary

### Removed
- ❌ `server.ts` / `browser.ts` as entry points
- ❌ Central configuration in parent files
- ❌ Explicit children listing
- ❌ Parent config override support

### Added
- ✅ Self-contained layer definitions
- ✅ Auto-discovery of layers
- ✅ Layer-level validation
- ✅ Layer-level configuration
- ✅ Flexible folder structure

### Changed
- 🔄 Layer files must define own config
- 🔄 Layer files must define own validation
- 🔄 Framework discovers layers automatically
- 🔄 Layer type inferred from name

## Getting Help

### Resources
- [Implementation Plan](./IMPLEMENTATION_PLAN_LAYER_IMPROVEMENT.md) - Full technical details
- [Architecture Diagrams](./ARCHITECTURE_DIAGRAMS.md) - Visual guides
- [Layer Improvement Summary](./LAYER_IMPROVEMENT_SUMMARY.md) - Quick reference

### Support Channels
- **GitHub Issues:** Report bugs or issues
- **Discussions:** Ask questions
- **Documentation:** [Blong Docs](https://feasibleone.github.io/blong-docs)

### Common Questions

**Q: Can I use both old and new patterns?**
A: No, v2.0 only supports the new self-contained pattern.

**Q: What if migration fails?**
A: Use your version control to revert, and try manual migration or contact support.

**Q: How long until I must migrate?**
A: v1.x will be supported for 6 months after v2.0 release, then deprecated.

**Q: Will this improve performance?**
A: Yes, the new pattern is simpler and faster (5-10% improvement expected).

**Q: Can I customize the migration?**
A: Yes, the tool generates files you can modify before committing.

## Next Steps

1. **Review this guide thoroughly**
2. **Backup your project**
3. **Run pre-migration validation**
4. **Choose migration approach** (automated or manual)
5. **Execute migration**
6. **Test thoroughly**
7. **Deploy to staging first**
8. **Monitor for issues**
9. **Deploy to production**

## Feedback

We want to hear about your migration experience:
- What went well?
- What was difficult?
- How can we improve this guide?
- Suggestions for the tool?

Please share feedback via GitHub Issues or Discussions.

---

**Last Updated:** 2026-02-23  
**Version:** 2.0 Migration Guide  
**Status:** Ready for v2.0 Release
