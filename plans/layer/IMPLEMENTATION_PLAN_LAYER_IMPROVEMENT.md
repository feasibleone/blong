# Implementation Plan: Self-Contained Layer Definition

## Overview

### Problem Statement
Currently, Blong requires `server.ts` and `browser.ts` files at the realm level to:
- Define layer configuration and validation schemas
- Specify which layers belong to server or browser
- Load child layers through the `children` property

This approach has several limitations:
- Configuration is centralized rather than co-located with the layer
- Each child must be explicitly listed in the parent's children array
- Layer type (server/browser) is not self-evident from the layer itself
- Folder structure is rigid - layers must be direct children of the realm

### Goals
Create a more flexible, self-contained layer definition system that:
1. **Eliminates the need for browser.ts and server.ts** - Layers define themselves
2. **Auto-associates layers with server or browser** - Based on layer name/type
3. **Decentralizes configuration** - Each layer defines its own config and validation
4. **Enables flexible folder structure** - Framework auto-discovers realm via package.json
5. **Provides clear migration path** - Comprehensive migration guide and tooling

### Success Criteria
- [ ] Layers can be defined without server.ts/browser.ts parent files
- [ ] Layer type (server/browser) is automatically determined
- [ ] Each layer defines its own configuration and validation
- [ ] Framework discovers realm by traversing up to find package.json
- [ ] Clear migration guide with step-by-step instructions
- [ ] Migration tooling to automate conversion
- [ ] Documentation updated with new patterns
- [ ] Skills updated to reflect new approach

### Who Will Use This
- Framework users creating new realms and layers
- Teams wanting more flexible folder organization
- Developers seeking better co-location of layer concerns

## Technical Approach

### High-Level Architecture

#### Current Architecture Flow
```
server.ts/browser.ts (entry point)
  ↓ defines children
  ↓ defines validation schema
  ↓ defines config per environment
  ↓
Layers (adapter/, orchestrator/, gateway/, etc.)
  ↓ imported as children
  ↓ config comes from parent
  ↓
Layer definition files (db.ts, http.ts, dispatch.ts)
  ↓ extends base adapters/orchestrators
  ↓
Handler groups (folders with handlers)
```

#### Proposed Architecture Flow
```
Layer definition files (adapter/db.ts, orchestrator/dispatch.ts)
  ↓ self-contained
  ↓ defines own validation
  ↓ defines own config
  ↓ declares server/browser affinity
  ↓
Framework auto-discovery
  ↓ scans for layer files
  ↓ determines type by layer name
  ↓ finds realm via package.json
  ↓
Handler groups (folders with handlers)
  ↓ same as before
```

### Key Technology Choices

1. **Layer Type Detection**
   - Use well-known layer names to infer server/browser type
   - Server layers: `adapter`, `orchestrator`, `gateway`, `error`, `test`, `eft`
   - Browser layers: `backend`, `component`, `browser`
   - Allow explicit type override via layer config

2. **Auto-Discovery Strategy**
   - Framework scans for layer definition files in expected locations
   - Traverses up directory tree to find package.json (realm boundary)
   - Caches discovered structure for performance

3. **Configuration Schema**
   - Layers export their own validation schema
   - Configuration merges follow same environment hierarchy (default, dev, prod, etc.)
   - Parent can still override/extend layer config if needed

4. **File Naming Conventions**
   - Layer entry point: `layer.ts` (e.g., `adapter/http/layer.ts`)
   - Or use layer type as filename: `adapter.ts`, `orchestrator.ts`, `gateway.ts`
   - Framework checks both patterns

### Major Technical Decisions

#### Decision 1: Breaking Change with Migration Support
**Choice:** Implement breaking change with comprehensive migration guide and tooling

**Rationale:**
- Cleaner implementation without dual-mode complexity
- Faster development cycle (no backward compatibility layer)
- Forces consistent pattern across all projects
- Simpler codebase to maintain long-term

**Trade-offs:**
- Requires migration effort from all users
- Breaking change in major version
- Need excellent migration tooling and documentation

**Migration Support:**
1. Automated migration tool to convert server.ts/browser.ts to self-contained layers
2. Step-by-step migration guide with examples
3. Pre-migration validation tool to check compatibility
4. Comprehensive documentation of all changes
5. Migration support period with active help

#### Decision 2: Layer Type Determination
**Choice:** Infer from layer name with explicit override option

**Rationale:**
- Follows existing conventions (gateway, adapter are clearly server-side)
- Reduces boilerplate in common cases
- Allows flexibility for edge cases

**Trade-offs:**
- Requires maintaining list of well-known layer names
- Custom layer names need explicit type declaration
- Could cause confusion if layer named unconventionally

**Implementation:**
```typescript
// Implicit (common case)
export default adapter(() => ({
    // automatically server-side
}));

// Explicit override (edge cases)
export default layer(() => ({
    type: 'server', // or 'browser'
    kind: 'adapter',
}));
```

#### Decision 3: Realm Discovery via package.json
**Choice:** Traverse up directory tree to find nearest package.json

**Rationale:**
- package.json is already required for npm packages
- Clear boundary marker for realm
- Aligns with Node.js module resolution

**Trade-offs:**
- Could find wrong package.json in monorepos
- Requires file system traversal
- May need caching for performance

**Safeguards:**
- Look for specific marker in package.json (e.g., `"realm": true`)
- Stop at first package.json with realm marker
- Fall back to explicit configuration if ambiguous

#### Decision 4: Configuration Composition
**Choice:** Layer-level config only (no parent overrides)

**Rationale:**
- Co-locates config with layer code
- Simpler mental model - one source of truth per layer
- Enables environment-specific overrides at layer level
- Cross-cutting concerns handled via shared configuration utilities

**Pattern:**
```typescript
// Layer defines its own config
export default adapter(() => ({
    validation: blong.type.Object({
        url: blong.type.String(),
        timeout: blong.type.Number()
    }),
    config: {
        default: {
            timeout: 5000
        },
        dev: {
            url: 'http://localhost:8080',
            logLevel: 'trace'
        },
        prod: {
            url: 'https://api.production.com',
            logLevel: 'warn'
        }
    }
}));
```

#### Decision 5: Conditional Layer Activation
**Choice:** Preserve config-based activation with lazy loading

**Rationale:**
- Maintains current activation pattern where layers are conditionally loaded
- Enables different layer configurations per environment (dev, microservice, etc.)
- Improves performance by only loading active layers
- Self-contained layers declare their own activation requirements

**Trade-offs:**
- Requires two-phase loading: activation config first, then layer code
- Need mechanism to declare activation config without loading full layer
- Must handle circular dependencies in activation checks

**Implementation:**
```typescript
// Layer declares lightweight activation config
export default adapter(() => ({
    // Activation config - loaded first, minimal
    activation: {
        // Simple boolean or function returning boolean
        enabled: true, // or (env) => env === 'dev'
        // Or per-environment activation
        dev: true,
        prod: false,
        microservice: true
    },
    
    // Full config - only loaded if layer is activated
    validation: blong.type.Object({...}),
    config: {
        default: {...}
    }
}));
```

**Loading Sequence:**
1. Framework discovers all layer files via scanning
2. Loads only activation config (lightweight, no imports)
3. Evaluates activation for current environment
4. Only imports/loads code for activated layers
5. Loads children of activated layers conditionally

### Important APIs and Data Structures

#### New Layer API
```typescript
interface ILayerConfig<T extends TSchema> {
    // Required: URL of the layer module (for resolution)
    url: string;
    
    // Optional: Explicit type (inferred if not provided)
    type?: 'server' | 'browser';
    
    // Optional: Layer kind/role (inferred from function name)
    kind?: 'adapter' | 'orchestrator' | 'gateway' | 'error' | 'test' | 'component' | 'backend';
    
    // Optional: Activation configuration (loaded first, before full layer)
    activation?: {
        // Simple boolean for all environments
        enabled?: boolean;
        // Or per-environment activation
        dev?: boolean;
        prod?: boolean;
        test?: boolean;
        microservice?: boolean;
        [env: string]: boolean;
    } | boolean | ((env: string) => boolean);
    
    // Required: Validation schema for this layer's config
    validation: T;
    
    // Required: Configuration for different environments
    config: {
        default: Static<T>;
        dev?: Partial<Static<T>>;
        prod?: Partial<Static<T>>;
        test?: Partial<Static<T>>;
        [key: string]: Partial<Static<T>>;
    };
    
    // Optional: Handler groups to load (also conditionally loaded)
    children?: string[];
    
    // Optional: Dependencies on other layers
    imports?: string[];
    
    // Optional: Namespaces this layer exposes
    namespace?: string[];
    
    // Optional: Extends base layer
    extends?: string;
}
```

#### Realm Discovery API
```typescript
interface IRealmDiscovery {
    // Find realm by traversing up from layer
    findRealm(layerUrl: string): Promise<{
        realmPath: string;
        realmName: string;
        packageJson: object;
    }>;
    
    // Discover all layers in a realm
    discoverLayers(realmPath: string): Promise<ILayerInfo[]>;
    
    // Determine layer type
    inferLayerType(layerName: string, layerConfig?: object): 'server' | 'browser';
}

interface ILayerInfo {
    name: string;
    path: string;
    type: 'server' | 'browser';
    kind: string;
    config?: object;
}
```

### System Interactions

#### Load Sequence (New Pattern with Conditional Activation)
```
1. Framework scans for layer definition files
   ├─ Checks for adapter.ts, orchestrator.ts, gateway.ts, etc.
   ├─ Checks for */layer.ts pattern
   └─ Checks for layer folders with index.ts

2. For each discovered layer:
   ├─ Load ONLY activation config (lightweight, no imports)
   ├─ Determine layer type (server/browser)
   ├─ Evaluate activation for current environment
   └─ Find realm via package.json traversal

3. Filter to activated layers only:
   ├─ Check activation config against current environment
   ├─ Exclude inactive layers from loading
   └─ Track which layers are active for dependency resolution

4. Load activated layers:
   ├─ Import full layer modules only if activated
   ├─ Load configuration and validation
   ├─ Create realm structure
   └─ Merge configurations per environment

5. Resolve dependencies:
   ├─ Check dependencies are activated
   ├─ Topological sort of active layers
   └─ Error if dependency is not activated

6. Initialize layers:
   ├─ Initialize in dependency order
   ├─ Load handler groups (conditionally)
   └─ Register with framework registry
```

#### Configuration Merge Priority (Highest to Lowest)
```
1. CLI parameters (--config.layer.property=value)
2. Environment variables (BLONG_LAYER_PROPERTY)
3. Environment-specific config (dev, prod, test)
4. Layer's default config
5. Parent/global overrides (backward compat)
6. Framework defaults
```

## Implementation Plan

### Phase 1: Foundation (Week 1-2)

#### Task 1.1: Define New Layer API
- **Complexity:** Medium
- **Description:** Create TypeScript interfaces and types for self-contained layer config
- **Files:**
  - `core/blong/types.ts` - Add new interfaces
  - `core/blong-gogo/src/layerConfig.ts` - New layer configuration builder
- **Acceptance Criteria:**
  - [ ] ILayerConfig interface defined
  - [ ] Builder function for creating layer configs
  - [ ] Type safety enforced for config/validation
  - [ ] Unit tests for type validation

#### Task 1.2: Implement Realm Discovery
- **Complexity:** Medium
- **Description:** Create logic to traverse directories and find package.json
- **Files:**
  - `core/blong-gogo/src/RealmDiscovery.ts` - New file
  - `core/blong-gogo/src/load.ts` - Integration point
- **Dependencies:** None
- **Acceptance Criteria:**
  - [ ] Traverses up from layer path
  - [ ] Finds package.json with realm marker
  - [ ] Handles monorepo structures correctly
  - [ ] Caches results for performance
  - [ ] Unit tests with various folder structures

#### Task 1.3: Create Layer Type Inference
- **Complexity:** Small
- **Description:** Implement logic to determine server/browser from layer name
- **Files:**
  - `core/blong-gogo/src/layerTypeInference.ts` - New file
- **Dependencies:** None
- **Acceptance Criteria:**
  - [ ] Maps well-known layer names to types
  - [ ] Handles explicit type overrides
  - [ ] Provides sensible defaults
  - [ ] Unit tests for all layer types

#### Task 1.4: Implement Activation Config System
- **Complexity:** Medium
- **Description:** Create system for lightweight activation config loading
- **Files:**
  - `core/blong-gogo/src/activationConfig.ts` - New file
  - `core/blong-gogo/src/load.ts` - Integration point
- **Dependencies:** Tasks 1.1, 1.2
- **Acceptance Criteria:**
  - [ ] Loads activation config without importing full layer
  - [ ] Supports boolean, object, and function activation patterns
  - [ ] Evaluates activation for current environment
  - [ ] Minimal performance overhead
  - [ ] Unit tests for activation evaluation

#### Task 1.5: Update Load System
- **Complexity:** Large
- **Description:** Modify load.ts to support conditional layer loading
- **Files:**
  - `core/blong-gogo/src/load.ts` - Major refactoring
  - `core/blong-gogo/src/loadLayer.ts` - New file for layer loading
- **Dependencies:** Tasks 1.1, 1.2, 1.3, 1.4
- **Acceptance Criteria:**
  - [ ] Loads activation config first, then layer code
  - [ ] Only imports activated layers
  - [ ] Loads layers using new self-contained pattern
  - [ ] Removes support for server.ts/browser.ts pattern
  - [ ] Clean, simplified loading logic
  - [ ] Integration tests for new pattern only
  - [ ] Tests for activation filtering

### Phase 2: Core Functionality (Week 3-4)

#### Task 2.1: Layer Auto-Discovery Scanner
- **Complexity:** Medium
- **Description:** Implement scanning logic to find layer files automatically
- **Files:**
  - `core/blong-gogo/src/layerScanner.ts` - New file
  - `core/blong-gogo/src/load.ts` - Integration
- **Dependencies:** Task 1.2
- **Acceptance Criteria:**
  - [ ] Scans for adapter.ts, orchestrator.ts, etc.
  - [ ] Scans for layer.ts in subdirectories
  - [ ] Respects .gitignore patterns
  - [ ] Handles symbolic links safely
  - [ ] Performance: scans typical realm in <100ms
  - [ ] Unit tests with various folder layouts

#### Task 2.2: Configuration Composition System
- **Complexity:** Large
- **Description:** Build system to merge layer configs per environment
- **Files:**
  - `core/blong-gogo/src/configComposer.ts` - New file
  - `core/blong-gogo/src/load.ts` - Use new composer
- **Dependencies:** Task 1.1
- **Acceptance Criteria:**
  - [ ] Merges configs in correct priority order
  - [ ] Handles environment-specific overrides
  - [ ] Supports CLI and env var overrides
  - [ ] Validates merged config against schema
  - [ ] Clear error messages for config issues
  - [ ] Unit tests for various merge scenarios

#### Task 2.3: Layer Dependency Resolution
- **Complexity:** Medium
- **Description:** Resolve and order layer initialization based on dependencies
- **Files:**
  - `core/blong-gogo/src/layerDependency.ts` - New file
- **Dependencies:** Task 2.1
- **Acceptance Criteria:**
  - [ ] Detects dependencies via imports field
  - [ ] Topologically sorts layers
  - [ ] Detects circular dependencies
  - [ ] Reports clear error for unmet dependencies
  - [ ] Validates dependencies are activated
  - [ ] Unit tests with various dependency graphs
  - [ ] Unit tests for inactive dependency scenarios

#### Task 2.4: Update Realm.ts Integration
- **Complexity:** Medium
- **Description:** Modify Realm.ts to work with new layer structure only
- **Files:**
  - `core/blong-gogo/src/Realm.ts` - Refactoring
- **Dependencies:** Tasks 2.1, 2.2, 2.3
- **Acceptance Criteria:**
  - [ ] Realm can be created without server.ts/browser.ts
  - [ ] Realm discovers its layers automatically
  - [ ] Realm initialization follows dependency order
  - [ ] Only loads activated layers
  - [ ] Integration tests for realm initialization
  - [ ] Integration tests for conditional activation

#### Task 2.5: Create Migration Tool
- **Complexity:** Medium
- **Description:** Build comprehensive migration tool
- **Files:**
  - `core/blong-gogo/bin/migrate-layers.ts` - CLI tool
  - `core/blong-gogo/bin/validate-migration.ts` - Pre-migration validator
- **Dependencies:** Phase 1 complete
- **Acceptance Criteria:**
  - [ ] Analyzes existing server.ts/browser.ts
  - [ ] Extracts activation config from environment configs
  - [ ] Generates new layer configuration files with activation
  - [ ] Preserves all existing config
  - [ ] Creates backup of original files
  - [ ] Validates migration success
  - [ ] Provides detailed migration report
  - [ ] Documentation on how to use tool

#### Task 2.6: Update blong-kopi Template
- **Complexity:** Small
- **Description:** Update realm scaffolding template to use new pattern
- **Files:**
  - `core/blong-kopi/adapter/` - Update adapter templates
  - `core/blong-kopi/orchestrator/` - Update orchestrator templates
  - `core/blong-kopi/gateway/` - Update gateway templates
  - `core/blong-kopi/error/` - Update error templates
  - `core/blong-kopi/server.ts` - Remove (no longer needed)
  - `core/blong-kopi/browser.ts` - Remove (no longer needed)
- **Dependencies:** Tasks 1.1, 1.4
- **Acceptance Criteria:**
  - [ ] Templates use self-contained layer pattern
  - [ ] Templates include activation config
  - [ ] Templates show activation patterns for common scenarios
  - [ ] Remove server.ts/browser.ts from templates
  - [ ] Update kopi documentation
  - [ ] Test template generation works correctly

### Phase 3: Polish & Deploy (Week 4-5)

#### Task 3.1: Comprehensive Testing
- **Complexity:** Large
- **Description:** End-to-end testing of new pattern with activation
- **Files:**
  - `core/test/layer-autodiscovery/` - New test realm
  - `core/blong-gogo/src/*.test.ts` - Additional unit tests
  - `core/blong-gogo/src/activation.test.ts` - Activation tests
- **Dependencies:** Phase 2 complete
- **Acceptance Criteria:**
  - [ ] Test realm using only new pattern
  - [ ] Test all layer types (adapter, orchestrator, gateway, etc.)
  - [ ] Test conditional activation per environment
  - [ ] Test inactive layers are not loaded/imported
  - [ ] Test dependency resolution with inactive layers
  - [ ] Test activation config evaluation (boolean, object, function)
  - [ ] Test error conditions and edge cases
  - [ ] Performance tests for discovery and loading
  - [ ] Performance tests show no regression from activation checks
  - [ ] All tests pass in CI/CD

#### Task 3.2: Error Handling & Diagnostics
- **Complexity:** Medium
- **Description:** Improve error messages and debugging for new system
- **Files:**
  - `core/blong-gogo/src/layerDiagnostics.ts` - New file
  - All load-related files - Enhanced error messages
- **Dependencies:** Phase 2 complete
- **Acceptance Criteria:**
  - [ ] Clear errors when layer file not found
  - [ ] Clear errors for config validation failures
  - [ ] Clear errors for dependency issues
  - [ ] Suggestions for common mistakes
  - [ ] Debug logging for discovery process

#### Task 3.3: Create Migration Guide
- **Complexity:** Large
- **Description:** Comprehensive migration documentation
- **Files:**
  - `docs/blong/docs/migration/v2-layer-migration.md` - New migration guide
  - `docs/blong/docs/concepts/layer.md` - Update with new pattern
  - `docs/blong/docs/concepts/realm.md` - Update
  - `docs/blong/docs/patterns/self-contained-layers.md` - New pattern guide
- **Dependencies:** Tasks 3.1, 3.2
- **Acceptance Criteria:**
  - [ ] Step-by-step migration instructions
  - [ ] Before/after code examples for each layer type
  - [ ] Common migration pitfalls and solutions
  - [ ] Migration tool usage guide
  - [ ] FAQ section
  - [ ] Troubleshooting guide
  - [ ] Clear breaking changes documentation

#### Task 3.4: Update Skills
- **Complexity:** Medium
- **Description:** Update agent skills to reflect new patterns only
- **Files:**
  - `.github/skills/layer/SKILL.md` - Major update
  - `.github/skills/realm/SKILL.md` - Update
  - `.github/skills/adapter/SKILL.md` - Update examples
  - `.github/skills/orchestrator/SKILL.md` - Update examples
  - `.github/copilot-instructions.md` - Update with new patterns
- **Dependencies:** Task 3.3
- **Acceptance Criteria:**
  - [ ] Skills show only new pattern
  - [ ] Remove all references to server.ts/browser.ts pattern
  - [ ] Clear examples of self-contained layers
  - [ ] Updated code snippets
  - [ ] Cross-references updated

#### Task 3.5: Example Realms
- **Complexity:** Medium
- **Description:** Create example realms demonstrating new pattern
- **Files:**
  - `core/test/layer-example/` - New example realm
  - `docs/blong/static/examples/` - Additional examples
- **Dependencies:** Phase 2 complete
- **Acceptance Criteria:**
  - [ ] Simple example with 2-3 layers
  - [ ] Complex example with dependencies
  - [ ] Browser and server layer examples
  - [ ] Examples in documentation site
  - [ ] Examples run successfully

#### Task 3.6: Performance Optimization
- **Complexity:** Medium
- **Description:** Optimize discovery and loading performance
- **Files:**
  - `core/blong-gogo/src/layerScanner.ts` - Optimization
  - `core/blong-gogo/src/RealmDiscovery.ts` - Caching improvements
- **Dependencies:** Task 3.1 (need baseline performance)
- **Acceptance Criteria:**
  - [ ] Layer discovery cached appropriately
  - [ ] No performance regression vs old pattern
  - [ ] Watch mode updates only affected layers
  - [ ] Startup time within 10% of baseline
  - [ ] Performance benchmarks documented

## Considerations

### Assumptions
- **Assumption 1:** package.json exists at realm boundary
  - **Validation:** Check existing realms - all have package.json
  - **Mitigation:** Support marker file as alternative

- **Assumption 2:** Layer names are stable and predictable
  - **Validation:** Review existing codebase for custom layer names
  - **Mitigation:** Explicit type override for edge cases

- **Assumption 3:** Monorepo structure won't cause conflicts
  - **Validation:** Test with multiple Rush.js packages
  - **Mitigation:** Explicit realm marker in package.json

- **Assumption 4:** File system access is fast enough for discovery
  - **Validation:** Performance testing in Phase 3
  - **Mitigation:** Aggressive caching and watch mode optimization

### Constraints
- **Time:** 4-5 weeks for full implementation (simpler without backward compatibility)
- **Breaking Change:** Major version bump required (v2.0)
- **Performance:** Must match or exceed current performance
- **API Stability:** New APIs should be stable from v2.0
- **Migration Support:** Excellent tooling and documentation required

### Risks

#### Risk 1: Performance Impact
- **Probability:** Medium
- **Impact:** High
- **Mitigation:** 
  - Benchmark early and often
  - Implement caching from the start
  - Lazy load where possible
  - Keep discovery algorithm simple

#### Risk 2: Migration Complexity
- **Probability:** High
- **Impact:** High
- **Mitigation:**
  - Excellent automated migration tool
  - Pre-migration validation to identify issues
  - Comprehensive migration guide with examples
  - Beta testing with real projects
  - Migration support period with active help
  - Rollback documentation if needed

#### Risk 3: User Adoption Resistance
- **Probability:** Medium
- **Impact:** High
- **Mitigation:**
  - Clear communication of benefits
  - Excellent migration tooling to minimize effort
  - Examples showing improvements
  - Support channels for questions
  - Phased rollout to identify issues early

#### Risk 4: Edge Cases in Discovery
- **Probability:** High
- **Impact:** Medium
- **Mitigation:**
  - Extensive testing with various folder structures
  - Clear error messages
  - Explicit configuration override option
  - Diagnostic tools for troubleshooting

#### Risk 5: Monorepo Conflicts
- **Probability:** Low
- **Impact:** High
- **Mitigation:**
  - Test with Rush.js monorepo structure
  - Realm marker in package.json
  - Explicit realm boundary configuration
  - Documentation for monorepo setup

## Not Included (Future Enhancements)

### Version 2.0 (This Plan)
- Self-contained layer definition
- Auto-discovery of layers
- Flexible folder structure
- Breaking change with migration support

### Future Versions (Not in Scope)

#### V2.0: Dynamic Layer Loading
- Load layers on-demand rather than at startup
- Unload unused layers to save memory
- Hot-swap layers without restart
- **Reason for deferral:** Requires runtime architecture changes

#### V2.0: Layer Marketplace
- Share reusable layers across projects
- Versioned layer packages
- Layer dependency management
- **Reason for deferral:** Needs ecosystem maturity

#### V2.0: Layer Templates
- Scaffolding tool for new layers
- Best practice templates
- Interactive layer generator
- **Reason for deferral:** Better to learn patterns first

#### V2.x: Cross-Realm Layer Sharing
- One layer used by multiple realms
- Shared layer versioning
- Dependency management across realms
- **Reason for deferral:** Complex dependency issues

#### V2.x: Conditional Layer Loading
- Load layers based on runtime conditions
- Feature flags for layers
- A/B testing with different layer implementations
- **Reason for deferral:** Need clear use cases first

#### V3.0: Distributed Layers
- Layers running in separate processes
- Remote layer execution
- Layer as a service
- **Reason for deferral:** Major architectural change

## Migration Strategy

### Migration Approach

**All existing projects must migrate** to the new pattern when upgrading to v2.0. The migration is mandatory but well-supported with tooling and documentation.

#### Pre-Migration Steps
1. **Backup your code** - Commit all changes to version control
2. **Run validation tool** - Check compatibility and identify issues
3. **Review migration guide** - Understand what will change
4. **Plan migration timing** - Choose appropriate time for upgrade

#### Automated Migration Process
1. **Run migration tool** - `blong migrate-layers ./realmname`
   - Analyzes server.ts/browser.ts configuration
   - Generates self-contained layer files
   - Creates backups of original files
   - Validates all config is preserved
   
2. **Review generated files** - Check layer definitions
   - Verify configuration accuracy
   - Ensure all layers discovered
   - Check namespace and import mappings

3. **Test thoroughly** - Validate functionality
   - Run existing test suite
   - Manual testing of key workflows
   - Check logs for errors

4. **Remove old files** - Clean up after successful migration
   - Delete server.ts/browser.ts backups
   - Update any documentation references

#### Manual Migration (if needed)
For complex cases or custom requirements:
1. Create self-contained layer definitions manually
2. Move config from server.ts to each layer
3. Add validation schemas to each layer
4. Remove server.ts/browser.ts files
5. Test and validate

### For New Projects

- **Use only new pattern** - No server.ts/browser.ts
- **Follow examples** from documentation
- **Self-contained layers** from the start
- **Use migration guide** as reference for patterns

## Success Metrics

### Technical Metrics
- [ ] Clean implementation without backward compatibility layer
- [ ] Performance matches or exceeds current (within 5%)
- [ ] All new tests pass
- [ ] New test coverage >80%
- [ ] Discovery time <100ms for typical realm

### Migration Metrics
- [ ] Migration tool success rate >95%
- [ ] Average migration time <30 minutes per realm
- [ ] At least 3 test realms successfully migrated
- [ ] Clear error messages for migration issues
- [ ] Rollback process documented and tested

### Adoption Metrics
- [ ] At least 3 example realms using new pattern
- [ ] Comprehensive migration guide published
- [ ] Zero P0 bugs in first month after release
- [ ] Positive feedback from beta testers
- [ ] Active support channels established

### Quality Metrics
- [ ] Clear error messages for common issues
- [ ] Debugging tools available
- [ ] Documentation easy to follow
- [ ] Skills updated and accurate
- [ ] Performance benchmarks documented

## Timeline

### Week 1-2: Foundation
- Define APIs and interfaces
- Implement discovery logic
- Create type inference
- Update load system (remove old pattern support)

### Week 3-4: Core Functionality  
- Auto-discovery scanner
- Configuration composition
- Dependency resolution
- Realm integration
- Migration tool development

### Week 4-5: Polish & Deploy
- Comprehensive testing
- Error handling improvements
- Migration guide creation
- Documentation updates
- Skills updates
- Example realms
- Performance optimization

### Total: 4-5 weeks (faster without backward compatibility)

### Post-Release
- Monitor migrations and feedback
- Address issues promptly
- Iterate on migration guide
- Consider future enhancements

## Open Questions

1. **Should we require a specific marker in package.json to identify realms?**
   - Pro: Clear boundary, no ambiguity
   - Con: Extra step for users
   - **Recommendation:** Optional marker, use heuristics if absent

2. **How do we handle nested realms (realm within a realm)?**
   - Current: Not supported
   - Future: Could enable composition patterns
   - **Recommendation:** Defer to future version, document limitation

3. **Should layer discovery be recursive or single-level?**
   - Recursive: Finds layers in any subfolder
   - Single-level: Only immediate children
   - **Recommendation:** Single-level with explicit children for deeper levels

4. **How do we version the layer configuration format?**
   - Schema version field?
   - Implicit from framework version?
   - **Recommendation:** Framework version, breaking changes in major versions

5. **Should we support layer configuration in package.json?**
   - Pro: Single file for realm and layers
   - Con: Large package.json, mixing concerns
   - **Recommendation:** Support but not recommend; prefer separate files

## Next Steps

1. **Review this plan** with core team and stakeholders
2. **Prioritize must-have vs nice-to-have** features
3. **Validate assumptions** about monorepo structure
4. **Create proof-of-concept** for discovery algorithm
5. **Set up project tracking** (GitHub issues/project board)
6. **Begin Phase 1 implementation** once approved
7. **Schedule weekly check-ins** during implementation
8. **Plan beta release** for early feedback
