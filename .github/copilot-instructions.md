# Blong AI Coding Instructions

Blong is a TypeScript-based API-focused RAD (Rapid Application Development) framework built as a Rush.js monorepo using pnpm workspaces. The framework provides a "bring your own architecture" approach, enabling deployments from modular monoliths to full microservices.

## Architecture Overview

**Monorepo Structure:** This is a Rush.js monorepo with three main areas:

- `core/` - Framework packages (blong, blong-gogo, blong-kopi, blong-login, etc.)
- `dev/` - Development/example projects (ml, tools)
- `docs/` - Documentation site

**Realm-Based Modular Architecture:** Business logic is separated into independent realms (domains) that can be deployed together or separately. Each realm follows a layered architecture.

**For detailed implementation patterns, see:**

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
- **blong-test** - Test handler patterns and organization

## Framework Concepts

### Core Definitions

**Modular Architecture:** Solutions combine functionality from multiple realms while maintaining maximum isolation between them.

**Business Logic Separation:**

- **Business process/workflow:** Coordinates data integrity logic (typically in orchestrators)
- **Data integrity logic:** Ensures atomic, correct data persistence (often in database stored procedures)
- **Integration logic:** Handles external system communication (in adapters)

**Platform Support:** Primary focus on server/Node.js, with same concepts applicable to:

- `browser` - Browser-based applications
- `desktop` - Desktop applications
- `mobile` - Mobile applications

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

### Service Definition Pattern

Services use functional configuration with the framework's builder pattern:

```typescript
// server.ts
export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        /* config schema */
    }),
    children: ['./submodule', async () => import('@pkg/module')],
    config: {default: {}, microservice: {}, dev: {}, integration: {}},
}));

// realm.ts (for sub-services)
export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        /* realm config schema */
    }),
    children: ['./orchestrator', './adapter', './gateway'],
    config: {
        default: {
            mathDispatch: {
                namespace: 'number',
                imports: 'math.number', // References math/orchestrator/number/ folder
            },
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
- **API handlers:** Business functionality using semantic triples (e.g., `userUserAdd`, `mathNumberSum`)
- **Library functions:** Reusable logic shared between handlers

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

### Codec Pattern

Codecs enable protocol implementation on top of HTTP adapters.

**For detailed implementation patterns, see:**

- **blong-codec** - Protocol implementation (OpenAPI, JSON-RPC, MLE, TCP codecs)

## Development Workflows

### Build Commands

- **Primary build:** `npm run build` (runs heft build --clean via Rush)
- **Rush install:** `node common/scripts/install-run-rush.js install`
- **Rush rebuild:** `node common/scripts/install-run-rush.js rebuild`

### Testing

- **Unit tests:** Use `tap` framework (see package.json devDependencies)
- **API tests:** Use `jest-cucumber` with Gherkin features (see `tools/api-test/`)
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

- Uses `@sinclair/typebox` for runtime schema validation
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

- **@sinclair/typebox** - Runtime type validation and schema
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

Framework provides structured error handling with `IErrorFactory` pattern for defining typed domain errors.

**For detailed patterns, see:**

- **blong-error** - Defining and throwing typed errors with parameterized messages

## Common Tasks

**For detailed implementation guides, see the blong skills:**

- **Adding a new service:** See **blong-realm** for realm creation patterns
- **Adding API endpoint:** See **blong-rest** (REST) or **blong-handler** (JSON-RPC)
- **Database integration:** See **blong-adapter** for database adapter patterns
- **External API:** See **blong-adapter** for webhook and HTTP adapters
- **Adding tests:** See **blong-test** for test handler patterns
- **Error definitions:** See **blong-error** for typed error patterns
- **Validation:** See **blong-validation** for input/output validation

**Manual Testing:** Use `.http` files for manual/scripted API testing
