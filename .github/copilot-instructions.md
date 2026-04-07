# Blong AI Coding Instructions

Blong is a TypeScript-based API-focused RAD (Rapid Application Development) framework built as a
Rush.js monorepo using pnpm workspaces. The framework provides a "bring your own architecture"
approach — the same codebase runs as a modular monolith (development) or full microservices
(production) without code changes.

**Monorepo structure:** `core/` — framework packages, examples, and POC suites; `dev/` — gitignored
local scratch area; `docs/` — documentation site.

> **Important:** The `dev/` folder is gitignored. All committed code — framework packages, examples,
> POC suites, reference implementations — must be placed in `core/`.

## Important folders

### Main framework

- `core/blong/` contains the TypeScript types and very small utility functions, used to annotate the
  various entities in the realms, suites, etc. and is the primary blong dependency used by them.
- `core/blong-gogo/` contains the runtime code and is never imported directly. Instead it uses the
  annotations from `core/blong/` to load and execute handlers, adapters, orchestrators, etc.

### Utilities

- `core/blong-log/` - Real-time log viewer
- `core/blong-openapi/` - Higher order utility for easy implementation of OpenAPI clients (WIP)

### Internal libraries

- `core/blong-allure/` - Allure test reporting integration
- `core/blong-chain/` - Test execution chaining utilities
- `core/blong-config/` - Configuration initialization
- `core/blong-kopi/` - Template for realm scaffolding and code generation

### Reusable realms

- `core/blong-browser/` - realm for the browser platform
- `core/blong-test/` - realm for public API testing, simulating browser-side requests
- `core/blong-login/` - realm for authentication

### Demonstration patterns

- `core/blong-hello/` - simple "hello world" example with a single handler, used for testing and
  reference
- `core/blong-eip/` - example of EIP (Enterprise Integration Pattern) and server side testing with
  mocks
- `core/blong-cucumber/` - example of BDD testing with Blong and Cucumber.js
- `core/blong-int-sql/` - example of integration testing with a SQL database backend
- `core/blong-sim-api/` - example of simulating OpenAPI-based back ends
- `core/blong-sim-tcp/` - example of simulating TCP-based back ends
- `core/config-hot-reload/` - examples of the unified handler-test concept
- `core/test/` - main framework test suite
- `core/ui-demo/` - example for browser-based UI development with Blong, using the model system and
  a marine biology domain

---

## ⚠️ Essential Rules — Always Apply These

These rules apply to all Blong code, without exception:

1. Blong is work in progress. When working on it, there may be incomplete or even contradicting
   features. When in doubt, follow the leading principles to take decisions about how to implement
   or refactor code:
    - Follow the handler and runtime pattern described below — it's the lingua franca of the
      framework
    - API definition is the king and source of truth. Currently it is derived from Typebox schemas
      or can be supplied via existing OpenAPI specs.
    - DRY (do not repeat yourself) - avoid duplication of ideas, logic, or code
    - RAD (rapid application development) - prioritize fast iteration and delivery, implement
      convention over configuration, be able to generate bolerplate code, which can be customized
      when needed
    - DMMT (Don't make me think) - avoid surprises, keep it intuitive
    - KISS (keep it simple, stupid) - avoid unnecessary complexity, prefer simple solutions

1. **Hierarchy is suite → realm → layer → handler group → handler.** Never skip levels or mix
   concerns across them.

1. **Blong is a runtime, not a library.** Handlers never `import` other handlers. All cross-handler
   dependencies are injected at runtime by the framework via the `handler()` factory's `handler: {}`
   proxy. Direct imports between handlers break the IoC model.

1. **Semantic triple naming — `subjectObjectPredicate`.** Every API handler is named as a three-part
   compound: `subject` (realm/namespace), `object` (entity), `predicate` (action). The file name,
   exported function name, and wire-format method name are all identical (e.g. `userUserAdd.ts`
   exports `userUserAdd`).

1. **Standard predicates only.** Use `get` (single by ID), `find` (list with filter/pagination),
   `add` (create), `edit` (modify), `remove` (delete), `merge` (upsert) for single-entity
   operations; `insert`, `update`, `delete` for bulk operations. Never invent non-standard
   predicates.

1. **Two-word property names.** Use `userName` not `name`; `customerId` not `id`; `emailAddress` not
   `email`. Two-word names prevent context ambiguity when entities from multiple realms appear
   together.

1. **One handler per file.** File name = exported function name = semantic triple. Library functions
   also get their own files.

1. **Well-known layer folders are auto-discovered — no registration needed.** The folders `error`,
   `adapter`, `orchestrator`, `gateway`, `sim`, `test` (server) and `backend`, `component` (browser)
   are automatically detected and activated at their default environment. Custom folder names
   require a `layer.server.ts` / `layer.browser.ts` file.

1. **Adapters and orchestrators are self-contained.** Their configuration goes in the `activation`
   property co-located in the layer file — not in the realm's `server.ts`. The realm's `server.ts`
   is only needed when realm-level config is shared across layers.

1. **`$meta` flows through every handler call.** Always accept and forward `$meta` as the second
   parameter to preserve auth, tracing, and transport metadata across the call chain.

1. **`dev/` is gitignored — never commit code there.** All committed work goes in `core/`.

---

## Architecture Hierarchy

```
Suite             — top-level entry point, glues realms, defines deployment config
  └── Realm       — business domain boundary (e.g. user, payment, marine)
        └── Layer — functional group within a realm (adapter, orchestrator, gateway, …)
              └── Handler Group  — folder of related handlers (AKA realm namespaces)
                    └── Handler  — single function in a single file
```

## Choosing the Right Skill

**For implementation tasks, use these skills:**

| Your Task                                | Use This Skill                                        |
| ---------------------------------------- | ----------------------------------------------------- |
| Creating a new top-level solution        | **blong-suite**                                       |
| Creating a new business domain           | **blong-realm**                                       |
| Adding an API endpoint                   | **blong-handler** (JSON-RPC) or **blong-rest** (REST) |
| Connecting to database                   | **blong-adapter** (see SQL adapter patterns)          |
| Calling external API                     | **blong-adapter** (see HTTP adapter patterns)         |
| Implementing business logic              | **blong-orchestrator**                                |
| Organizing code into layers              | **blong-layer**                                       |
| Implementing protocols                   | **blong-codec**                                       |
| Adding input validation                  | **blong-validation**                                  |
| Defining typed errors                    | **blong-error**                                       |
| Writing tests                            | **blong-test**                                        |
| Setting up test entry point (index.ts)   | **blong-test-api**                                    |
| Simulating HTTP/TCP backends locally     | **blong-test-sim**                                    |
| CI integration tests with K8s backends   | **blong-test-int**                                    |
| Testing with mock handlers (server-side) | **blong-mock-test**                                   |
| Implementing EIP integration patterns    | **blong-eip**                                         |
| Setting up Storybook                     | **storybook-v10-setup**                               |
| Developing with Storybook                | **storybook-testing-workflow**                        |
| Viewing real-time logs                   | **blong-log**                                         |
| Implementing blong-browser components    | **blong-browser**                                     |
| Using the model for realm CRUD pages     | **blong-model**                                       |
| Developing the model system internals    | **blong-model-dev**                                   |

**For understanding concepts:**

- Suite structure and test entry points: **blong-suite**
- Layer architecture and organization: **blong-layer**
- Protocol implementation details: **blong-codec**
- Realm deployment patterns: **blong-realm**

## Framework Concepts

### Core Definitions

**Suite:** The top-level organizational unit in the framework. A suite groups related realms and
defines multi-platform entry points (`server.ts`, `browser.ts`, `index.ts`). Suites take deployment
architecture decisions and glue reusable realms together. They are launched using the `blong` CLI.

**Modular Architecture:** Solutions combine functionality from multiple realms within a suite while
maintaining maximum isolation between them.

**Business Logic Separation:**

- **Business process/workflow:** Coordinates data integrity logic (typically in orchestrators)
- **Data integrity logic:** Ensures atomic, correct data persistence (often in database stored
  procedures)
- **Integration logic:** Handles external system communication (in adapters)

**Platform Support:** Suites define entry points per platform:

- `server` - Server-side solution running in Kubernetes pods
- `browser` - Browser-based applications
- `desktop` - Desktop applications (future)
- `mobile` - Mobile applications (future)

**Interaction Origins:** The framework distinguishes interactions by origin:

- **Application front ends** - Administration, management, and user-facing browser/desktop/mobile
  apps
- **Edge devices** - ATM, POS, IoT devices
- **Third-party systems** - Core banking, payment systems, external APIs
- **Automated processes** - Scheduled tasks, event-driven processes

### Deployment Flexibility

**"Bring Your Own Architecture":** Same codebase can run as:

- **Modular monolith:** All realms in single process (development)
- **Microservices:** Each realm/layer as separate Kubernetes pod (production)
- **Hybrid:** Mix of monolith and microservices based on needs

### Framework Philosophy

**Primary Goal:** Decrease development and operational costs through:

- **Test-driven development:** Fast reload, minimal restarts
- **Minimal learning curve:** Small API surface, well-defined conventions
- **Fast build/deploy cycles:** Runtime-like framework approach
- **100% test coverage:** Built-in testing patterns

**Approach:** Cloud-native friendly, type-safe, modular architecture supporting multiple deployment
patterns.

## Key Patterns

### Suite Pattern

Suites are the top-level entry points for the solution. A suite includes reusable realms from
packages and local custom realms.

**For full suite patterns, see: blong-suite**

### Service Definition Pattern

Realms and layers use functional configuration with the framework's builder pattern. Adapters and
orchestrators are self-contained — their `activation` config is co-located in the layer file with no
need to update the realm's `server.ts`. The realm's `server.ts` is only needed for realm-level
config shared across layers.

**For full service definition patterns, see: blong-realm, blong-adapter, blong-orchestrator**

### The handler and runtime pattern

Handlers are functions called by adapters and orchestrators. They follow a semantic triple naming
convention: `subjectObjectPredicate` where:

- `subject` = realm namespace or realm name
- `object` = entity within realm
- `predicate` = action on entity

Blong is a **runtime**, not a library. Handler files never `import` other handler files or the blong
runtime (blong-gogo). All dependencies are injected by the framework at runtime through the
`handler()` factory. This pattern is the most important to understand and follow and is the lingua
franca of the framework.

```typescript
import {handler} from '@feasibleone/blong';

export default handler(
    runtime =>
        async function subjectObjectPredicate(params, $meta) {
            // Handler code here
        },
);
```

The `runtime.handler` property is a **proxy** populated at runtime with all handlers from the
component's `imports`. Calling a handler method through this proxy routes through the framework's
handler registry — enabling modular deployment, hot reload, and test mocking without code changes.

- `runtime.lib` — library functions from the same handler group
- `runtime.errors` — typed errors from the realm's error layer (simplified: `{errorEntityNotFound}`
  maps to `entity.notFound`)
- `runtime.config` — configuration slice for this component
- `runtime.log` — logger instance
- `runtime.handler` — proxy to other handlers (adapters, orchestrators, etc.)

The same factory shape applies to `library()` functions.

**Handler Types:**

- **Internal handlers:** Framework-defined for protocol tasks (`send`, `receive`, `encode`,
  `decode`, `exec`, `ready`, `idleSend`, `idleReceive`, `drainSend`)
- **Internal API handlers:** Business functionality using semantic triples (e.g., `userUserAdd`,
  `mathNumberSum`)
- **Library functions:** Reusable logic shared between handlers

**Internal API Naming Conventions:**

- `get` - gets a single entity by unique identifier
- `find` - returns a list with filtering and pagination
- `add` - creates a single entity
- `edit` - modifies a single entity
- `remove` - deletes a single entity
- `merge` - creates or modifies depending on existence
- `insert` / `update` / `delete` - bulk operations

**Property naming:** prefer two-word names to avoid ambiguity (e.g. `userName` not `name`,
`customerId` not `id`, `emailAddress` not `email`).

**File Organization:** One handler per file using semantic triple as filename (e.g.,
`userUserAdd.ts`, `mathNumberSum.ts`)

**For detailed implementation patterns, see:**

- **blong-handler** - Complete handler implementation patterns, API destructuring, library functions
- **blong-validation** - Automatic validation with `~.schema.ts` files and Handler types

### Adapter Pattern

Adapters integrate with external systems using the adapter design pattern. They expose high-level
APIs compatible with framework conventions, independent of underlying protocols.

**Adapter Types:**

- **Stream-based:** TCP protocols with `encode`/`decode` handlers for serialization
- **API-based:** HTTP/SDK protocols using JavaScript objects directly

**Built-in adapter base types:** `adapter.http`, `adapter.knex` (SQL), `adapter.tcp`,
`adapter.dispatch` (browser-side)

**For detailed implementation patterns, see:**

- **blong-adapter** - Complete adapter patterns (HTTP, TCP, SQL, MongoDB, S3, K8s, webhooks)

### Orchestrator Pattern

Orchestrators implement business logic decoupled from integration protocols. They coordinate between
adapters and define API namespaces. Each orchestrator namespace becomes a Kubernetes service in
microservice mode.

**Business Logic Types:**

- **Business process/workflow:** Coordinates data integrity logic
- **Data integrity logic:** Ensures atomic, correct data persistence
- **Distributed transactions:** Orchestration pattern for microservices

**Built-in orchestrator base types:** `orchestrator.dispatch` (standard), `orchestrator.schedule`
(cron)

**For detailed implementation patterns, see:**

- **blong-orchestrator** - Orchestrator patterns, dispatch configuration, saga patterns

### Gateway Pattern

Gateway (API Gateway) is the public-facing interface exposing functionality as JSON-RPC endpoints by
default, with REST endpoint support.

**Gateway Responsibilities:**

- API serving with validation
- API documentation generation
- Kubernetes ingress exposure
- Request/response transformation

**For detailed implementation patterns, see:**

- **blong-rest** - REST API implementation using OpenAPI/Swagger (server & client)
- **blong-validation** - API validation and documentation generation

### Default protocol JSON-RPC 2.0

All blong APIs use JSON-RPC 2.0 and semantic triple method names.

**External API** (client → server):

- Endpoint: `POST /rpc/{subject}/{object}/{predicate}`
- Auth: `Authorization: Bearer <token>`
- Errors: JSON-RPC error objects with `type`, `message`, `print`, `validation`, `params` fields
  (`stack` and `cause` only in debug mode)

**Internal API** (microservice → microservice):

- Endpoint: `POST http://{namespace}/ports/{subject}/request`
- Params: `[...arguments, $meta]` array
- Errors: returned in result with `mtid: 'error'` — never as JSON-RPC error objects
- Notifications: `POST http://{namespace}/ports/{subject}/publish`

Both APIs use the same `subjectObjectPredicate` method naming. Handler code is transport-agnostic.

**For detailed patterns, see: blong-rest** (external) and **blong-codec** (internal transport).

### Codec Pattern

Codecs enable protocol implementation on top of HTTP adapters.

**For detailed implementation patterns, see:**

- **blong-codec** - Protocol implementation (OpenAPI, JSON-RPC, MLE, TCP codecs)
- **blong-log** - Real-time log viewer setup and monitoring

## What Happens Automatically

The framework performs the following without explicit configuration:

- **Layer auto-discovery:** Well-known folders are discovered and activated per their default
  environments without any `layer.*.ts` file.
- **Handler registration:** All handlers in an imported group are registered in the component's
  method registry.
- **Validation:** When a handler exports a `Handler` type, the framework generates a TypeBox schema
  (`~.schema.ts`) and validates inputs/outputs at runtime.
- **OpenAPI docs:** Gateway layer generates API documentation from handler types.
- **Hot reload (watch mode):** TypeScript changes, codec reloads, SQL stored procedure updates, and
  config changes all reload without dropping connections, with automatic test reruns.
- **Kubernetes services:** In microservice mode, each orchestrator namespace becomes a separate
  Kubernetes service automatically.

### Well-Known Layer Activation Defaults

| Folder         | Server active in   | Browser active in  |
| -------------- | ------------------ | ------------------ |
| `error`        | always             | —                  |
| `adapter`      | always             | always             |
| `orchestrator` | always             | —                  |
| `gateway`      | always             | —                  |
| `sim`          | `integration` only | —                  |
| `test`         | `test` only        | `integration` only |
| `backend`      | —                  | always             |
| `component`    | —                  | always             |

## Development Workflows

### Build Commands

- **Primary build:** `npm run build` (runs heft build --clean via Rush)
- **Rush install:** `node common/scripts/install-run-rush.js install`
- **Rush rebuild:** `node common/scripts/install-run-rush.js rebuild`

### Testing

- **Unit tests:** Use `tap` framework (see package.json devDependencies)
- **API tests:** Defined in `index.ts` — loads both server and browser platforms, runs tests from
  browser side (fastest, simulates most common interaction)
- **Internal API tests:** Defined in `internal.test.ts` — loads only server, uses `tap` for coverage
- **HTTP testing:** Use `.http` files for manual/scripted API testing

### Configuration Environments

Configuration merges from multiple sources: source code, config files, environment variables, CLI
parameters.

**Standard environments:**

- `default` - Base configuration (always active)
- `dev` - Development environment
- `prod` - Production/UAT environments
- `test` - Automated testing
- `db` - Database creation
- `realm` - Single realm development focus
- `microservice` - Production microservice mode
- `integration` - Integration testing mode

**Suite/realm config:** declared in `server.ts` / `browser.ts` as
`config: { default: {}, microservice: {}, dev: {} }`. Keys are environment names merged into active
config.

**Adapter/orchestrator config:** declared in the `activation` property co-located in the layer file
— no need to touch the realm's `server.ts`. Config is validated via TypeBox schemas declared
alongside the component.

**Watch Mode (Hot Reload):** Framework provides server-side hot reload for:

- TypeScript handler/adapter/validation changes
- Codec reloads without dropping connections
- SQL stored procedure updates
- Configuration changes
- Automatic test reruns

## TypeScript Conventions

### Type System

- Uses `typebox` for runtime schema validation
- Framework provides `blong.type.*` builders for schema definition
- OpenAPI integration via `openapi-types` package

### Module System

- **ESM modules only** (`"type": "module"` in package.json)
- Use `.js` extensions in imports even for TypeScript files
- Workspace dependencies use `workspace:^` protocol
- Framework built entirely on TypeScript and ECMAScript modules
- CommonJS supported when possible but ESM preferred

### File Structure

- Entry points: `index.ts` (exports both server/browser)
- Configuration: Framework handles validation via TypeBox schemas
- Extensions: Use URL-based imports (`import.meta.url` pattern)

## Key Dependencies

- **typebox** - Runtime type validation and schema
- **fastify** - Fast, low overhead web framework for Node.js
- **pino** - Very low overhead structured logging
- **@rushstack/heft** - Build system and toolchain
- **jose** - JWT handling for authentication
- **tap** - Testing framework
- **got** - HTTP request library for Node.js
- **ky** - Browser HTTP client based on Fetch API
- **p-queue** - Promise queue with concurrency control
- **ut-bitsyntax** - Serialization/deserialization based on patterns

## Integration Patterns

### OpenAPI Integration

Services can import OpenAPI specs for external API integration.

**For detailed patterns, see:**

- **blong-rest** - REST API implementation and OpenAPI integration
- **blong-codec** - OpenAPI codec configuration

### Authentication

Uses `@feasibleone/blong-login` for JWT-based authentication with token creation endpoints at
`/rpc/login/token/create`.

### Error Handling

Framework provides structured error handling with `IErrorFactory` pattern for defining typed domain
errors. Error objects contain: `type`, `message`, `print`, `validation` (for validation errors),
`params`, `req`, `res`, `stack`, `cause` (nested error). `stack` and `cause` are only included in
debug mode.

**For detailed patterns, see:**

- **blong-error** - Defining and throwing typed errors with parameterized messages

## Common Tasks

**For detailed implementation guides, see the blong skills:**

- **Creating a new suite:** See **blong-suite** for suite creation, multi-platform entry points, and
  tests
- **Adding a new service:** See **blong-realm** for realm creation patterns
- **Adding API endpoint:** See **blong-rest** (REST) or **blong-handler** (JSON-RPC)
- **Database integration:** See **blong-adapter** for database adapter patterns
- **External API:** See **blong-adapter** for webhook and HTTP adapters
- **Adding tests:** See **blong-test** for test handler patterns
- **Setting up the test entry point:** See **blong-test-api** for `index.ts` wiring and platform
  loading
- **Simulating backends:** See **blong-test-sim** for local HTTP/TCP backend simulation
- **CI integration tests:** See **blong-test-int** for Kubernetes-based real backend tests
- **Testing with mocks:** See **blong-mock-test** for server-side testing with mock handlers
- **EIP patterns:** See **blong-eip** for message routing, filtering, aggregation, and
  transformation
- **Error definitions:** See **blong-error** for typed error patterns
- **Validation:** See **blong-validation** for input/output validation
- **Real-time logging:** See **blong-log** for log viewer setup and monitoring

**Manual Testing:** Use `.http` files for manual/scripted API testing

## Architecture & Design Documents

For detailed design rationale and architecture decisions, see the
[docs/blong/docs/rationale/](../docs/blong/docs/rationale/) folder:

- **[Goals](../docs/blong/docs/rationale/goals.md)** - Framework goals and approach
- **[Prior Art](../docs/blong/docs/rationale/prior.md)** - Related paradigms and inspirations
- **[Error Proxy System](../docs/blong/docs/rationale/error-proxy.md)** - Simplified error
  referencing implementation
- **[Real-Time Log](../docs/blong/docs/rationale/real-time-log.md)** - Real-time log viewer design
  and implementation
