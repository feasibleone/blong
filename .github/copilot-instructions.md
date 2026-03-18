# Blong AI Coding Instructions

Blong is a TypeScript-based API-focused RAD (Rapid Application Development) framework built as a Rush.js monorepo using pnpm workspaces. The framework provides a "bring your own architecture" approach, enabling deployments from modular monoliths to full microservices.

## Architecture Overview

**Monorepo Structure:** This is a Rush.js monorepo with three main areas:

- `core/` - Framework packages (blong, blong-gogo, blong-kopi, blong-log, blong-login, etc.)
- `dev/` - Development/example projects (ml, tools)
- `docs/` - Documentation site

**Suite-Based Modular Architecture:** The top-level organizational unit is a **suite**. Suites group related realms and provide entry points for different platforms (server, browser, desktop). Business logic is separated into independent **realms** (domains) within suites. Each realm follows a layered architecture.

Hierarchy: **suites → realms → layers**

**For detailed implementation patterns, see:**

- **blong-suite** - Creating and configuring suites, multi-platform entry points, and test runner setup
- **blong-realm** - Creating business domain boundaries and realm configuration
- **blong-layer** - Organizing handlers into functional groups (gateway, adapter, orchestrator, error, test)

### Realm Folder Structure

Handlers and library functions are organized in groups within realm layers. Group names follow the format `realmname.foldername` and are referenced in the `imports` property of adapters and orchestrators.

**File Organization Benefits:**

- Fast handler discovery in VS Code (`ctrl+p uua` → `userUserAdd.ts`)
- One handler per file for easier code review
- Clear separation between business logic layers
- Group imports enable modular deployment

**For implementation details, see:**

- **blong-handler** - Handler and library function patterns, semantic triple naming
- **blong-error** - Typed error definitions and error handling
- **blong-test** - Test handler patterns with parallel execution and automatic dependencies
- **blong-mock-test** - Server-side integration testing with mock handlers
- **blong-eip** - Enterprise Integration Pattern handlers (routing, filtering, aggregation, etc.)

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
| Testing with mock handlers (server-side) | **blong-mock-test**                                   |
| Implementing EIP integration patterns    | **blong-eip**                                         |
| Setting up Storybook                     | **storybook-v10-setup**                               |
| Developing with Storybook                | **storybook-testing-workflow**                        |
| Viewing real-time logs                   | **blong-log**                                         |

**For understanding concepts:**

- Suite structure and test entry points: **blong-suite**
- Layer architecture and organization: **blong-layer**
- Protocol implementation details: **blong-codec**
- Realm deployment patterns: **blong-realm**

## Framework Concepts

### Core Definitions

**Suite:** The top-level organizational unit in the framework. A suite groups related realms and defines multi-platform entry points (`server.ts`, `browser.ts`, `index.ts`). Suites take deployment architecture decisions and glue reusable realms together. They are launched using the `blong` CLI.

**Modular Architecture:** Solutions combine functionality from multiple realms within a suite while maintaining maximum isolation between them.

**Business Logic Separation:**

- **Business process/workflow:** Coordinates data integrity logic (typically in orchestrators)
- **Data integrity logic:** Ensures atomic, correct data persistence (often in database stored procedures)
- **Integration logic:** Handles external system communication (in adapters)

**Platform Support:** Suites define entry points per platform:

- `server` - Server-side solution running in Kubernetes pods
- `browser` - Browser-based applications
- `desktop` - Desktop applications
- `mobile` - Mobile applications

**Interaction Origins:** The framework distinguishes interactions by origin:

- **Application front ends** - Administration, management, and user-facing browser/desktop/mobile apps
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

**Approach:** Cloud-native friendly, type-safe, modular architecture supporting multiple deployment patterns.

## Key Patterns

### Suite Pattern

Suites are the top-level entry points for the solution. A suite includes reusable realms from packages and local custom realms:

```typescript
// server.ts - suite server-side entry point
import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    children: [
        async function reusableRealm() {
            return import('reusable-realm/server.js');
        },
        './custom-realm-1',
    ],
    config: {
        default: {},
        microservice: {},
        dev: {},
        integration: {watch: {test: ['test.subject']}},
    },
}));

// index.ts - API test entry point (server + browser, tests from browser side)
export default async load => {
    const platforms = await Promise.all([
        load(server, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev']),
        load(browser, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev']),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[1].test(); // run tests from the browser side
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
```

**For full suite patterns, see: blong-suite**

### Service Definition Pattern

Realms and layers use functional configuration with the framework's builder pattern:

```typescript
// server.ts - minimal realm, controls layer activation only
export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}), // No per-layer config needed
    children: ['./submodule', async () => import('@pkg/module')],
    config: {default: {}, microservice: {adapter: true, orchestrator: true}, dev: {}},
}));

// realm.ts (for sub-services) - minimal
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./orchestrator', './adapter', './gateway'],
    config: {
        default: {},
        microservice: {adapter: true, orchestrator: true, gateway: true},
    },
}));

// adapter/db.ts - self-contained with co-located config
export default adapter(blong => ({
    extends: 'adapter.knex',
    activation: {
        default: {
            namespace: 'math',
            imports: 'math.number', // References math/adapter/db/ folder
        },
    },
}));

// orchestrator/dispatch.ts - self-contained with co-located config
export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'number',
            imports: 'math.number', // References math/orchestrator/number/ folder
        },
    },
}));
```

### Handler Pattern

Handlers are functions called by adapters and orchestrators. They follow a semantic triple naming convention: `subjectObjectPredicate` where:

- `subject` = namespace/realm name
- `object` = entity within realm
- `predicate` = action on entity

**Handler Types:**

- **Internal handlers:** Framework-defined for protocol tasks (`send`, `receive`, `encode`, `decode`, `exec`, `ready`, `idleSend`, `idleReceive`, `drainSend`)
- **Internal API handlers:** Business functionality using semantic triples (e.g., `userUserAdd`, `mathNumberSum`)
- **Library functions:** Reusable logic shared between handlers

**Internal API Naming Conventions:**

- `get` - gets a single entity by unique identifier
- `find` - returns a list with filtering and pagination
- `add` - creates a single entity
- `edit` - modifies a single entity
- `remove` - deletes a single entity
- `merge` - creates or modifies depending on existence
- `insert` / `update` / `delete` - bulk operations

**Property naming:** prefer two-word names to avoid ambiguity (e.g. `userName` not `name`, `customerId` not `id`, `emailAddress` not `email`).

**File Organization:** One handler per file using semantic triple as filename (e.g., `userUserAdd.ts`, `mathNumberSum.ts`)

**For detailed implementation patterns, see:**

- **blong-handler** - Complete handler implementation patterns, API destructuring, library functions
- **blong-validation** - Automatic validation with `~.schema.ts` files and Handler types

### Adapter Pattern

Adapters integrate with external systems using the adapter design pattern. They expose high-level APIs compatible with framework conventions, independent of underlying protocols.

**Adapter Types:**

- **Stream-based:** TCP protocols with `encode`/`decode` handlers for serialization
- **API-based:** HTTP/SDK protocols using JavaScript objects directly

**For detailed implementation patterns, see:**

- **blong-adapter** - Complete adapter patterns (HTTP, TCP, SQL, MongoDB, S3, K8s, webhooks)

### Orchestrator Pattern

Orchestrators implement business logic decoupled from integration protocols. They coordinate between adapters and define API namespaces. Each orchestrator typically handles one namespace and becomes a Kubernetes service.

**Business Logic Types:**

- **Business process/workflow:** Coordinates data integrity logic
- **Data integrity logic:** Ensures atomic, correct data persistence
- **Distributed transactions:** Orchestration pattern for microservices

**For detailed implementation patterns, see:**

- **blong-orchestrator** - Orchestrator patterns, dispatch configuration, saga patterns

### Gateway Pattern

Gateway (API Gateway) is the public-facing interface exposing functionality as JSON-RPC endpoints by default, with REST endpoint support.

**Gateway Responsibilities:**

- API serving with validation
- API documentation generation
- Kubernetes ingress exposure
- Request/response transformation

**For detailed implementation patterns, see:**

- **blong-rest** - REST API implementation using OpenAPI/Swagger (server & client)
- **blong-validation** - API validation and documentation generation

### RPC Pattern

The framework uses JSON-RPC 2.0 for two distinct APIs:

- **External API** – exposed at `POST /rpc/<subject>/<object>/<predicate>` with `Authorization: Bearer <token>`. Errors returned as JSON-RPC error objects with typed `type`, `message`, `print`, `validation`, `params` fields (`cause` and `stack` only in debug mode).
- **Internal API** – used for inter-microservice communication at `POST http://microservice-name/ports/<subject>/request`. Params are `[...arguments, metadata]`; errors are returned in the result with `mtid: 'error'` (never as JSON-RPC errors). Notifications use `/ports/<subject>/publish`.

**For detailed patterns, see: blong-rest** (external) and **blong-codec** (internal transport).

### Codec Pattern

Codecs enable protocol implementation on top of HTTP adapters.

**For detailed implementation patterns, see:**

- **blong-codec** - Protocol implementation (OpenAPI, JSON-RPC, MLE, TCP codecs)
- **blong-log** - Real-time log viewer setup and monitoring

## Development Workflows

### Build Commands

- **Primary build:** `npm run build` (runs heft build --clean via Rush)
- **Rush install:** `node common/scripts/install-run-rush.js install`
- **Rush rebuild:** `node common/scripts/install-run-rush.js rebuild`

### Testing

- **Unit tests:** Use `tap` framework (see package.json devDependencies)
- **API tests:** Defined in `index.ts` — loads both server and browser platforms, runs tests from browser side (fastest, simulates most common interaction)
- **Internal API tests:** Defined in `internal.test.ts` — loads only server, uses `tap` for coverage
- **HTTP testing:** Use `.http` files for manual/scripted API testing

### Configuration Environments

Configuration merges from multiple sources: source code, config files, environment variables, CLI parameters.

**Standard environments:**

- `default` - Base configuration (always active)
- `dev` - Development environment
- `prod` - Production/UAT environments
- `test` - Automated testing
- `db` - Database creation
- `realm` - Single realm development focus
- `microservice` - Production microservice mode
- `integration` - Integration testing mode

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

Uses `@feasibleone/blong-login` for JWT-based authentication with token creation endpoints at `/rpc/login/token/create`.

### Error Handling

Framework provides structured error handling with `IErrorFactory` pattern for defining typed domain errors. Error objects contain: `type`, `message`, `print`, `validation` (for validation errors), `params`, `req`, `res`, `stack`, `cause` (nested error). `stack` and `cause` are only included in debug mode.

**For detailed patterns, see:**

- **blong-error** - Defining and throwing typed errors with parameterized messages

## Common Tasks

**For detailed implementation guides, see the blong skills:**

- **Creating a new suite:** See **blong-suite** for suite creation, multi-platform entry points, and tests
- **Adding a new service:** See **blong-realm** for realm creation patterns
- **Adding API endpoint:** See **blong-rest** (REST) or **blong-handler** (JSON-RPC)
- **Database integration:** See **blong-adapter** for database adapter patterns
- **External API:** See **blong-adapter** for webhook and HTTP adapters
- **Adding tests:** See **blong-test** for test handler patterns
- **Testing with mocks:** See **blong-mock-test** for server-side testing with mock handlers
- **EIP patterns:** See **blong-eip** for message routing, filtering, aggregation, and transformation
- **Error definitions:** See **blong-error** for typed error patterns
- **Validation:** See **blong-validation** for input/output validation
- **Real-time logging:** See **blong-log** for log viewer setup and monitoring

**Manual Testing:** Use `.http` files for manual/scripted API testing

## Architecture & Design Documents

For detailed design rationale and architecture decisions, see the [docs/blong/docs/rationale/](../docs/blong/docs/rationale/) folder:

- **[Goals](../docs/blong/docs/rationale/goals.md)** - Framework goals and approach
- **[Prior Art](../docs/blong/docs/rationale/prior.md)** - Related paradigms and inspirations
- **[Error Proxy System](../docs/blong/docs/rationale/error-proxy.md)** - Simplified error referencing implementation
- **[Real-Time Log](../docs/blong/docs/rationale/real-time-log.md)** - Real-time log viewer design and implementation
