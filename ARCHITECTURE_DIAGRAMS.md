# Architecture Diagrams: Layer Improvement

## Current Architecture (Before Changes)

### Loading Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│                    Application Startup                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    load.ts: loadRealm()                         │
│  • Receives: server.ts or browser.ts module                    │
│  • Reads: validation schema, children[], config{}              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Parse server.ts/browser.ts                         │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ server(blong => ({                                        │ │
│  │   validation: {...},  ← Centralized schema               │ │
│  │   children: ['./adapter', './orchestrator', './gateway'] │ │
│  │   config: {                                               │ │
│  │     default: {db: {...}, http: {...}, dispatch: {...}}   │ │
│  │     dev: {...},                                           │ │
│  │     prod: {...}                                           │ │
│  │   }                                                        │ │
│  │ }))                                                        │ │
│  └───────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Load Each Child (Sequential)                       │
│                                                                 │
│   ./adapter  ──────►  load adapter/                            │
│                       ├─ db.ts (minimal, extends base)         │
│                       └─ http.ts (minimal, extends base)       │
│                                                                 │
│   ./orchestrator ───► load orchestrator/                       │
│                       └─ dispatch.ts (minimal, extends base)   │
│                                                                 │
│   ./gateway  ──────►  load gateway/                            │
│                       └─ api/ (yaml files)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Merge Configurations                               │
│  1. Take default from server.ts                                │
│  2. Merge environment config (dev/prod/test)                   │
│  3. Apply to each layer                                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Initialize Realm                                   │
│  • Create Realm instance                                       │
│  • Register layers                                             │
│  • Initialize adapters & orchestrators                         │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow (Current)

```
┌──────────────┐
│  server.ts   │  ◄── SINGLE SOURCE OF TRUTH
│              │      • All validation schemas
│  validation: │      • All children listed
│    db: {}    │      • All configurations
│    http: {}  │
│  children:   │
│    ./adapter │
│  config:     │
│    default   │
│    dev       │
│    prod      │
└──────┬───────┘
       │
       ├─────────► adapter/db.ts
       │            extends: 'adapter.sql'  ◄── Config comes from parent
       │
       ├─────────► adapter/http.ts
       │            extends: 'adapter.http' ◄── Config comes from parent
       │
       └─────────► orchestrator/dispatch.ts
                    extends: 'orchestrator.dispatch' ◄── Config comes from parent
```

### Problem Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│  PROBLEM: Separation of Concerns                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   server.ts (line 50)              adapter/db.ts               │
│   ┌─────────────────┐              ┌──────────────┐            │
│   │ config: {       │              │ export       │            │
│   │   db: {         │              │ default      │            │
│   │     host: "..." │   ═══════►   │ adapter(...) │            │
│   │     port: 5432  │    Config    │              │            │
│   │   }             │   defined    └──────────────┘            │
│   │ }               │   far from                               │
│   └─────────────────┘   implementation                         │
│                                                                 │
│   Developer must:                                              │
│   1. Edit server.ts to add config                             │
│   2. Edit server.ts to add validation                         │
│   3. Edit server.ts to list children                          │
│   4. Edit adapter/db.ts for implementation                    │
│                                                                 │
│   Knowledge is scattered across files!                         │
└─────────────────────────────────────────────────────────────────┘
```

## Proposed Architecture (After Changes)

### Loading Sequence (New)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Application Startup                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              RealmDiscovery.discoverLayers()                    │
│  • Scan for layer files (adapter.ts, orchestrator.ts, etc.)   │
│  • Check layer/ subdirectories                                 │
│  • Find package.json (realm boundary)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Found Layers (Auto-discovered)                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ adapter/db.ts         (server-side, inferred)            │  │
│  │ adapter/http.ts       (server-side, inferred)            │  │
│  │ orchestrator/dispatch.ts (server-side, inferred)         │  │
│  │ gateway/api.ts        (server-side, inferred)            │  │
│  │ backend/api.ts        (browser-side, inferred)           │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Load Each Layer (Parallel Safe)                    │
│                                                                 │
│   adapter/db.ts ─────────►  ┌──────────────────────┐           │
│                             │ adapter(() => ({      │           │
│                             │   validation: {...},  │ Self-     │
│                             │   config: {           │ Contained │
│                             │     default: {...},   │           │
│                             │     dev: {...}        │           │
│                             │   }                   │           │
│                             │ }))                   │           │
│                             └──────────────────────┘           │
│                                                                 │
│   adapter/http.ts ────────► (same pattern)                     │
│   orchestrator/dispatch.ts ► (same pattern)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Dependency Resolution                              │
│  • Analyze imports: [] from each layer                         │
│  • Build dependency graph                                      │
│  • Topological sort                                            │
│  • Detect circular dependencies                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Merge Configurations (Per Layer)                   │
│  For each layer:                                               │
│  1. Layer's default config                                     │
│  2. Layer's environment config (dev/prod/test)                 │
│  3. Parent overrides (optional, backward compat)               │
│  4. CLI parameters                                             │
│  5. Environment variables                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Initialize Realm                                   │
│  • Create Realm instance                                       │
│  • Initialize layers in dependency order                       │
│  • Register with framework registry                            │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow (Proposed)

```
SELF-CONTAINED LAYERS - Each layer owns its config

adapter/db.ts
┌──────────────────────────┐
│ export default adapter   │  ◄── SELF-CONTAINED
│                          │      • Own validation
│ validation: {            │      • Own config
│   host: String,          │      • Own children
│   port: Number           │
│ }                        │
│                          │
│ config: {                │
│   default: {             │
│     namespace: [...],    │
│     imports: [...]       │
│   },                     │
│   dev: {                 │
│     host: 'localhost',   │
│     logLevel: 'trace'    │
│   },                     │
│   prod: {                │
│     host: env.DB_HOST,   │
│     logLevel: 'warn'     │
│   }                      │
│ }                        │
└──────────────────────────┘

orchestrator/dispatch.ts
┌──────────────────────────┐
│ export default           │  ◄── SELF-CONTAINED
│   orchestrator           │      • Own validation
│                          │      • Own config
│ validation: {            │      • Own children
│   namespace: Array,      │
│   imports: Array         │
│ }                        │
│                          │
│ config: {                │
│   default: {             │
│     namespace: ['user'], │
│     imports: ['db.user'] │
│   }                      │
│ }                        │
└──────────────────────────┘

No central catalog needed!
Framework discovers all layers automatically.
```

### Solution Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│  SOLUTION: Co-location of Concerns                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   adapter/db.ts                                                │
│   ┌────────────────────────────────────────────┐               │
│   │ export default adapter(() => ({            │               │
│   │                                            │               │
│   │   extends: 'adapter.sql',                 │  Implementation│
│   │                                            │               │
│   │   validation: {                           │  Validation    │
│   │     host: String,                         │               │
│   │     port: Number                          │               │
│   │   },                                       │               │
│   │                                            │  Configuration │
│   │   config: {                               │               │
│   │     default: {                            │               │
│   │       host: 'localhost',                  │               │
│   │       port: 5432                          │               │
│   │     },                                     │               │
│   │     prod: {                               │               │
│   │       host: process.env.DB_HOST          │               │
│   │     }                                      │               │
│   │   }                                        │               │
│   │ }))                                        │               │
│   └────────────────────────────────────────────┘               │
│                                                                 │
│   Everything in one place!                                     │
│   Developer only edits one file.                               │
│   Config, validation, and implementation co-located.           │
└─────────────────────────────────────────────────────────────────┘
```

## Layer Type Detection

```
┌─────────────────────────────────────────────────────────────────┐
│              Layer Name → Type Mapping                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Well-Known Names        Type        Purpose                  │
│   ─────────────────────   ────────   ──────────────────────    │
│   adapter                 server     External systems          │
│   orchestrator            server     Business logic            │
│   gateway                 server     API layer                 │
│   error                   server     Error definitions         │
│   test                    server     Test automation           │
│   eft                     server     Funds transfer            │
│                                                                 │
│   backend                 browser    Server communication      │
│   component               browser    UI components             │
│   browser                 server     Asset serving             │
│                                                                 │
│   Custom Names                                                 │
│   ─────────────────────                                        │
│   myCustomLayer           explicit   Must specify type:       │
│                           required   type: 'server' | 'browser'│
└─────────────────────────────────────────────────────────────────┘

Example:
┌────────────────────────┐
│ adapter/db.ts          │  → Inferred: server-side
│ orchestrator/user.ts   │  → Inferred: server-side
│ backend/api.ts         │  → Inferred: browser-side
│ analytics/tracker.ts   │  → Explicit: must specify type
└────────────────────────┘
```

## Realm Discovery Process

```
┌─────────────────────────────────────────────────────────────────┐
│              Finding the Realm Boundary                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Start: /path/to/realmname/adapter/db.ts                     │
│                                                                 │
│   Step 1: Check current directory                             │
│   /path/to/realmname/adapter/                                 │
│   └─ package.json exists? No                                  │
│                                                                 │
│   Step 2: Go up one level                                      │
│   /path/to/realmname/                                          │
│   └─ package.json exists? Yes! ✓                              │
│      ├─ Has "realm": true? Yes                                │
│      ├─ Has "name" field? Yes: "@company/realmname"           │
│      └─ This is the realm boundary                            │
│                                                                 │
│   Result:                                                      │
│   ┌──────────────────────────────────────┐                    │
│   │ Realm Path:  /path/to/realmname/     │                    │
│   │ Realm Name:  realmname               │                    │
│   │ Package:     @company/realmname      │                    │
│   │ Layers:      Auto-discover from here │                    │
│   └──────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration Merge Priority

```
┌─────────────────────────────────────────────────────────────────┐
│              Configuration Priority (Highest First)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Priority  Source                Example                      │
│   ────────  ──────────────────    ─────────────────────────    │
│      1      CLI Parameter         --config.db.host=localhost   │
│      2      Environment Variable  BLONG_DB_HOST=localhost      │
│      3      Environment Config    config.dev.db.host           │
│      4      Layer Default         layer's config.default.db    │
│      5      Parent Override       server.ts override (legacy)  │
│      6      Framework Default     Built-in fallback            │
│                                                                 │
│   Merge Strategy: Deep merge with highest priority wins        │
│                                                                 │
│   Example Merge:                                               │
│   ┌────────────────────────────────────────────────────────┐   │
│   │ Layer default:     {host: 'localhost', port: 5432}    │   │
│   │ Environment (dev): {host: '127.0.0.1', user: 'dev'}   │   │
│   │ CLI param:         {port: 3000}                        │   │
│   │                                                         │   │
│   │ Result: {                                              │   │
│   │   host: '127.0.0.1',  ← From environment (higher)     │   │
│   │   port: 3000,         ← From CLI (highest)            │   │
│   │   user: 'dev'         ← From environment              │   │
│   │ }                                                       │   │
│   └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Migration Scenarios

### Scenario 1: Gradual Migration

```
Before:
realmname/
├── server.ts              ◄── Defines all config
├── adapter/
│   ├── db.ts             ◄── Minimal (extends only)
│   └── http.ts           ◄── Minimal (extends only)
└── orchestrator/
    └── dispatch.ts        ◄── Minimal (extends only)

Step 1: Migrate db adapter
realmname/
├── server.ts              ◄── Still has http & dispatch config
├── adapter/
│   ├── db.ts             ◄── NOW SELF-CONTAINED ✓
│   └── http.ts           ◄── Still minimal
└── orchestrator/
    └── dispatch.ts        ◄── Still minimal

Step 2: Migrate http adapter
realmname/
├── server.ts              ◄── Only has dispatch config
├── adapter/
│   ├── db.ts             ◄── Self-contained ✓
│   └── http.ts           ◄── NOW SELF-CONTAINED ✓
└── orchestrator/
    └── dispatch.ts        ◄── Still minimal

Step 3: Migrate orchestrator
realmname/
├── server.ts              ◄── Empty or minimal
├── adapter/
│   ├── db.ts             ◄── Self-contained ✓
│   └── http.ts           ◄── Self-contained ✓
└── orchestrator/
    └── dispatch.ts        ◄── NOW SELF-CONTAINED ✓

Step 4: Remove server.ts (optional)
realmname/
├── adapter/
│   ├── db.ts             ◄── Self-contained ✓
│   └── http.ts           ◄── Self-contained ✓
└── orchestrator/
    └── dispatch.ts        ◄── Self-contained ✓

All layers discovered automatically!
```

### Scenario 2: Big Bang Migration

```
Before:
realmname/
├── server.ts              ◄── Defines all config
├── adapter/
│   ├── db.ts             ◄── Minimal
│   └── http.ts           ◄── Minimal
└── orchestrator/
    └── dispatch.ts        ◄── Minimal

Run: blong migrate-layers ./realmname

┌────────────────────────────────────────┐
│ Migration Tool                         │
├────────────────────────────────────────┤
│ ✓ Analyzing server.ts                 │
│ ✓ Extracting db config                │
│ ✓ Extracting http config              │
│ ✓ Extracting dispatch config          │
│ ✓ Writing adapter/db.ts               │
│ ✓ Writing adapter/http.ts             │
│ ✓ Writing orchestrator/dispatch.ts    │
│ ✓ Creating server.ts.backup           │
│                                        │
│ Migration complete!                    │
│ Test before removing server.ts.backup  │
└────────────────────────────────────────┘

After:
realmname/
├── server.ts.backup       ◄── Backup (safe to delete after testing)
├── adapter/
│   ├── db.ts             ◄── NOW SELF-CONTAINED ✓
│   └── http.ts           ◄── NOW SELF-CONTAINED ✓
└── orchestrator/
    └── dispatch.ts        ◄── NOW SELF-CONTAINED ✓
```

## Performance Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│              Startup Time Comparison                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Current Pattern (server.ts)                                  │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ Load server.ts           10ms                        │     │
│   │ Parse children array     5ms                         │     │
│   │ Load layers (sequential) 50ms                        │     │
│   │ Merge configs            15ms                        │     │
│   │ Initialize               20ms                        │     │
│   │ ─────────────────────────────                        │     │
│   │ Total:                   100ms                       │     │
│   └──────────────────────────────────────────────────────┘     │
│                                                                 │
│   New Pattern (auto-discovery)                                 │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ Discover layers          15ms (cached: 1ms)          │     │
│   │ Load layers (parallel)   35ms                        │     │
│   │ Merge configs            15ms                        │     │
│   │ Resolve dependencies     5ms                         │     │
│   │ Initialize               20ms                        │     │
│   │ ─────────────────────────────                        │     │
│   │ Total:                   90ms (cached: 76ms)         │     │
│   └──────────────────────────────────────────────────────┘     │
│                                                                 │
│   Result: Faster or equal, especially with caching             │
└─────────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              Error Scenarios & Messages                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Scenario 1: Layer file not found                            │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ Error: Cannot find layer definition                  │     │
│   │ Path: /path/to/realmname/adapter/missing.ts         │     │
│   │                                                       │     │
│   │ Expected one of:                                     │     │
│   │   • adapter/missing.ts                               │     │
│   │   • adapter/missing/layer.ts                         │     │
│   │   • adapter/missing/index.ts                         │     │
│   │                                                       │     │
│   │ Did you mean: adapter/db.ts?                         │     │
│   └──────────────────────────────────────────────────────┘     │
│                                                                 │
│   Scenario 2: Config validation failure                       │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ Error: Layer configuration invalid                   │     │
│   │ Layer: adapter/db                                    │     │
│   │ Environment: dev                                     │     │
│   │                                                       │     │
│   │ Missing required property: "host"                    │     │
│   │ Expected: String                                     │     │
│   │ Received: undefined                                  │     │
│   │                                                       │     │
│   │ Fix: Add "host" to config.dev in adapter/db.ts      │     │
│   └──────────────────────────────────────────────────────┘     │
│                                                                 │
│   Scenario 3: Circular dependency                             │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ Error: Circular dependency detected                  │     │
│   │                                                       │     │
│   │ adapter/db → orchestrator/user → adapter/db          │     │
│   │     ↑                                    │            │     │
│   │     └────────────────────────────────────┘            │     │
│   │                                                       │     │
│   │ Fix: Remove dependency or refactor to break cycle   │     │
│   └──────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Phases

```
┌─────────────────────────────────────────────────────────────────┐
│              4-5 Week Implementation Timeline                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Phase 1: Foundation (Week 1-2)                               │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ • Define ILayerConfig API                            │     │
│   │ • Implement realm discovery (package.json)           │     │
│   │ • Create layer type inference                        │     │
│   │ • Update load.ts for new pattern only               │     │
│   │                                                       │     │
│   │ Deliverable: Core APIs and discovery working         │     │
│   └──────────────────────────────────────────────────────┘     │
│                                                                 │
│   Phase 2: Core Functionality (Week 3-4)                       │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ • Auto-discovery scanner                             │     │
│   │ • Configuration composition system                   │     │
│   │ • Layer dependency resolution                        │     │
│   │ • Realm.ts integration (new pattern only)            │     │
│   │ • Comprehensive migration tool                       │     │
│   │                                                       │     │
│   │ Deliverable: Full feature implementation             │     │
│   └──────────────────────────────────────────────────────┘     │
│                                                                 │
│   Phase 3: Polish & Deploy (Week 4-5)                          │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ • Comprehensive testing                              │     │
│   │ • Error handling & diagnostics                       │     │
│   │ • Migration guide creation                           │     │
│   │ • Documentation updates                              │     │
│   │ • Skills updates                                     │     │
│   │ • Example realms                                     │     │
│   │ • Performance optimization                           │     │
│   │                                                       │     │
│   │ Deliverable: v2.0 production release                 │     │
│   └──────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘

Note: Faster timeline due to simpler implementation without backward 
compatibility layer. Breaking change requires v2.0 major version bump.
```

---

*These diagrams provide a visual reference for the architectural changes described in the Implementation Plan.*
