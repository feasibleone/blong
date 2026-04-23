# Wiring Pipeline — How blong-gogo Loads and Wires the Framework

This document describes the current wiring pipeline in `core/blong-gogo/` — the
runtime that loads solutions, realms, layers, and handlers without any direct
imports between them. It is intended for review prior to a simplification
refactoring.

---

## 1  High-Level Overview

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
| **Bootstrap** | `loadServer.ts` / `loadBrowser.ts` → `load.ts` | Platform API is bound, the root factory is invoked, and infrastructure objects (Log, Error, Registry, Gateway, Remote, Local, Watch, etc.) are instantiated. |
| **Load** | `loadRealm()` in `load.ts` | The suite tree is walked recursively. Realms and layers are discovered, imported, and classified. Handler files are read and grouped. |
| **Wire** | `layerProxy.ts` + `Realm.ts` → `Registry` | Handlers are wrapped in closures and registered as methods/ports in the Registry. Adapters and orchestrators are wrapped in port factories. The handler proxy is assembled. |
| **Start** | `Registry.start()` | Ports are created and started. Handler groups are attached to ports. Validations are collected. Gateway routes are built. Watch mode is initialized. |

---

## 2  Component Inventory

### 2.1  Entry Points

| File | Role |
|------|------|
| `loadServer.ts` | Binds Node.js platform APIs (fs, path, chokidar) and calls `load()`. |
| `loadBrowser.ts` | Binds browser-compatible stubs and calls `load()`. |
| `load.ts` (`loadRealm()`) | The universal recursive loader. Platform-agnostic. |
| `runServer.ts` | CLI entry: parses arguments, calls `loadServer()`, starts the registry. |

### 2.2  Infrastructure Objects (instantiated during Bootstrap)

These are instantiated once at the root of the tree. Each is a class that
extends `Internal` (from `@feasibleone/blong/types`).

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
| `ConfigRuntime` | `IConfigRuntime` | Manages external config files; provides reload/diff for hot config changes. |
| `Port` | — | Base class factory for legacy `ut-port` style adapters. |

### 2.3  Structural Files

| File | Role |
|------|------|
| `Realm.ts` | Receives loaded items and registers them in the Registry as ports (adapters/orchestrators) or method groups (handlers). |
| `layerProxy.ts` | A `Proxy` object returned by `layerProxy()` that intercepts property access during the layer-loading phase to classify and wrap items (handlers → method closures, adapters/orchestrators → port factories). |
| `adapter.ts` | Creates the adapter "base object" — the runtime context that handlers run inside (config, imported methods, dispatch, event system, loop). |
| `loop.ts` | The adapter request/response loop — handles send/receive conversion chains. |
| `lib.ts` | Utility functions: `methodId()`, `methodParts()`, `camelToSentence()`, `parseAnnotatedKey()`. |
| `folderAnalysis.ts` | Analyzes a directory to classify it as suite/realm/handlers. Used for auto-wrapping loose handlers. |

### 2.4  Sub-Realms (internal packages loaded as children)

| Package folder | Role |
|----------------|------|
| `adapter/server.ts` | Declares available server adapter types (tcp, http, knex, etc.) as a realm. |
| `adapter/browser.ts` | Declares available browser adapter types. |
| `orchestrator/index.ts` | Declares available orchestrator types (dispatch, openapi, etc.). |
| `codec/server.ts` / `codec/browser.ts` | Declares codec implementations. |

---

## 3  The Loading Pipeline in Detail

### 3.1  Phase 1 — Bootstrap

`loadServer.ts` (or `loadBrowser.ts`) calls `load.ts:loadRealm()` with:
- A **platform API** object (filesystem operations, `watch`, `hrtime`, etc.)
- The root **suite factory** (a function annotated with `server()` or `browser()`)
- A **name** (suite name) and **parentConfig** (config file name or object)
- **configNames** (active environment names like `['dev']`, `['integration']`)

On the first call (`api` is undefined), `loadRealm()`:
1. Creates the initial config skeleton with defaults for all infrastructure keys.
2. Defines the ordered list of infrastructure **items** to instantiate (Log,
   ApiSchema, Port, Error, Watch, Local, Remote/RpcClient, RpcServer, Gateway,
   RestFs, Registry, Codec, Orchestrator, Adapter).
3. Invokes the root factory to get the module config (`mod`), which contains
   `{url, pkg, children, config}`.
4. Merges all config sources: module defaults, environment overrides,
   external config files.

### 3.2  Phase 2 — Tree Walking

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

### 3.3  Phase 3 — layerProxy (The Core Wiring Mechanism)

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

**The handler proxy** (`runtime.handler` / `layerApi.handler`) is a `Proxy`
over the `local` object. When a handler accesses `handler.someMethod`, the
proxy:
1. Checks if the port `handles()` the method name → calls the port's local
   `findHandler()`.
2. Otherwise → calls `remote(methodName)` to create a remote dispatch function.

This is how handlers call other handlers without importing them. The proxy
resolves at call-time, enabling hot-reload: replacing the underlying function
pointer automatically updates all callers.

**Annotation syntax:** When `handlerName` starts with `@`, `parseAnnotatedKey()`
extracts annotations that modify `$meta` or merge config before delegating to
the resolved handler.

### 3.4  Realm.addLayer()

After `layerProxy` has been applied, `Realm.addLayer()` receives the `.result`
object and iterates its entries:

- If an entry has a `.port` property → registered in `registry.ports` as
  `{realmName}.{layerGroupName}`.
- If an entry has a `.methods` property → registered in `registry.methods`
  as `{realmName}.{groupName}`.

### 3.5  Phase 4 — Start

`Registry.start()` orchestrates the startup sequence:

```
1.  for each port factory → registry.createPort(id)
      │
      ├── Calls the port factory with the API object
      │   (error, gateway, remote, rpcServer, local, registry, utBus, utLog)
      │
      └── Returns the port instance (adapter runtime object)

2.  for each created port → port.start()
      │
      ├── utBus.attachHandlers(this, this.config.imports)
      │   │
      │   └── Registry._attachHandlers() → _matchMethods()
      │       Walks registry.methods, creates handler instances,
      │       chains them via prototype chain into port.imported
      │
      ├── Registers request/publish endpoints in Local + RpcServer
      │
      └── Fires 'start' event on the port

3.  for each created port → port.ready()

4.  Collect validations from all '.validation' and '.api' method groups
    → gateway.route(validations, pkg)

5.  resolution.start(), rpcServer.start(), remote.start(), gateway.start()

6.  watch.start() — begins file watching and test runner
```

---

## 4  The Handler Attachment Pipeline

This is the most complex mechanism and deserves special attention:

### 4.1  Registry._attachHandlers()

Called by `adapter.start()` via `utBus.attachHandlers(target, patterns)`.

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

### 4.2  Prototype Chain Wiring

```
port.imported → pointer₁ → local₁ → pointer₂ → local₂ → … → target (base adapter)
```

Each `pointer` is an empty object. When a handler group is hot-reloaded,
only the `Object.setPrototypeOf(pointer, newLocal)` call is needed — all
existing references to `port.imported` automatically see the new handlers.

### 4.3  Hot Reload

When Watch detects a file change:

- **Handler folder change:** `Watch._loadHandlers()` re-imports the folder,
  calls `layerProxy()` to re-wrap, then `registry.replaceHandlers()` which
  re-executes `_createHandlers()` and re-links the prototype chain.
- **Single handler file change:** Same flow but for one file.
- **Layer file change:** `Watch.load()` re-imports the file, calls
  `layerProxy()`, replaces the port in `registry.ports`, calls `createPort()`,
  `start()`, `ready()`.
- **Config file change:** `Watch._reloadConfig()` uses `ConfigRuntime.reload()`
  to compute the diff, then for each affected port either calls
  `port.configChanged()` (zero-downtime) or stop+start.

After any change, `emit('test')` triggers test re-runs.

---

## 5  Key Design Rules

1. **No direct imports between handlers.** All handler-to-handler dependencies
   are resolved at runtime through the handler proxy.

2. **Kind annotations drive classification.** Every factory function is tagged
   with a `Symbol` (`Kind`) that determines how the framework processes it:
   `handler`, `lib`, `validation`, `api`, `model`, `adapter`, `orchestrator`,
   `solution`, `server`, `browser`.

3. **Layers are activation boundaries.** A layer groups handlers that
   activate/deactivate together. Well-known folders auto-activate per their
   default environment.

4. **Configuration is hierarchical and namespaced.** Config keys match the
   hierarchy: `{realmName}.{layerGroup}`. Config from parent, module defaults,
   environment overrides, and external files are merged in order.

5. **Adapters own their handlers.** Handler groups are "attached" to adapters
   via `imports` patterns. The adapter's `imported` object provides the lookup
   scope for `findHandler()`.

6. **Prototype-chain wiring enables hot-reload.** Instead of copying handlers
   into a flat map, they are chained via `Object.setPrototypeOf()`. Replacing
   one link in the chain updates all lookups without touching other links.

7. **Method registration is dual.** Methods are registered in both `Local`
   (in-process dispatch) and `RpcServer` (inter-process dispatch). The
   `Remote` class checks `Local` first when `canSkipSocket` is true.

8. **The gateway builds routes from validations.** Validation schemas collected
   from all `.validation` and `.api` groups are used to generate Fastify routes
   with JSON Schema validation and OpenAPI documentation.

9. **Platform abstraction.** `loadServer.ts` and `loadBrowser.ts` inject
   platform-specific implementations of filesystem operations, enabling the
   same `load.ts` code to run in both environments.

---

## 6  Data Flow Diagram

```
Suite factory
  │
  ├── invoke → mod = { url, pkg, children, config }
  │
  ├── merge configs (module defaults + env + external files)
  │
  ├── instantiate infra objects (Log, Error, Local, Registry, Remote, Gateway, Watch, ...)
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

## 7  Questions and Answers

The following questions were raised during initial analysis. Answers were
provided by the framework author and inform the simplification plan in
Section 8.

### Architectural / Conceptual

1. **`layerProxy` dual-path for adapters:** Port subclasses follow one path
   (`new Port(portApi)`) while `kind === 'adapter'/'orchestrator'` follow
   another (`createPort(handlers, ...)`). Are both paths still needed? The
   Port class in `Port.ts` appears to be a thin stub with no real
   implementation. Can the Port subclass path be removed?

   > **Answer: Yes** — both paths are still needed. Do not remove the Port
   > subclass path.

2. **`utBus` compatibility surface:** `Registry.createPort()` assembles a
   large `utBus` API object with `register`, `unregister`, `subscribe`,
   `unsubscribe`, `attachHandlers`, `getPath`, `importMethod`, `dispatch`,
   `methodId`, `config`. This mirrors the old `ut-bus` API. Is there still
   code that depends on this exact shape, or can it be simplified?

   > **Answer: No** — nothing depends on this exact shape any more. The
   > `utBus` compatibility surface can be simplified.

3. **Dual registration (Local + RpcServer):** Every method is registered in
   both `Local` and `RpcServer`. When `canSkipSocket` is true, RpcServer
   registration is essentially dead code for that deployment. Can this be
   deferred or made conditional?

   > **Answer:** Registration in the RPC server is likely to be conditional
   > in the future, as some methods will be private to the local process.
   > This should be prepared for but does not need to change immediately.

4. **Prototype-chain wiring vs. Map:** The handler attachment uses a
   prototype chain (`Object.setPrototypeOf`) for hot-reload. This is clever
   but hard to debug and reason about. Could a `Map<string, Function>` with
   an explicit `replace()` method achieve the same hot-reload semantics more
   transparently?

   > **Answer:** The intent of the prototype chain is to make it possible
   > for handlers to call the "super" handler when overridden via attaching.
   > This is a deliberate design choice and should be preserved. Do not
   > replace with a Map.

5. **`_matchMethods` extend vs. merge:** The `extend` mode chains all handlers
   for a pattern into one prototype chain, while `merge` mode creates them
   individually. Is there a use case where multiple handler groups match the
   same adapter import pattern? If not, `extend` may be unnecessary.

   > **Answer: Yes** — some adapters/orchestrators are singleton in a
   > dedicated realm and import handler groups from other realms. For
   > example the db adapter in the server and the http adapter in the
   > browser. The `extend` mode is necessary.

### Implementation / Code-Level

6. **Infrastructure instantiation order:** The items list in `loadRealm()` has
   a hard-coded order dependency (Log must come first, Registry needs Error and
   Remote, etc.). This is fragile. Should this be made explicit through a
   dependency declaration?

   > **Answer: Yes** — this should be made explicit through dependency
   > declarations.

7. **`layerProxy` Proxy complexity:** The `layerProxy` function is ~425 lines
   with deeply nested closures and 4+ levels of proxying (the returned proxy,
   the `lib` proxy, the `handler` proxy, the sub-property naming proxy). Can
   the handler proxy be extracted into its own named function/class?

   > **Answer: Yes** — the handler proxy should be extracted.

8. **Watch re-load path duplication:** `Watch._watch()` has three code paths
   for layer files, config files, and handler files/folders. Each path
   reimplements parts of the load→layerProxy→registry flow. Can these share
   a common "reload unit" abstraction?

   > **Answer: Probably yes** — these can likely share a common abstraction,
   > though care is needed to preserve hot-reload semantics.

9. **`adapter.ts` base object:** The adapter base is a large plain object
   literal (~300 lines) with methods that close over `utBus`, `utError`,
   `utLog`, etc. Converting this to a class would enable better typing and
   reduce the closure scope. Is there a reason it must remain a plain object
   (e.g., prototype-chain inheritance from custom adapter definitions)?

   > **Answer:** Realms and solutions should not depend on blong-gogo.
   > Adapters and orchestrators should have some way of extending a base
   > one without importing it. The conversion to a class must respect this
   > constraint — the base class should be provided through the runtime, not
   > via direct import.

10. **`folderAnalysis.ts` and `discoverRealmTestMethods()`:** Both exist to
    support "bare handler" mode (running a folder of handlers without a suite).
    This is a developer convenience feature. Should it be a core concern or
    moved to a separate CLI helper?

    > **Answer:** This is a core concern which is likely to be extended.
    > Keep it in blong-gogo.

11. **Config merging happens in multiple places:** `loadRealm()` merges module
    configs, `loadConfig()` merges external files, `layerProxy` merges namespace
    configs, `adapter.activeConfig()` merges activation configs. Can these be
    unified into a single config resolution pass?

    > **Answer: Yes** — this would be a great improvement. See
    > `core/blong-gogo/src/ConfigRuntime.ts` which already centralises
    > config lifecycle (load, merge, proxy, diff, notify). The remaining
    > merge sites in `loadRealm()`, `layerProxy`, and `adapter.activeConfig()`
    > should be consolidated into `ConfigRuntime`.

---

## 8  Simplification Plan

Revised based on the answers in Section 7.

### 8.1  Extract handler proxy into its own module

**What:** Move the `handler` proxy (currently inline in `layerProxy.ts` lines
160–358) into a dedicated `handlerProxy.ts` file.

**Why:** This is the most important abstraction in the framework (it's the IoC
mechanism). Having it as a named, testable module will make it easier to
understand, debug, and extend. (Confirmed by answer 7.)

**Impact:** Low risk. Pure extraction, no behavior change.

### 8.2  Extract handler closure (the "layerApi" assembly) from layerProxy

**What:** The anonymous closure pushed into `where.methods[]` (lines 118–416
of `layerProxy.ts`) should become a named function like
`createHandlerClosure(others, moduleConfig, ...)`.

**Why:** This closure does too many things: config merging, lib loading,
handler invocation by kind, and the handler proxy creation. Breaking it into
named functions makes the flow explicit.

**Impact:** Low risk. Refactoring with no behavior change.

### 8.3  Replace `utBus` compatibility layer with direct Registry calls

**What:** The `utBus` object assembled in `Registry.createPort()` wraps
`rpcServer`, `local`, `remote`, and `registry` methods. Replace it with
passing the actual objects (or a slim facade) directly.

**Why:** Nothing depends on this exact shape any more (answer 2). The
indirection exists for backward compatibility with `ut-bus`. Since blong-gogo
is the only consumer, the wrapping is unnecessary.

**Impact:** Medium risk. Need to update `adapter.ts` and any code that
references `utBus.*`.

### 8.4  Convert adapter base to a runtime-provided class

**What:** Convert the plain-object literal in `adapter.ts` to a class
`AdapterBase`, exposed through the runtime rather than via direct import.

**Why:** The current object uses closure-captured variables (`utBus`,
`utError`, etc.) that could be instance properties. A class gives better
TypeScript inference and enables subclassing without `Object.setPrototypeOf`.

**Constraint:** Realms and solutions must not depend on blong-gogo (answer 9).
The base class must be provided through the runtime injection mechanism (e.g.
via `runtime.base` or a similar factory), not via direct import. Custom
adapters currently use prototype chain inheritance
(`Object.setPrototypeOf(current, base)`) — the class approach must preserve
this pattern.

**Impact:** Medium risk. Need to verify all adapter/orchestrator definitions
still work with the runtime-provided class-based inheritance.

### 8.5  Make infrastructure instantiation order explicit

**What:** Instead of a flat ordered array of items, declare dependencies:
`Registry` depends on `[Error, Remote, Gateway, Local, Watch]`.

**Why:** The current approach is fragile (confirmed by answer 6). Adding a new
infrastructure object requires finding the right position in the array.

**Impact:** Low risk but broad scope. Requires a small dependency resolution
mechanism.

### 8.6  Unify the Watch reload paths

**What:** Create a `ReloadUnit` abstraction that encapsulates "re-import →
re-wrap via layerProxy → replace in registry → signal test".

**Why:** The three paths (handler folder, handler file, layer file) duplicate
the load→proxy→register flow with slight variations. Likely unifiable
(answer 8), though care is needed to preserve all hot-reload semantics.

**Impact:** Medium risk. Touches Watch.ts and must preserve all hot-reload
semantics.

### 8.7  Unify config merging into ConfigRuntime

**What:** Consolidate the scattered config-merge sites — `loadRealm()` module
config merging, `layerProxy` namespace config merging, and
`adapter.activeConfig()` activation config merging — into `ConfigRuntime`
(`core/blong-gogo/src/ConfigRuntime.ts`).

**Why:** Config merging is currently duplicated in four places (answer 11).
`ConfigRuntime` already centralises the config lifecycle (load, merge, proxy,
diff, notify). Routing all merge operations through it will eliminate
duplication and ensure a single source of truth for the resolved config.

**Approach:** Extend `ConfigRuntime` with layer-scoped and activation-scoped
merge methods. Each merge site currently assembling config from parent +
local + environment sources would instead call a ConfigRuntime API that
returns the resolved config slice. The existing `createConfigProxy` system
ensures hot-reload semantics are preserved.

**Impact:** Medium risk but high value. Need to trace all merge call sites and
verify the merge order is preserved.

### 8.8  Prepare RpcServer registration for conditional methods

**What:** Add a mechanism to mark methods as "local-only" so that RpcServer
registration can be made conditional. When running as a monolith
(`canSkipSocket: true`), skip registering local-only methods in `RpcServer`.

**Why:** Some methods will be private to the local process (answer 3).
Currently every method is registered in both `Local` and `RpcServer`
unconditionally. This prepares for future selective exposure.

**Impact:** Low risk. Conditional based on config or method metadata.

### ~~8.x  Simplify prototype-chain wiring~~ (Removed)

**Status:** Removed from plan based on answer 4. The prototype chain is a
deliberate design choice that enables handlers to call the "super" handler
when overridden via attaching. Do not replace with a Map. Document the
pattern thoroughly instead.

### ~~8.x  Remove `extend` mode from `_matchMethods`~~ (Removed)

**Status:** Removed from plan based on answer 5. The `extend` mode is
necessary — some adapters/orchestrators are singletons in a dedicated realm
that import handler groups from other realms (e.g. the db adapter on the
server and the http adapter in the browser).

### ~~8.x  Move `folderAnalysis.ts` to CLI helper~~ (Removed)

**Status:** Removed from plan based on answer 10. Bare handler mode is a core
concern likely to be extended. Keep `folderAnalysis.ts` and
`discoverRealmTestMethods()` in blong-gogo.

---

## 9  Recommended Execution Order

Revised based on the answers in Section 7. Items are ordered from safest/most
impactful to riskiest.

1. **8.1** — Extract handler proxy (safe, immediate clarity win)
2. **8.2** — Extract handler closure (safe, complements 8.1)
3. **8.3** — Replace utBus with direct calls (removes unnecessary indirection;
   unblocked by answer 2 confirming nothing depends on the exact shape)
4. **8.5** — Make infra instantiation order explicit (structural improvement;
   confirmed by answer 6)
5. **8.6** — Unify Watch reload paths (reduces duplication; tentatively
   confirmed by answer 8)
6. **8.7** — Unify config merging into ConfigRuntime (high value; confirmed by
   answer 11)
7. **8.4** — Convert adapter base to runtime-provided class (bigger change;
   constrained by answer 9 — must not require blong-gogo import)
8. **8.8** — Prepare conditional RpcServer registration (future-proofing;
   informed by answer 3)
