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

These rules apply to all Blong code. When features appear incomplete or contradictory, use these
rules as the authoritative guide and prioritize the API definition as the primary source of truth:

1. Blong is work in progress. When working on it, there may be incomplete or even contradicting
   features. When in doubt, follow the leading principles to take decisions about how to implement
   or refactor code:
    - Follow the handler and runtime patterns described below — they are the foundational patterns
      that all framework components must follow. The handler pattern is a primary approach, where
      handlers keep maximum isolation. The framework makes sure to process them and provide many
      features without the handlers needing to be aware of them: configuration, validation, API
      docs, hot reload, test mocking, exception handling, telemetry, concurrency, cache, dependency
      analysis, etc.
    - The API definition is the primary and authoritative source of truth for all implementations.
      Currently it is derived from Typebox schemas or can be supplied via existing OpenAPI specs.
      These two ways must be well determined before implementing any functionality. Prefer
      generating the API definition from Typebox schemas co-located with the handlers, unless there
      is a reason to align with an existing OpenAPI spec, which as a minimum will require specifying
      the semantic triple (in x-blong-method) for each operation. Once the API definition is
      determined, many other things will be derived from it.
    - DRY (do not repeat yourself) - avoid duplication of ideas, logic, or code
    - RAD (rapid application development) - prioritize fast iteration and delivery, implement
      convention over configuration, be able to generate boilerplate code, which can be customized
      when needed
    - DMMT (Don't make me think) - avoid surprises, keep it intuitive
    - KISS (keep it simple, stupid) - avoid unnecessary complexity, prefer simple solutions

    When these principles conflict, apply them in the order listed: handler and runtime pattern
    first, then the API definition, then the adapters and orchestrators, then DRY, RAD, DMMT, and
    finally KISS.

1. **Hierarchy is suite → realm → layer → handler group → handler.** Never skip levels or mix
   concerns across them.

1. **Blong is a runtime, not a library.** .The runtime can run in both server and browser platforms
   without code changes. Future platforms (desktop, mobile) could be added later. As consequence:
    - The main `blong-gogo` package is not a production dependency of any realm or suite code. For
      the server platform, it is built as a docker image, which is then used to run the code in the
      realms and suites. In the development environment use the global `blong` command, which runs
      the runtime. When using the blong command, passing arguments on the command line is a way to
      activate configurations (including realms and layers) (e.g. `blong integration xxx.adapter`)
      or pass configuration settings (e.g. `blong --db.connection.password=secret`). Currently there
      are some exceptions for the realm's `index.test.ts` files, as they are launched via tap and
      refer to the `load` function in `blong-gogo`.
    - Handlers never `import` other handlers. All cross-handler dependencies are injected at runtime
      by the framework via the `handler()` factory's `handler: {}` proxy. Direct imports between
      handlers break the IoC model.

1. **Adapters and orchestrators are the functionality wrappers** - all business logic and external
   system integration goes via them. Sometimes docs or prompts could use the word "port" which is an
   older terminology for "adapters and orchestrators". They operate with the semantic triple naming
   convention when called via the internal or gateway API. Orchestrators can talk to other
   orchestrators and adapters, adapters must avoid directly calling other adapters. The adapters
   translate to and from the semantic triple internal API to the external system's API, i.e. they
   are the integration points, while the orchestrators are the business logic coordinators.

1. **Adapters and orchestrators are self-contained.** Their configuration goes in the `activation`
   property co-located in the layer file — not in the realm's `server.ts`. The realm's `server.ts`
   is only needed when realm-level config is shared across layers.

1. **Sometimes adapters and orchestrators can be a singleton**. In these cases they can import and
   attach handlers or refer to other functionality from multiple realms via RegEx patterns. This is
   often related to some underlying paradigm, like a DB connection pool, an authenticated state that
   needs to be shared or reusing repetitive logic like the test orchestrator. Nothing in the design
   of adapters or orchestrators should enforce a singleton usage.

1. **Semantic triple naming — `subjectObjectPredicate`.** Every API handler is named as a three-part
   compound: `subject` (realm/namespace), `object` (entity), `predicate` (action). The file name,
   exported function name, and wire-format method name are all identical (e.g. `userUserAdd.ts`
   exports `userUserAdd`). Always verify handler names follow this convention; flag any violations
   and suggest the correct triple-format name before proceeding. Use singular nouns for `subject`
   and `object` and present tense verbs for `predicate`. This is the main vocabulary of the
   framework and is critical. In some cases, when calling handlers a `namespace/` prefix can be
   added, which represent the intent to route the call to a specific adapter or orchestrator, which
   handles this namespace. This allows the same handler name to be used in different places, as the
   flow propagates across different orchestrators and adapters.

1. **Standard predicates only.** Use `get` (single by ID), `find` (list with filter/pagination),
   `add` (create), `edit` (modify), `remove` (delete), `merge` (upsert) for single-entity
   operations; `insert`, `update`, `delete` for bulk operations. Never invent non-standard
   predicates.

1. **Two-word property names.** Use `userName` not `name`; `customerId` not `id`; `emailAddress` not
   `email`. Two-word names prevent context ambiguity when entities from multiple realms appear
   together.

1. File naming: use semantic triple or two-word convention and avoid "index.x" files when
   appropriate. For example files which represent a single entity should be named after the entity
   or files representing a handler should be named after the handler's semantic triple. This is to
   make it easy to find the file in IDE (e.g. ctrl+p in VSCode). Use `CamelCase` names for Classes
   and React components and `camelCase` for everything else.

1. **One handler per file.** File name = exported function name = semantic triple. Library functions
   also get their own files.

1. **Well-known layer folders are auto-discovered — no registration needed.** The folders `error`,
   `adapter`, `orchestrator`, `gateway`, `sim`, `test` (server) and `backend`, `component` (browser)
   are automatically detected and activated at their default environment. Custom folder names
   require a `layer.server.ts` / `layer.browser.ts` file.

1. **`$meta` flows through every handler call.** Always accept and forward `$meta` as the second
   parameter to preserve auth, tracing, and transport metadata across the call chain.

1. **`dev/` is gitignored — never commit code there.**.

1. Always lint the files changed during the session. Use either vscode's built-in error reporting or
   run `node --run ci-lint -- [files...]` for each of the packages affected by the changes.

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
| Configuring / creating CLI intents       | **blong-intent**                                      |
| Setting up Storybook                     | **storybook-v10-setup**                               |
| Developing with Storybook                | **storybook-testing-workflow**                        |
| Viewing real-time logs                   | **blong-log**                                         |
| Implementing blong-browser components    | **blong-browser**                                     |
| Adding multi-language / i18n support     | **blong-i18n**                                        |
| Using the model for realm CRUD pages     | **blong-model**                                       |
| Developing the model system internals    | **blong-model-dev**                                   |
| Full-stack Playwright testing            | **blong-playwright**                                  |

**For understanding concepts:**

- Suite structure and test entry points: **blong-suite**
- Layer architecture and organization: **blong-layer**
- Protocol implementation details: **blong-codec**
- Realm deployment patterns: **blong-realm**
- CLI intents and activation system: **blong-intent**

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

### Well-Known Layer Intents (Auto-discovery Defaults)

The intent listed is the CLI intent that must be active for the layer to load automatically.
`default` means the layer loads regardless of intents.

| Folder         | Server intent      | Browser intent     |
| -------------- | ------------------ | ------------------ |
| `error`        | `default` (always) | —                  |
| `adapter`      | `default` (always) | `default` (always) |
| `orchestrator` | `default` (always) | —                  |
| `gateway`      | `default` (always) | —                  |
| `sim`          | `integration`      | —                  |
| `test`         | `integration`      | `integration`      |
| `backend`      | —                  | `default` (always) |
| `component`    | —                  | `default` (always) |

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

**Intents** (formerly called "activations") are the positional arguments passed to the `blong` CLI.
They control which config blocks are merged in for each realm, adapter, and orchestrator. See the
**blong-intent** skill and the [intents rationale doc](../docs/blong/docs/rationale/intents.md) for
the full reference.

**Standard intents:**

| Intent         | Purpose                                                                 | Process lifetime                         |
| -------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| `default`      | Base configuration (always active)                                      | —                                        |
| `dev`          | Development — verbose logs, hot-reload                                  | Long-running, restarts on file changes   |
| `prod`         | Production/UAT environments                                             | Long-running                             |
| `integration`  | Integration testing — enables watch/test mode                           | Long-running, reruns tests on change     |
| `microservice` | Activates the layers needed to run a realm as a standalone microservice | Long-running                             |
| `db`           | Database creation / seeding                                             | **Short-lived** — exits after completion |
| `debug`        | Enable `/api/sys/*` introspection, stack traces                         | No effect on lifetime                    |

**Platform intents (implicit — added by the framework, never passed on CLI):**

- `server` — always present on the server platform
- `browser` — always present on the browser platform

**Default intents:** Running `blong` with no arguments activates `dev + microservice + integration`.
This default provides a fast feedback loop — file saves trigger hot-reload and integration tests
rerun automatically — fulfilling the "Minimising development effort" goal.

**Suite/realm config:** declared in `server.ts` / `browser.ts` as
`config: { default: {}, microservice: {}, dev: {} }`. Keys are intent names merged into active
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

### Runtime Introspection (Debug Mode)

The framework includes built-in debug endpoints that expose internal state useful for
troubleshooting during development. Enable them in the suite's `server.ts` config:

```typescript
config: {
    dev: {
        gateway: {
            debug: true,            // include stack/cause in HTTP error responses
            expectedErrors: true,   // allow callers to suppress error logs for expected errors
        },
        systemDebug: {enabled: true}, // expose /api/sys/* introspection endpoints
    },
}
```

**System debug endpoints** (served by the gateway when `systemDebug.enabled` is `true`):

| Endpoint               | Returns                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `GET /api/sys/config`  | Effective runtime configuration snapshot (full merged object) |
| `GET /api/sys/ports`   | Names of all registered adapter/orchestrator ports            |
| `GET /api/sys/methods` | All handler method groups with their handler counts           |
| `GET /api/sys/modules` | Names of all registered realm modules                         |
| `GET /api/sys/rpc`     | Internal RPC server address info                              |

These endpoints have no auth by default (`auth: false`). Never enable `systemDebug` in production.
The `routePrefix` (default `/api/sys`) and `auth` fields can be overridden in config.

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
- **Troubleshooting runtime state:** Enable `systemDebug: {enabled: true}` in suite `dev` config to
  expose `/api/sys/*` introspection endpoints — see Runtime Introspection section above
- **Expected errors in tests:** Enable `gateway.expectedErrors: true` in suite `dev` config, then
  set `$meta.expect` in test calls — see
  [expected errors concept](../docs/blong/docs/concepts/expected-errors.md)

**Manual Testing:** Use `.http` files for manual/scripted API testing

## Local Development Environment

### Storybook (blong-browser / ui-demo)

When working on `core/blong-browser/` or `core/ui-demo/`, Storybook may already be running on
`http://localhost:6006`. A shared browser tab pointing to it may also be available in the session.

**Check if Storybook is running and which package it belongs to:**

```bash
PID=$(ss -tlnp | grep ':6006' | grep -oP 'pid=\K[0-9]+'); [ -n "$PID" ] && readlink /proc/$PID/cwd || echo "Storybook not running"
```

This prints the working directory of the Storybook process (e.g. `.../core/ui-demo` or
`.../core/blong-browser`), making it clear which package's Storybook is running. If the port is
listening, open or reuse the shared browser tab at `http://localhost:6006` to validate UI changes
interactively after each edit.

### Integration test backends (blong-int-adapter)

When working on `core/blong-int-adapter/` or running its integration tests, the required backend
services are usually already started. The expected ports are:

| Port  | Service               |
| ----- | --------------------- |
| 8180  | Keycloak              |
| 9092  | Kafka                 |
| 27017 | MongoDB               |
| 3306  | MySQL / MariaDB       |
| 9000  | MinIO (S3-compatible) |
| 8200  | Vault                 |

**Check if backends are running:**

```bash
ss -tlnp | grep -E ':8180|:9092|:27017|:3306|:9000|:8200'
```

Any port not listed in the output means that service is not yet started.

## Architecture & Design Documents

For detailed design rationale and architecture decisions, see the
[docs/blong/docs/rationale/](../docs/blong/docs/rationale/) folder:

- **[Goals](../docs/blong/docs/rationale/goals.md)** - Framework goals and approach
- **[Prior Art](../docs/blong/docs/rationale/prior.md)** - Related paradigms and inspirations
- **[Error Proxy System](../docs/blong/docs/rationale/error-proxy.md)** - Simplified error
  referencing implementation
- **[Real-Time Log](../docs/blong/docs/rationale/real-time-log.md)** - Real-time log viewer design
  and implementation
- **[Expected Errors](../docs/blong/docs/rationale/expected-errors.md)** - Expected-errors design
  and `$meta.expect` matching rules
