# blong-gogo Architecture Improvements & OpenAPI-Driven Development

## Overview

### Problem

The blong framework is a well-structured, layered RAD framework with strong
conventions. However, there are several architectural gaps and improvement
opportunities that limit development speed and the ability to onboard new APIs
quickly. Specifically:

1. **OpenAPI is not a first-class citizen** — Loading an OpenAPI spec requires
   multiple manual steps across adapters, codecs, gateways, and mocks. The same
   spec files are parsed independently by each consumer (adapter, codec, gateway,
   mock), with no shared registry.

2. **Scaffolding is template-based, not spec-driven** — `blong-kopi` scaffolds
   realms from `$subject`/`$object` placeholder templates. There is no path from
   "I have an OpenAPI YAML" to "I have a wired realm with handlers, errors, tests,
   and mocks" without significant manual work.

3. **Core engine has structural duplication** — The `scan()` function is defined
   three times; `adapter.ts` mixes many concerns; `layerProxy.ts` has a 184-line
   anonymous function doing handler resolution; OpenAPI type conversion is
   incomplete (missing enums, `allOf`, `nullable`, date formats).

4. **Handler context types lose precision** — `lib` and `errors` in the handler
   proxy are typed as open string-keyed objects, losing autocomplete beyond what
   the global `ISchema` module augmentation provides.

5. **No developer CLI for API-centric workflows** — There are no commands to
   validate registered OpenAPI specs against loaded handlers, list handlers by
   namespace, or scaffold from a spec file.

### Success Criteria

- An OpenAPI spec file can be "registered" once at realm/suite level and reused
  by all consumers (gateway, codec, adapter, mock) without re-parsing.
- Running `blong api import spec.yaml` scaffolds a fully wired realm with correct
  handler skeletons, validation files, dispatch config, and test stubs.
- The core `scan()` duplication is eliminated.
- `adapter.ts` concerns are separated into composable units.
- Handler resolution logic is extracted from `layerProxy.ts` and made testable.
- OpenAPI→TypeBox type conversion is complete (handles enums, `allOf`, `nullable`,
  `format`, nested objects with `required` arrays).
- `blong` CLI supports `api`, `realm`, `handler`, and `graph` subcommands.

### Who Benefits

- **API implementers** who receive an OpenAPI spec and need to stand up a blong
  realm to implement it.
- **Integration developers** who consume external REST APIs and want minimal
  boilerplate to call them from orchestrators.
- **Framework maintainers** who need to understand and evolve the core engine.
- **AI coding agents** operating on blong projects who need introspection APIs.

---

## Technical Approach

### Architecture Principles

- **OpenAPI files remain as separate YAML/JSON files** — they are registered
  within the framework by path/URL, not embedded in TypeScript. The same file
  can be referenced from multiple realms.
- **Backward compatibility is mandatory** — all existing realm structures,
  adapter configs, and handler patterns continue to work unchanged.
- **Generated code must be idiomatic** — scaffolded files look exactly like
  hand-written blong files; no special markers except the standard
  `import unchanged` sentinel that already exists.
- **Generated code must be minimal** — scaffolding produces the smallest possible
  set of files that makes a realm runnable.

### Key Relationships & Data Flow

```
OpenAPI Spec (YAML/JSON)
        │
        ▼
ApiSchema.registerApi()  ◄── called once at realm/suite load
        │
        ├──► Gateway.route()        (REST endpoint registration)
        ├──► codec/openapi/load.ts  (HTTP client request building)
        ├──► webhook.init()         (webhook adapter API loading)
        ├──► Mock generator         (response example extraction)
        └──► Scaffold generator     (handler skeleton creation)
```

---

## Implementation Plan

### Phase 1: Foundation — Structural Cleanup & API Schema Registry

**1a. Eliminate `scan()` duplication** (Small)

`scan()` is defined identically in three places:
- `core/blong-gogo/src/load.ts` (lines 123–126)
- `core/blong-gogo/src/Watch.ts` (lines 39–42)
- `core/blong-gogo/src/scan.ts` (standalone)

**Tasks:**
- Remove the inline definitions from `load.ts` and `Watch.ts`
- Import from `scan.ts` in both files
- The standalone `scan.ts` becomes the single source of truth

**1b. Elevate ApiSchema to a named API Registry** (Medium)

`ApiSchema` already stores parsed OpenAPI bundles in `#loaded` and `#namespace`
maps, but only during `schema()` calls triggered by individual consumers.
Each consumer independently calls `loadApi()` to parse the same file.

**Tasks:**
- Add `registerApi(name: string, locations: string | string[], source: string): Promise<void>` to `ApiSchema`/`IApiSchema`
- Add `getApi(name: string): Promise<OpenAPIBundle>` to retrieve a cached bundle
- Modify `codec/adapter/openapi/load.ts` to accept a pre-loaded bundle from the registry instead of re-loading
- Modify `webhook.init()` to use `apiSchema.getApi()` when `codec.openapi` references a named API
- Modify `Registry.loadApi()` to check the registry first before calling `apiSchema.schema()`
- Add watch-mode change detection: when a registered YAML/JSON file changes, invalidate the cached bundle and notify all consumers

**1c. Separate `adapter.ts` concerns** (Medium)

`adapter.ts` (~280 lines) is the port factory. It mixes:
- Port lifecycle (`init`, `start`, `stop`, `ready`, `connected`)
- Handler routing (`handles`, `findHandler`, `getConversion`, `methodPath`)
- Messaging (`request`, `publish`, `dispatch`, `event`)
- Stream connection (`connect`, `pack`/`unpack`)
- Queue management (PQueue initialization)
- Error registration

**Tasks:**
- Extract `PortLifecycle` (init, start, stop, ready, connected, queue) into `src/port/lifecycle.ts`
- Extract `PortRouting` (handles, findHandler, getConversion, methodPath, forNamespaces) into `src/port/routing.ts`
- Extract `PortMessaging` (request, publish, dispatch, event, drain) into `src/port/messaging.ts`
- Extract `PortStream` (connect, pack/unpack integration) into `src/port/stream.ts`
- Keep `adapter.ts` as the composition point: assemble the prototype chain from the extracted modules
- The external API surface of `adapter()` remains unchanged

**1d. Extract handler resolution from `layerProxy.ts`** (Medium)

The `default` case in `layerProxy.ts`'s Proxy `get` trap (lines 40–224 of
`layerProxy.ts`) is a 184-line anonymous function that:
- Classifies items as ports vs non-ports
- Creates port factory closures
- Builds the `methods` array with a complex async setup function
- Processes `lib`, `handler`, `validation`, `api` kinds in two passes

**Tasks:**
- Create `src/HandlerResolver.ts` with a `resolveHandlers(items, config, dependencies)` function
- Move the classification, lib-first/handler-second execution order, and `function:api` → `apiSchema.schema()` call into `HandlerResolver`
- `layerProxy` delegates to `HandlerResolver` for the handler processing path
- `HandlerResolver` is independently unit-testable without creating a Proxy

---

### Phase 2: OpenAPI-Driven Generation

**2a. Complete OpenAPI→TypeBox type conversion** (Medium)

`ApiSchema._type()` and `_paramType()` handle: `string`, `integer`, `boolean`,
`array`, `object`. Missing cases cause fallback to `unknown` or silent omission.

**Tasks:**
- Add `enum` → `Type.Union([Type.Literal('a'), Type.Literal('b'), ...])`
- Add `allOf` → `Type.Intersect([...])`
- Add `oneOf`/`anyOf` → `Type.Union([...])`
- Add `nullable: true` → `Type.Union([T, Type.Null()])`
- Add `format: 'date' | 'date-time'` → `Type.String({format: 'date'})` etc.
- Add `format: 'uuid'` → `Type.String({format: 'uuid'})`
- Add `required: string[]` → `Type.Required` / optional fields
- Add `additionalProperties: Schema` → `Type.Record(Type.String(), T)`
- Handle OpenAPI 3.x `requestBody.content['application/json'].schema` (already
  partially done but missing nested object recursion)
- Add `$ref` tracking to detect and break circular references

**2b. Scaffold realm from OpenAPI spec** (Large)

Create an API-to-realm scaffolding pipeline triggered by `blong api import`.

**Input:** An OpenAPI spec file (YAML or JSON, Swagger 2.x or OpenAPI 3.x).

**Output:** A complete realm folder structure:

```
<realmname>/
  server.ts                        # realm with dispatch config
  error/
    error.ts                       # errors derived from non-2xx responses
  orchestrator/
    <realmname>Dispatch.ts         # dispatch orchestrator per namespace
    <object>/
      <realmname><Object>Get.ts    # handler skeleton per operation
      <realmname><Object>Add.ts
      ...
      ~.schema.ts                  # generated from OpenAPI schemas (Phase 2a)
  adapter/
    db.ts                          # optional, if spec has POST/PUT/DELETE
  test/
    test/
      test<Object>.ts              # test stub per resource
```

**Tasks:**
- Create `src/scaffold/analyzeSpec.ts`: parse spec → extract resources (nouns),
  group operations by resource, suggest namespace assignments
- Create `src/scaffold/generateRealm.ts`: write realm files from analysis result
- Add `x-blong-method` inference: if `operationId` is `createUser`, derive
  `userAdd`; if `operationId` is `getUserById`, derive `userGet`; etc.
- Add AI enrichment hook: `analyzeSpec` can call an optional enrichment function
  that receives the raw analysis and returns corrections/suggestions (namespace
  splits, naming alignment, additional `x-blong-method` annotations)
- Generate handler bodies that return empty objects matching the response schema
- Generate test stubs that call the handler and assert response shape
- Generate `error.ts` from OpenAPI `4xx`/`5xx` response schemas

**2c. Auto-generate mocks from OpenAPI response examples** (Medium)

When an OpenAPI operation has `example` or `examples` in its `200` response,
auto-generate a mock handler that returns that data.

**Tasks:**
- Add `extractExamples(bundle, operationId)` to the API registry
- In scaffold output, if examples exist, generate a `sim/` layer with mock handlers
- Mock handlers use the standard `handler()` function and return the example data
- The `sim` well-known layer is already defined in `WELL_KNOWN_LAYERS` with
  `{server: {integration: true}}`, so mocks are automatically activated in
  integration testing

**2d. Inline external API declaration** (Medium)

Today, calling an external REST API requires: an adapter file, a codec config,
a namespace config, and imports config. This can be reduced to a single config
entry in `server.ts`.

**Tasks:**
- Add `externalApis` to realm config type:
  ```ts
  externalApis?: Record<string, {
      spec: string;          // path to OpenAPI YAML
      baseUrl?: string;      // override spec server URL
      namespace?: string;    // override namespace name
  }>;
  ```
- In `load.ts`, detect `externalApis` config and auto-create an HTTP adapter with
  OpenAPI codec for each declared API, equivalent to the manual pattern
- Register the spec in the `ApiSchema` registry automatically
- Handlers can reference the generated namespace immediately without additional
  adapter setup

---

### Phase 3: Developer Experience

**3a. Enhanced handler context types** (Medium)

`IHandlerProxy<T>` has `lib: ILib & {[name: string]: LibFn}` and
`errors: {[name: string]: (...) => ITypedError}`, losing type precision for
project-specific libs and errors.

**Tasks:**
- When `~.schema.ts` is generated, also generate a namespace-specific handler
  context type module (`~.context.ts`) that narrows `lib` to the actual lib
  functions in the folder and `errors` to the registered error types
- Update `IHandlerProxy` to accept a generic `TLib` and `TErrors` parameter
- Handler files reference the context type via `handler<MyConfig, MyContext>(...)`
  for full autocomplete on `lib.myFunction(...)` and `errors.myError(...)`

**3b. CLI subcommands** (Large)

Extend the `blong` CLI (in `bin/blong.ts`) with new subcommands:

- `blong api import <spec.yaml> [--namespace=<name>] [--realm=<path>]`
  Triggers Phase 2b scaffolding. Creates a realm directory with all generated
  files. If the realm already exists, adds missing handler skeletons only.

- `blong api validate [--realm=<path>]`
  Loads all registered OpenAPI specs in a realm. For each operation with an
  `operationId`, checks that a handler file exists with the matching name.
  Reports missing, extra, and mismatched handlers.

- `blong api diff <old.yaml> <new.yaml>`
  Compares two OpenAPI specs and reports what handler changes would be needed:
  new operations (→ new handler files), removed operations (→ handlers to delete
  or deprecate), changed schemas (→ handlers that may need updating).

- `blong realm create <name> [--from-api=<spec.yaml>]`
  Creates a new realm directory. With `--from-api`, runs the scaffolding pipeline.
  Without it, creates a minimal realm using the existing `blong-kopi` template.

- `blong handler list [--namespace=<name>] [--format=json|table]`
  Scans the realm's orchestrator/handler folders and lists all handler files with
  their method names, validation status (has `~.schema.ts` entry), and any
  `x-blong-method` annotations.

- `blong graph [--format=json|dot]`
  Outputs the handler dependency graph: which handlers call which other handlers,
  which namespaces are served by which adapters/orchestrators. Suitable for
  piping to Graphviz or the `blong-graph` package.

**3c. Enhanced watch mode error recovery** (Small)

When `Watch._watch()` encounters an error processing a changed file, it logs
the error but provides no structured recovery information.

**Tasks:**
- Classify watch errors: `SyntaxError` (TypeScript/JS parse), `ImportError`
  (module not found), `RuntimeError` (error during handler initialization),
  `NameMismatchError` (already caught, but not surfaced as watch status)
- Emit structured watch status events that `blong-log` can display:
  `watch.error.syntax`, `watch.error.import`, `watch.error.runtime` with file
  path, error type, and message
- Add configurable retry delay for transient errors (file still being written):
  configurable via `watch.retryDelay` (default 100ms), max retries via
  `watch.maxRetries` (default 3)

**3d. Runtime handler graph introspection** (Medium)

`blong-graph` exists as a visual tool but there is no runtime API to query the
handler topology. AI agents and developer tools need this for impact analysis
and code understanding.

**Tasks:**
- Track handler→handler calls in `layerProxy.ts` (the `handler` proxy already
  intercepts all `handler.methodName` references; record these during initialization)
- Track namespace→adapter/orchestrator bindings in `Registry`
- Expose via internal API handlers: `graph.handler.find`, `graph.namespace.find`
- These handlers follow standard naming conventions and are callable via the
  existing RPC API
- The `blong-graph` package can use these endpoints instead of static analysis

---

### Phase 4: AI Integration Points

**4a. AI enrichment hook for OpenAPI analysis** (Medium)

The scaffold pipeline (Phase 2b) includes an `analyzeSpec` step that infers
blong naming conventions from the raw OpenAPI spec. This inference is
heuristic-based and will sometimes be wrong.

**Tasks:**
- Define an `ISpecEnricher` interface:
  ```ts
  interface ISpecEnricher {
      enrich(analysis: SpecAnalysis): Promise<SpecAnalysis>;
  }
  ```
- `analyzeSpec` calls the enricher if one is configured
- Provide a `ClaudeSpecEnricher` (or generic `LLMSpecEnricher`) implementation
  that sends the spec analysis to an LLM with a structured prompt asking for:
  - Namespace split recommendations
  - `x-blong-method` annotations for non-standard operationIds
  - Property rename suggestions (to align with two-word naming convention)
  - Error type name suggestions
- The enricher is optional; the scaffold pipeline works without it

**4b. Handler graph as MCP tools** (Medium)

The runtime handler graph (Phase 3d) can be exposed as Model Context Protocol
(MCP) tools for AI coding agents working on blong projects.

**Tasks:**
- Add an MCP server capability to `blong-gogo` (configurable, off by default)
- Expose tools: `get_handler_graph`, `get_namespace_topology`, `get_api_schemas`,
  `list_handlers`, `get_handler_schema`
- AI agents can use these tools to understand the project structure before making
  changes, reducing hallucinations about method names and parameter shapes

---

## Considerations

### Assumptions

- OpenAPI files remain as separate YAML/JSON on the filesystem (not embedded in
  TypeScript or generated at build time)
- The existing `handler`/`validation`/`api`/`lib`/`adapter`/`orchestrator` kind
  system is preserved without modification
- All existing realm structures, adapter configs, and handler patterns continue
  to work without changes (no required migration)
- Generated code uses the same ESM module style as the rest of blong (`.ts`
  extensions in imports, `import.meta.url` patterns)

### Constraints

- Changes to `blong-gogo` must not break existing tests in `core/test`,
  `blong-sim-api`, `blong-sim-tcp`, and `blong-ttk`
- The `IApiSchema` interface (referenced in `blong/types.ts`) must be extended
  in a backward-compatible way (new methods optional until all consumers are
  updated)
- Prototype chain assembly in `adapter.ts` must be preserved exactly; the
  refactoring separates concerns but keeps the same runtime behavior

### Risks

- **OpenAPI spec diversity**: Real-world specs use patterns not covered here
  (callbacks, links, webhooks as OpenAPI 3.1 concepts, discriminator,
  `x-extensions`). The converter and scaffold should gracefully degrade to
  `unknown` types and TODO comments rather than failing.
- **Prototype chain in adapter.ts**: The `extends` mechanism uses
  `Object.setPrototypeOf` to assemble the inheritance chain at runtime. Any
  refactoring must preserve the exact prototype structure that adapters and
  orchestrators rely on.
- **AI enricher quality**: LLM-suggested namespace splits may not always align
  with the developer's mental model. The enricher output must be presented as
  suggestions, not applied automatically.
- **Watch mode performance**: The API registry's change detection adds file
  watchers for OpenAPI YAML files. This should be integrated into the existing
  `chokidar` watcher in `Watch.ts` rather than creating additional watchers.

### Not Included

- **blong-ui** (explicitly excluded from this analysis)
- Completing existing plans (rest-fs, cucumber, ttk phases 3–5) — this plan
  focuses on new architectural concepts
- gRPC, GraphQL, or other protocol support
- Database schema-driven scaffolding (as opposed to OpenAPI-driven)
- Runtime performance optimizations (the prototype chain, Proxy overhead, etc.)
- Multi-tenant or multi-region deployment patterns

---

## File Map

New and modified files resulting from this plan:

### Phase 1

| Action | File | Note |
|--------|------|------|
| Modify | `core/blong-gogo/src/load.ts` | Remove inline `scan()`, import from `scan.ts` |
| Modify | `core/blong-gogo/src/Watch.ts` | Remove inline `scan()`, import from `scan.ts` |
| Modify | `core/blong-gogo/src/ApiSchema.ts` | Add `registerApi()`, `getApi()`, change detection |
| Modify | `core/blong/types.ts` | Extend `IApiSchema` with new methods |
| Modify | `core/blong-gogo/src/codec/adapter/openapi/load.ts` | Use registry |
| Modify | `core/blong-gogo/src/adapter/server/webhook.ts` | Use registry |
| Modify | `core/blong-gogo/src/Registry.ts` | Use registry in `loadApi()` |
| Create | `core/blong-gogo/src/port/lifecycle.ts` | Extracted from `adapter.ts` |
| Create | `core/blong-gogo/src/port/routing.ts` | Extracted from `adapter.ts` |
| Create | `core/blong-gogo/src/port/messaging.ts` | Extracted from `adapter.ts` |
| Create | `core/blong-gogo/src/port/stream.ts` | Extracted from `adapter.ts` |
| Modify | `core/blong-gogo/src/adapter.ts` | Compose from port/* modules |
| Create | `core/blong-gogo/src/HandlerResolver.ts` | Extracted from `layerProxy.ts` |
| Modify | `core/blong-gogo/src/layerProxy.ts` | Delegate to `HandlerResolver` |

### Phase 2

| Action | File | Note |
|--------|------|------|
| Modify | `core/blong-gogo/src/ApiSchema.ts` | Complete type conversion |
| Create | `core/blong-gogo/src/scaffold/analyzeSpec.ts` | Spec → analysis |
| Create | `core/blong-gogo/src/scaffold/generateRealm.ts` | Analysis → files |
| Create | `core/blong-gogo/src/scaffold/enrichers/ISpecEnricher.ts` | Interface |
| Modify | `core/blong-gogo/src/load.ts` | Handle `externalApis` config key |

### Phase 3

| Action | File | Note |
|--------|------|------|
| Modify | `core/blong-gogo/bin/blong.ts` | Add CLI subcommands |
| Modify | `core/blong-gogo/src/Watch.ts` | Error classification, retry |
| Create | `core/blong-gogo/src/graph/HandlerGraph.ts` | Graph tracking |
| Modify | `core/blong-gogo/src/layerProxy.ts` | Record handler→handler references |
| Modify | `core/blong-gogo/src/Registry.ts` | Expose graph data |

### Phase 4

| Action | File | Note |
|--------|------|------|
| Create | `core/blong-gogo/src/scaffold/enrichers/LLMSpecEnricher.ts` | AI enricher |
| Create | `core/blong-gogo/src/mcp/server.ts` | MCP server capability |
