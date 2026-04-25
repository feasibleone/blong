# Wiring Pipeline — How blong-gogo Loads and Wires the Framework

## Problem

`core/blong-gogo/` — the runtime that loads solutions, realms, layers, and
handlers — had accumulated several structural issues that made it harder to
understand, extend, and test:

- The adapter base object was a ~300-line plain-object literal closing over a
  large `utBus` compatibility surface (a legacy `ut-bus` API wrapper). The
  indirection added noise and obscured the actual dependencies.
- The `layerProxy.ts` file was ~425 lines with the handler proxy (the
  framework's IoC mechanism) buried inside deeply nested closures.
- Infrastructure objects were instantiated in a hard-coded ordered array,
  making dependency relationships implicit and fragile.
- `Watch.ts` had three near-identical paths for hot-reloading handler folders,
  individual handler files, and layer files.
- Config merging was scattered across four sites: `loadRealm()`, `layerProxy`,
  `adapter.activeConfig()`, and `Watch._loadHandlers()`.

## Solution

A focused simplification refactoring addressed each issue:

1. **Extracted `handlerProxy.ts`** — the handler proxy (the IoC mechanism) is
   now a standalone, testable, named module.
2. **Extracted `createHandlerClosure`** — the handler-closure assembly is a
   named function, making the flow explicit.
3. **Replaced `utBus` with direct calls** — `Registry.createPort()` now passes
   the actual API objects directly to adapters; the legacy wrapper is gone.
4. **Converted the adapter base to `AdapterBase` class** — provided through
   the runtime rather than via direct import, preserving the constraint that
   realms never depend on `blong-gogo`.
5. **Made infrastructure instantiation order explicit** — each infrastructure
   item declares its dependencies; `load.ts` performs a topological sort before
   instantiation.
6. **Unified Watch reload paths** — a single `_reloadUnit` abstraction handles
   the re-import → re-proxy → replace-in-registry flow, eliminating duplicated
   code across the three hot-reload paths.
7. **Unified config merging into `ConfigRuntime`** — all merge operations now
   go through `ConfigRuntime`, which owns the full config lifecycle.
8. **Prepared `RpcServer` registration for conditional methods** — a `localOnly`
   config map allows methods to be excluded from RpcServer registration when
   running as a monolith.

Note: the word "port" comes from legacy terminology. In Blong, the preferred
terms are "adapters" and "orchestrators".

---

## Overview

The wiring pipeline converts a declarative suite definition (a tree of
`server()` / `browser()` / `realm()` factories) into a running system of
connected adapters, orchestrators, gateways, and handlers. The pipeline has
four major phases:

```
  ┌──────────────┐    ┌────────────┐    ┌──────────────┐    ┌──────────────┐
  │  1. Bootstrap │ →  │  2. Load   │ →  │  3. Wire     │ →  │  4. Start    │
  │   (infra)    │    │  (tree)    │    │  (registry)  │    │  (lifecycle) │
  └──────────────┘    └────────────┘    └──────────────┘    └──────────────┘
```

| Phase | Entry point | What happens |
|-------|-------------|-------------|
| **Bootstrap** | `loadServer.ts` / `loadBrowser.ts` → `load.ts` | Platform API is bound, the root factory is invoked, and infrastructure objects (Log, Error, Registry, Gateway, Remote, Local, Watch, etc.) are instantiated in dependency order. |
| **Load** | `loadRealm()` in `load.ts` | The suite tree is walked recursively. Realms and layers are discovered, imported, and classified. Handler files are read and grouped. |
| **Wire** | `layerProxy.ts` + `Realm.ts` → `Registry` | Handlers are wrapped in closures and registered as methods/ports in the Registry. Adapters and orchestrators are wrapped in port factories. The handler proxy is assembled. |
| **Start** | `Registry.start()` | Ports are created and started. Handler groups are attached to ports. Validations are collected. Gateway routes are built. Watch mode is initialized. |

---

## Component Inventory

### Entry Points

| File | Role |
|------|------|
| `loadServer.ts` | Binds Node.js platform APIs (fs, path, chokidar) and calls `load()`. |
| `loadBrowser.ts` | Binds browser-compatible stubs and calls `load()`. |
| `load.ts` (`loadRealm()`) | The universal recursive loader. Platform-agnostic. |
| `runServer.ts` | CLI entry: parses arguments, calls `loadServer()`, starts the registry. |

### Infrastructure Objects (instantiated during Bootstrap)

These are instantiated once at the root of the tree. Each is a class that
extends `Internal` (from `@feasibleone/blong/types`). Their instantiation order
is determined by an explicit dependency declaration in `load.ts`, not a
hard-coded array position.

| Class | Interface | Responsibility |
|-------|-----------|----------------|
| `Log` / `BrowserLog` | `ILog` | Structured logging (pino on server, console in browser). |
| `ErrorFactory` | `IErrorFactory` | Typed error registration and creation. |
| `Local` | `ILocal` | In-process method registry — a flat `{namespace.name → {method}}` map used for local dispatch. |
| `Registry` | `IRegistry` | Central wiring hub. Owns the `ports` map (port factories), `methods` map (handler groups), and `modules` map (sub-registries). Drives the lifecycle. |
| `Remote` / `RpcClient` | `IRemote` | Method dispatch: finds local handler or sends over RPC. Owns retry, timeout, caching, and `$meta` enforcement. |
| `RpcServer` | `IRpcServer` | Internal Fastify server for inter-service JSON-RPC communication. |
| `Gateway` | `IGateway` | External-facing Fastify server. Builds routes from collected validations. Handles JWT auth, MLE, CORS. |
| `Watch` | `IWatch` | File system watcher. Handles hot-reload of handlers, layers, config, and test re-runs. |
| `ResolutionLocal` / `ResolutionDiscovery` | `IResolution` | Service discovery (localhost in dev, mDNS in prod). |
| `ApiSchema` | `IApiSchema` | Loads/generates OpenAPI schemas and TypeBox validation schemas. |
| `ConfigRuntime` | `IConfigRuntime` | Owns the full config lifecycle: load, merge, proxy exposure, diff, and change notification. |

### Structural Files

| File | Role |
|------|------|
| `Realm.ts` | Receives loaded items and registers them in the Registry as ports (adapters/orchestrators) or method groups (handlers). |
| `layerProxy.ts` | A `Proxy` object returned by `layerProxy()` that intercepts property access during the layer-loading phase to classify and wrap items (handlers → method closures, adapters/orchestrators → port factories). |
| `handlerProxy.ts` | Creates the handler proxy — the IoC mechanism that resolves handler calls at runtime through the registry (local or remote). Also provides `createHandlerClosure`. |
| `AdapterBase.ts` | The runtime-provided base class for all adapters. Exposed through the runtime injection mechanism — realms never import it directly. Custom adapters extend it via prototype-chain inheritance. |
| `loop.ts` | The adapter request/response loop — handles send/receive conversion chains. |
| `lib.ts` | Utility functions: `methodId()`, `methodParts()`, `camelToSentence()`, `parseAnnotatedKey()`. |
| `folderAnalysis.ts` | Analyzes a directory to classify it as suite/realm/handlers. Used for auto-wrapping loose handlers. |

### Sub-Realms (internal packages loaded as children)

| Package folder | Role |
|----------------|------|
| `adapter/server.ts` | Declares available server adapter types (tcp, http, knex, etc.) as a realm. |
| `adapter/browser.ts` | Declares available browser adapter types. |
| `orchestrator/index.ts` | Declares available orchestrator types (dispatch, openapi, etc.). |
| `codec/server.ts` / `codec/browser.ts` | Declares codec implementations. |

---

## Loading Pipeline in Detail

### Phase 1 — Bootstrap

`loadServer.ts` (or `loadBrowser.ts`) calls `load.ts:loadRealm()` with:
- A **platform API** object (filesystem operations, `watch`, `hrtime`, etc.)
- The root **suite factory** (a function annotated with `server()` or `browser()`)
- A **name** (suite name) and **parentConfig** (config file name or object)
- **configNames** (active environment names like `['dev']`, `['integration']`)

On the first call (`api` is undefined), `loadRealm()`:
1. Creates the initial config skeleton with defaults for all infrastructure keys.
2. Builds the infrastructure **items** list with explicit dependency declarations
   and performs a topological sort. Items are instantiated in the resolved order
   (Log, ApiSchema, Port, Error, Watch, Local, Remote/RpcClient, RpcServer,
   Gateway, RestFs, Registry, Codec, Orchestrator, Adapter).
3. Invokes the root factory to get the module config (`mod`), which contains
   `{url, pkg, children, config}`.
4. Merges all config sources through `ConfigRuntime`: module defaults,
   environment overrides, external config files.

### Phase 2 — Tree Walking

The merged `children` list is iterated. Each child can be:

| Child type | Detection | Action |
|------------|-----------|--------|
| **String** (path) | `typeof item === 'string'` | Resolved to a file. On server/browser kind: builds an import function that loads the layer entry file (`{kind}.ts`). On solution kind: scans the directory for sub-items. |
| **Function** (factory) | Infrastructure items or realm factories | Imported dynamically. |
| **Glob object** (browser) | `item.isDirectory` or `item.isFile` present | Loaded via `watch.load()` which calls `_loadHandlers()` or single-file load. |

After import, each item is classified:

| Item kind | How detected | How processed |
|-----------|--------------|---------------|
| **Internal subclass** or `[System]` marker | `fn.prototype instanceof Internal \|\| fn[System]` | Instantiated as an infrastructure object: `api[itemName] = new fn(config, api)` |
| **solution / server / browser** | `kind(fn)` returns `'solution'`, `'server'`, `'browser'` | Recursive call to `loadRealm()`. Result registered via `realm.addModule()`. |
| **Anything else** (layer function) | Default case | Invoked with a `layerProxy(...)`. Result registered via `realm.addLayer()`. |

**Auto-discovery:** Before iterating children, `discoverLayerFolders()` scans
the realm directory for well-known folder names (`error`, `adapter`,
`orchestrator`, `gateway`, `sim`, `test`, `backend`, `component`, etc.) that
are not already listed. These are added as extra children with their default
activation config.

### Phase 3 — layerProxy (The Core Wiring Mechanism)

`layerProxy()` returns a `Proxy` object. When a layer function executes
`api.someGroup(items, namespace, source)`, the proxy's `get` trap activates.

The trap classifies each item in `items`:

```
┌─────────────────────────────────────┐
│  For each item in the items array:  │
├─────────────────────────────────────┤
│                                     │
│  Is it a Port subclass or           │
│  kind === 'adapter'/'orchestrator'? │
│  ─── YES → Create port factory ──→  │  Sets `where.port` = async factory fn
│                                     │  that calls `createPort()` or `new Port()`
│  ─── NO → It's a handler ────────→  │  Pushed into `where.methods[]`
│                                     │
│  Handler closure wraps:             │
│  • config merging                   │
│  • `handler` proxy (the IoC proxy)  │
│  • `lib` proxy (lazy lib loading)   │
│  • `errors` reference               │
│  • `remote()` for cross-service     │
│                                     │
│  Kind-specific dispatch:            │
│  • 'lib' → merge into lib object    │
│  • 'handler'/'validation' → invoke  │
│    factory, merge result into local │
│  • 'api' → generate schema          │
│  • 'model' → createHandlers         │
└─────────────────────────────────────┘
```

**The handler proxy** (`runtime.handler` / `layerApi.handler`) lives in
`handlerProxy.ts` and is a `Proxy` over the `local` object. When a handler
accesses `handler.someMethod`, the proxy:
1. Checks if the port `handles()` the method name → calls the port's local
   `findHandler()`.
2. Otherwise → calls `remote(methodName)` to create a remote dispatch function.

This is how handlers call other handlers without importing them. The proxy
resolves at call-time, enabling hot-reload: replacing the underlying function
pointer automatically updates all callers.

**Annotation syntax:** When `handlerName` starts with `@`, `parseAnnotatedKey()`
extracts annotations that modify `$meta` or merge config before delegating to
the resolved handler.

### Phase 3b — Realm.addLayer()

After `layerProxy` has been applied, `Realm.addLayer()` receives the `.result`
object and iterates its entries:

- If an entry has a `.port` property → registered in `registry.ports` as
  `{realmName}.{layerGroupName}`.
- If an entry has a `.methods` property → registered in `registry.methods`
  as `{realmName}.{groupName}`.

### Phase 4 — Start

`Registry.start()` orchestrates the startup sequence:

```
1.  for each port factory → registry.createPort(id)
      │
      ├── Calls the port factory with the API object
      │   (error, gateway, remote, rpcServer, local, registry)
      │
      └── Returns the port instance (AdapterBase subclass or custom adapter)

2.  for each created port → port.start()
      │
      ├── api.attachHandlers(this, this.config.imports)
      │   │
      │   └── Registry._attachHandlers() → _matchMethods()
      │       Walks registry.methods, creates handler instances,
      │       chains them via prototype chain into port.imported
      │
      ├── Registers request/publish endpoints in Local + RpcServer
      │   (skipping RpcServer for localOnly methods)
      │
      └── Fires 'start' event on the port

3.  for each created port → port.ready()

4.  Collect validations from all '.validation' and '.api' method groups
    → gateway.route(validations, pkg)

5.  resolution.start(), rpcServer.start(), remote.start(), gateway.start()

6.  watch.start() — begins file watching and test runner
```

---

## Handler Attachment Pipeline

This is the most complex mechanism and deserves special attention.

### Registry._attachHandlers()

Called by `AdapterBase.start()` via `api.attachHandlers(target, patterns)`.

`_matchMethods('extend', patterns, port, callback)` iterates all registered
methods and matches them against the adapter's `imports` patterns.

For each match, `_createHandlers(handlers, port)` executes the handler
closures:
- Each closure receives `{lib, local, literals, gateway, remote, port, attachCheckpoint, apiSchema}`.
- The closure populates `local` with named functions and `literals` with
  prototype-chained objects.

The results are chained via `Object.setPrototypeOf()` into the port's
`imported` object — creating a prototype chain where later-loaded handler
groups shadow earlier ones.

### Prototype Chain Wiring

```
port.imported → pointer₁ → local₁ → pointer₂ → local₂ → … → target (AdapterBase)
```

Each `pointer` is an empty object. When a handler group is hot-reloaded,
only the `Object.setPrototypeOf(pointer, newLocal)` call is needed — all
existing references to `port.imported` automatically see the new handlers.

The prototype chain is a deliberate design choice: it allows a handler to
call the "super" implementation when overriding a method attached by a
different handler group. Do not replace with a flat Map.

### Hot Reload

When Watch detects a file change, `_reloadUnit()` provides a unified
abstraction: re-import → re-wrap via `layerProxy` → replace in registry →
signal test re-run. The three paths (handler folder, single handler file, layer
file) share this abstraction with slight variations:

- **Handler folder change:** `Watch._loadHandlers()` re-imports the folder,
  calls `layerProxy()` to re-wrap, then `registry.replaceHandlers()` which
  re-executes `_createHandlers()` and re-links the prototype chain.
- **Single handler file change:** Same flow but for one file.
- **Layer file change:** `Watch._reloadUnit()` re-imports the file, calls
  `layerProxy()`, replaces the port in `registry.ports`, calls `createPort()`,
  `start()`, `ready()`.
- **Config file change:** `Watch._reloadConfig()` uses `ConfigRuntime.reload()`
  to compute the diff, then for each affected port either calls
  `port.configChanged()` (zero-downtime) or stop+start.

After any change, `emit('test')` triggers test re-runs.

---

## Key Design Rules

1. **No direct imports between handlers.** All handler-to-handler dependencies
   are resolved at runtime through the handler proxy (`handlerProxy.ts`).

2. **Kind annotations drive classification.** Every factory function is tagged
   with a `Symbol` (`Kind`) that determines how the framework processes it:
   `handler`, `lib`, `validation`, `api`, `model`, `adapter`, `orchestrator`,
   `solution`, `server`, `browser`. They also help with type checking the factory functions.

3. **Layers are activation boundaries.** A layer groups handlers, adapters and orchestrators that
   activate/deactivate together. Well-known folders auto-activate per their
   default environment.

4. **Configuration is hierarchical and namespaced.** Config keys match the
   hierarchy: `{realmName}.{layerGroup}`. Config from parent, module defaults,
   environment overrides, and external files are merged through `ConfigRuntime`
   in a single pipeline.

5. **Adapters own their handlers.** Handler groups are "attached" to adapters
   via `imports` patterns. The adapter's `imported` object provides the lookup
   scope for `findHandler()`.

6. **Prototype-chain wiring enables hot-reload.** Instead of copying handlers
   into a flat map, they are chained via `Object.setPrototypeOf()`. Replacing
   one link in the chain updates all lookups without touching other links. This
   also allows handlers to call the "super" implementation when overriding.

7. **Method registration is dual.** Methods are registered in both `Local`
   (in-process dispatch) and `RpcServer` (inter-process dispatch). The
   `Remote` class checks `Local` first. Methods marked as `localOnly` are
   excluded from `RpcServer` registration.

8. **The gateway builds routes from validations.** Validation schemas collected
   from all `.validation` and `.api` groups are used to generate Fastify routes
   with JSON Schema validation and OpenAPI documentation.

9. **Platform abstraction.** `loadServer.ts` and `loadBrowser.ts` inject
   platform-specific implementations of filesystem operations, enabling the
   same `load.ts` code to run in both environments.

10. **Realms never import `blong-gogo`.** The `AdapterBase` class and other
    runtime objects are provided through the dependency injection mechanism,
    not via direct import. This is enforced by keeping `blong-gogo` out of
    realm/suite dependencies.

---

## Data Flow Diagram

```
Suite factory
  │
  ├── invoke → mod = { url, pkg, children, config }
  │
  ├── merge configs via ConfigRuntime (module defaults + env + external files)
  │
  ├── instantiate infra objects in topological order
  │   (Log, Error, Local, Registry, Remote, Gateway, Watch, ...)
  │
  ├── for each child:
  │     │
  │     ├── [Internal subclass] → instantiate, store in api[name]
  │     │
  │     ├── [solution/server/browser] → loadRealm() recursively
  │     │     └── realm.addModule(name, subRegistry)
  │     │
  │     └── [layer function] → fn(layerProxy(...))
  │           │
  │           └── layerProxy classifies items:
  │                 ├── adapter/orchestrator → port factory → realm.addLayer() → registry.ports
  │                 └── handlers → method closures → realm.addLayer() → registry.methods
  │
  └── Registry.start()
        │
        ├── for each port: createPort() → port.init() → port.start()
        │     └── attachHandlers: match methods → _createHandlers → prototype chain
        │
        ├── for each port: port.ready()
        │
        ├── collect validations → gateway.route()
        │
        ├── resolution.start(), rpcServer.start(), remote.start(), gateway.start()
        │
        └── watch.start()
```

---

## Design Decisions

The following questions were raised during analysis of the pipeline and answered
by the framework author. They are recorded here as rationale for the current design.

1. **`layerProxy` dual-path for adapters:** Port subclasses follow one path
   (`new Port(portApi)`) while `kind === 'adapter'/'orchestrator'` follow
   another (`createPort(handlers, ...)`). The `Port` class in `Port.ts` is a
   thin stub for legacy compatibility and may be removed in a future cleanup.

2. **Dual registration (Local + RpcServer):** Every method is registered in
   both `Local` and `RpcServer`. The `localOnly` config map (added in the
   simplification refactoring) prepares for selective exposure — methods marked
   `localOnly` are excluded from `RpcServer` registration. Full per-method
   access control is a future concern.

3. **Prototype-chain wiring vs. Map:** The prototype chain is a deliberate
   design choice. It allows a handler to call the "super" implementation when
   overriding a method from a different handler group via attaching. A flat Map
   would lose this capability.

4. **`_matchMethods` `extend` vs `merge`:** The `extend` mode is necessary.
   Some adapters/orchestrators are singletons in a dedicated realm that import
   handler groups from other realms (e.g. the db adapter on the server and the
   http adapter in the browser). `extend` chains all matching groups into one
   prototype chain; `merge` creates them individually.

5. **`folderAnalysis.ts` and `discoverRealmTestMethods()`:** Both exist to
   support "bare handler" mode (running a folder of handlers without a suite).
   This is a core concern expected to be extended — not a CLI helper.

6. **Infrastructure instantiation order:** Dependency declarations
   (`deps: ['log', 'error', ...]`) are used in `load.ts` to derive the correct
   instantiation order via topological sort, replacing the previous hard-coded
   array position.

---

## Future Ideas

1. **Full per-method selective RpcServer registration** — the `localOnly` map
   provides the groundwork; a follow-up could allow method-level access control
   annotations (`@localOnly`, `@private`) that are processed at registration
   time to selectively expose methods in RpcServer vs Local only.

2. **Remove `Port.ts`** — the `Port` class is a thin stub for legacy `ut-port`
   compatibility. Once all remaining legacy adapters are migrated to
   `AdapterBase`, `Port.ts` can be deleted and the dual port-factory path in
   `layerProxy.ts` simplified to a single path.

3. **Type-safe config namespaces** — TypeScript template-literal types could
   derive the expected config shape for each namespace from the adapter's config
   type parameter, providing compile-time checking that config keys are valid.

4. **Schema-validated config reload** — run TypeBox validation on the new
   config snapshot before applying it. If validation fails, reject the reload
   and log a structured error, preventing invalid configuration from being
   applied even transiently.
