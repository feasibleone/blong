# Conditional Activation Requirements - Implementation Summary

## Problem Statement Requirements

The implementation plan needed to be updated to ensure:

1. **Preserve conditional activation** - Layers and children activated via configuration
2. **Lazy loading** - Only import active layers and their children
3. **Lightweight activation check** - Load activation config first, then conditional loading
4. **Self-contained activation** - Activation config in the layer itself
5. **Add testing** - Test suite for the new approach
6. **Update blong-kopi** - Template updates for new pattern

## Changes Made

### 1. New Technical Decision: Conditional Layer Activation

**Added Decision 5** to Implementation Plan:

```typescript
// Layer declares lightweight activation config
export default adapter(() => ({
    // Activation config - loaded first, minimal
    activation: {
        enabled: true, // or per-environment
        dev: true,
        prod: false,
        microservice: true
    },
    
    // Full config - only loaded if layer is activated
    validation: blong.type.Object({...}),
    config: {default: {...}}
}));
```

**Key Points:**
- Two-phase loading: activation config first (lightweight), then full layer
- Supports boolean, object, or function activation patterns
- Environment-specific activation preserved
- Children of inactive layers are not loaded

### 2. Updated Layer API

**Enhanced ILayerConfig** to include activation:

```typescript
interface ILayerConfig<T extends TSchema> {
    // ... existing fields
    
    // NEW: Activation configuration (loaded first)
    activation?: {
        enabled?: boolean;
        dev?: boolean;
        prod?: boolean;
        test?: boolean;
        microservice?: boolean;
        [env: string]: boolean;
    } | boolean | ((env: string) => boolean);
    
    // Rest only loaded if activated
    validation: T;
    config: {...};
}
```

### 3. Updated Loading Sequence

**New load sequence** in Implementation Plan:

1. Framework scans for layer definition files
2. **Load ONLY activation config** (lightweight, no imports)
3. **Evaluate activation** for current environment
4. **Filter to activated layers only**
5. **Import full layer modules** only if activated
6. Load configuration and validation
7. Resolve dependencies (active layers only)
8. Initialize layers in dependency order

**Performance:** Inactive layers are never imported/loaded - maintains current optimization.

### 4. New Implementation Tasks

**Task 1.4: Implement Activation Config System**
- Loads activation config without importing full layer
- Supports boolean, object, and function activation patterns
- Evaluates activation for current environment
- Minimal performance overhead
- Unit tests for activation evaluation

**Task 2.6: Update blong-kopi Template**
- Update all layer templates (adapter, orchestrator, gateway, error)
- Remove server.ts/browser.ts from templates
- Include activation config in templates
- Show activation patterns for common scenarios
- Update kopi documentation
- Test template generation

### 5. Enhanced Testing Requirements

**Task 3.1: Comprehensive Testing** - Enhanced with:
- Test conditional activation per environment
- Test inactive layers are not loaded/imported
- Test dependency resolution with inactive layers
- Test activation config evaluation (boolean, object, function)
- Performance tests show no regression from activation checks
- Additional test file: `activation.test.ts`

### 6. Migration Guide Updates

**Added Section 3.5: Add Activation Config**

Shows how to migrate activation patterns:

```typescript
// OLD: server.ts
config: {
    microservice: {
        adapter: true,
        orchestrator: false  // Not active
    }
}

// NEW: Layer with activation
export default adapter(() => ({
    activation: {
        microservice: true  // Active in microservice
    },
    // ... rest of config
}));
```

**Key migration points:**
- Activation config is extracted from environment configs
- Migration tool handles this automatically
- Preserves all activation patterns
- Shows boolean, object, and function examples

### 7. Documentation Updates

**Implementation Plan:**
- Decision 5: Conditional Layer Activation
- Updated load sequence with activation steps
- Enhanced Task 1.4 (activation system)
- New Task 2.6 (blong-kopi updates)
- Enhanced Task 3.1 (activation testing)

**Migration Guide:**
- Section 3.5: Activation config examples
- Shows how to migrate from server.ts activation
- Explains lightweight loading concept
- Notes about performance optimization

**Summary:**
- Updated layer definition to show activation
- Benefits list includes conditional activation
- Configuration section mentions conditional loading

**Architecture Diagrams:**
- Complete new loading sequence with activation
- Shows two-phase loading clearly
- Activation evaluation step visualized
- Data flow shows activation impact
- Performance notes included

## How Conditional Activation Works

### Two-Phase Loading

**Phase 1: Activation Check (Lightweight)**
```
1. Scan filesystem for layer files
2. Load ONLY activation config from each layer
   - No imports of dependencies
   - No validation schema loading
   - No handler loading
3. Evaluate activation for current environment
   - activation.dev === true?
   - activation.microservice === true?
4. Create list of ACTIVE layers only
```

**Phase 2: Full Import (Conditional)**
```
5. Import full layer module ONLY for active layers
   - Load validation schemas
   - Load configuration
   - Load handler groups
6. Initialize active layers
7. Skip inactive layers completely (no import, no load)
```

### Performance Optimization

**Current System:**
```
if (config) {
    // Load layer
}
```

**New System (Maintains Same Behavior):**
```
if (activationConfig[currentEnv]) {
    import layer  // Only if active
    // Load layer
}
```

**Key:** Both approaches conditionally load layers. New system just makes it explicit and self-contained.

### Example Scenarios

**Scenario 1: Microservice Mode**
```typescript
// adapter/db.ts
activation: {
    dev: true,
    prod: true,
    microservice: true
}
// ✓ Loaded in microservice mode

// orchestrator/complex.ts
activation: {
    dev: true,
    prod: true,
    microservice: false  // Heavy orchestration not needed
}
// ✗ NOT loaded in microservice mode - saves memory and startup time
```

**Scenario 2: Test Mode**
```typescript
// adapter/external-api.ts
activation: {
    dev: true,
    prod: true,
    test: false  // Use mocks in test
}
// ✗ NOT loaded in test mode

// adapter/mock.ts
activation: {
    dev: false,
    prod: false,
    test: true  // Only in test
}
// ✓ Loaded in test mode
```

**Scenario 3: Development vs Production**
```typescript
// gateway/debug.ts
activation: {
    dev: true,
    prod: false  // Debug endpoints only in dev
}

// gateway/api.ts
activation: true  // Always active
```

## Benefits Preserved

1. ✅ **Performance** - Inactive layers never imported
2. ✅ **Memory** - No code loaded for inactive layers
3. ✅ **Startup Time** - Faster with fewer imports
4. ✅ **Flexibility** - Different configs per environment
5. ✅ **Clarity** - Activation explicit in layer definition

## Testing Strategy

### Unit Tests
- Activation config parsing (boolean, object, function)
- Activation evaluation for each environment
- Edge cases (undefined, null, invalid configs)

### Integration Tests
- Layer loading with activation
- Inactive layers not imported (verify with code coverage)
- Children of inactive layers skipped
- Dependency resolution with inactive dependencies

### Performance Tests
- Activation check overhead (should be <1ms per layer)
- Memory usage with inactive layers (should be ~0)
- Startup time comparison (should match or improve current)

### E2E Tests
- Full realm with mixed activation patterns
- Environment switching (dev → prod → test)
- Microservice mode with selective activation
- Error handling for missing dependencies

## Migration Checklist

For existing projects migrating to v2.0:

- [ ] Review server.ts/browser.ts config sections
- [ ] Identify environment-specific activation patterns
- [ ] Run migration tool to extract activation configs
- [ ] Review generated activation configs
- [ ] Test in each environment (dev, prod, test, microservice)
- [ ] Verify inactive layers are not loaded (check logs)
- [ ] Measure performance impact (should be neutral or positive)

## Conclusion

All requirements from the problem statement have been addressed:

1. ✅ **Activation preserved** - Layers activated via config, pattern maintained
2. ✅ **Lazy loading** - Only active layers imported
3. ✅ **Lightweight first** - Activation config loaded before full layer
4. ✅ **Self-contained** - Activation in layer definition, not central file
5. ✅ **Testing added** - Comprehensive test requirements in Task 3.1
6. ✅ **Template updated** - Task 2.6 covers blong-kopi updates

The implementation plan now fully supports conditional layer activation in a self-contained manner while maintaining the performance characteristics of the current system.

---

**Status:** Complete and ready for review  
**Version:** 2.0 with Conditional Activation Support  
**Date:** 2026-02-23
