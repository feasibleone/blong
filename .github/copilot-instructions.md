# Blong AI Coding Instructions

Blong is a TypeScript-based API-focused RAD (Rapid Application Development) framework built as a Rush.js monorepo using pnpm workspaces. The framework provides a "bring your own architecture" approach, enabling deployments from modular monoliths to full microservices.

## Architecture Overview

**Monorepo Structure:** This is a Rush.js monorepo with three main areas:
- `core/` - Framework packages (blong, blong-gogo, blong-kopi, blong-login, etc.)
- `dev/` - Development/example projects (ml, tools)
- `docs/` - Documentation site

**Realm-Based Modular Architecture:** Business logic is separated into independent realms (domains) that can be deployed together or separately. Each realm follows a layered architecture:

```
realm/                 # Business domain boundary
├── server.ts         # Entry point with realm() function
├── browser.ts        # Client-side entry
├── adapter/          # External system communication (db.ts, fspiop.ts)
├── orchestrator/     # Business process coordination
├── gateway/          # API layer with validation/documentation
└── error/            # Domain-specific error definitions
```

**Recommended Layer Names:**
- `gateway` - API routes, validation, documentation (minimal business logic)
- `adapter` - External system protocols (SQL, HTTP, FTP, mail servers)
- `orchestrator` - Business process coordination between adapters
- `backend` - Browser-side adapter talking to server
- `component` - Browser-side React components
- `test` - Automated testing (dev/build only)
- `eft` - Electronic Funds Transfer (OLTP with high TPS requirements)

### Realm Folder Structure

Handlers and library functions are organized in groups within realm layers. Group names follow the format `realmname.foldername` and are referenced in the `imports` property of adapters and orchestrators.

**Example Structure:** A `math` realm implementing number operations:
```
📁 math
├──📁 orchestrator
│   ├──📁 number              # Handler group: math.number
│   │   ├── sum.ts           # Library function
│   │   ├── mathNumberSum.ts # API handler
│   │   └── mathNumberAverage.ts
│   └── mathDispatch.ts      # Orchestrator entry point
├──📁 adapter
│   └── db.ts               # Database adapter
├──📁 gateway
│   └── api.yaml           # OpenAPI specs
├──📁 error
│   └── error.ts            # Typed error definitions
├──📁 test
│   └──📁 test              # Test layer (test.test namespace)
│       └── testMath.ts     # Test handlers
├── server.ts              # Realm entry point
└── browser.ts            # Client entry point
```

**Error Layer:** Contains typed error definitions using the framework's error pattern:
```typescript
// math/error/error.ts
export default {
    'numberInteger': 'Numbers must be integer',
    'divisionByZero': 'Division by zero is not allowed'
};
```

**Test Layer:** Contains test handlers in `test/test/` folder (test.test namespace):
```typescript
// math/test/test/testMath.ts
export default handler(({handler: {mathNumberSum}}) => ({
    testMath: () => [
        (assert) => assert.equal(mathNumberSum([1, 2, 3]), 6)
    ]
}));
```

**File Organization Benefits:**
- Fast handler discovery in VS Code (`ctrl+p uua` → `userUserAdd.ts`)
- One handler per file for easier code review
- Clear separation between business logic layers
- Group imports enable modular deployment

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
    validation: blong.type.Object({ /* realm config schema */ }),
    children: ['./orchestrator', './adapter', './gateway'],
    config: {
        default: {
            mathDispatch: {
                namespace: 'number',
                imports: 'math.number',  // References math/orchestrator/number/ folder
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

**Handler Definition:**
```typescript
// API handler with automatic validation
/** @description "Description of the handler" */
type Handler = ({
    /** @description "Description of param property" */
    paramProperty: string
}) => Promise<{
    /** @description "Description of result property" */
    resultProperty: number;
}>;

export default handler(({
    lib: { sum },           // Library functions
    errors,                 // Domain errors
    config: { precision },  // Configuration
    handler: { otherHandler } // Other handlers
}) =>
    async function handlerName(
        params: Parameters<Handler>[0],
        $meta: IMeta
    ): ReturnType<Handler> {
        // implementation using api destructuring
    }
);

// Library function
export default library(({ error }) =>
    function sum(params: number[]) {
        if (!params.every(Number.isInteger)) throw errors.numberInteger();
        return params.reduce((prev, cur) => prev + cur, 0);
    }
);
```

**File Organization:** One handler per file using semantic triple as filename (e.g., `userUserAdd.ts`, `mathNumberSum.ts`)

**Auto-validation:** Place `~.schema.ts` file in handler folders - framework auto-updates when Handler types change.

### Adapter Pattern

Adapters integrate with external systems using the adapter design pattern. They expose high-level APIs compatible with framework conventions, independent of underlying protocols.

**Adapter Types:**
- **Stream-based:** TCP protocols with `encode`/`decode` handlers for serialization
- **API-based:** HTTP/SDK protocols using JavaScript objects directly

**Adapter Loop:** Adapters follow a sequence calling handlers:
- **Stream-based:** `send` → `encode` → `Duplex Stream` → `decode` → `receive` → `dispatch` → loop back to `send`, where `Duplex Stream` handles the TCP communication
- **API-based:** `send` → `execute` → `receive` → `dispatch` → loop back to `send`, where `execute` calls external APIs/SDKs

```typescript
export default adapter<TSchema>(api => ({
    extends: 'adapter.knex', // or 'adapter.webhook', etc.
    // custom implementation
}));
```

### Orchestrator Pattern

Orchestrators implement business logic decoupled from integration protocols. They coordinate between adapters and define API namespaces. Each orchestrator typically handles one namespace and becomes a Kubernetes service.

**Business Logic Types:**
- **Business process/workflow:** Coordinates data integrity logic
- **Data integrity logic:** Ensures atomic, correct data persistence
- **Distributed transactions:** Orchestration pattern for microservices

```typescript
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
}));
```

### Gateway Pattern

Gateway (API Gateway) is the public-facing interface exposing functionality as JSON-RPC endpoints by default, with REST endpoint support.

**Gateway Responsibilities:**
- API serving with validation
- API documentation generation
- Kubernetes ingress exposure
- Request/response transformation

```typescript
// gateway/api.yaml - OpenAPI specification
// Automatic validation and documentation generation
```

### Codec Pattern

Codecs enable protocol implementation on top of HTTP adapters:

```typescript
// Configuration for OpenAPI codec
config: {
  default: {
    http: {
      'codec.openapi': {
        namespace: {
          external: ['https://api.example.com/swagger.json', './local-spec.yaml']
        }
      }
    }
  }
}
```

## Development Workflows

### Build Commands

-   **Primary build:** `npm run build` (runs heft build --clean via Rush)
-   **Rush install:** `node common/scripts/install-run-rush.js install`
-   **Rush rebuild:** `node common/scripts/install-run-rush.js rebuild`

### Testing

-   **Unit tests:** Use `tap` framework (see package.json devDependencies)
-   **API tests:** Use `jest-cucumber` with Gherkin features (see `tools/api-test/`)
-   **HTTP testing:** Use `.http` files for manual/scripted API testing

### Configuration Environments

Configuration merges from multiple sources: source code, config files, environment variables, CLI parameters.

**Standard environments:**
-   `default` - Base configuration (always active)
-   `dev` - Development environment
-   `prod` - Production/UAT environments
-   `test` - Automated testing
-   `db` - Database creation
-   `realm` - Single realm development focus
-   `microservice` - Production microservice mode
-   `integration` - Integration testing mode

**Watch Mode (Hot Reload):** Framework provides server-side hot reload for:
- TypeScript handler/adapter/validation changes
- Codec reloads without dropping connections
- SQL stored procedure updates
- Configuration changes
- Automatic test reruns

## TypeScript Conventions

### Type System

-   Uses `@sinclair/typebox` for runtime schema validation
-   Framework provides `blong.type.*` builders for schema definition
-   OpenAPI integration via `openapi-types` package

### Module System
-   **ESM modules only** (`"type": "module"` in package.json)
-   Use `.js` extensions in imports even for TypeScript files
-   Workspace dependencies use `workspace:^` protocol
-   Framework built entirely on TypeScript and ECMAScript modules
-   CommonJS supported when possible but ESM preferred

### File Structure

-   Entry points: `index.ts` (exports both server/browser)
-   Configuration: Framework handles validation via TypeBox schemas
-   Extensions: Use URL-based imports (`import.meta.url` pattern)

## Key Dependencies

-   **@sinclair/typebox** - Runtime type validation and schema
-   **fastify** - Fast, low overhead web framework for Node.js
-   **pino** - Very low overhead structured logging
-   **@rushstack/heft** - Build system and toolchain
-   **jose** - JWT handling for authentication
-   **tap** - Testing framework
-   **got** - HTTP request library for Node.js
-   **ky** - Browser HTTP client based on Fetch API
-   **p-queue** - Promise queue with concurrency control
-   **ut-bitsyntax** - Serialization/deserialization based on patterns

## Integration Patterns

### OpenAPI Integration

Services can import OpenAPI specs for external API integration:

```typescript
config: {
  fspiop: {
    'codec.openapi': {
      namespace: {
        dfsp: ['https://external-api/swagger.json', './local-spec.yaml']
      }
    }
  }
}
```

### Authentication

Uses `@feasibleone/blong-login` for JWT-based authentication with token creation endpoints at `/rpc/login/token/create`.

### Error Handling

Framework provides structured error handling with `IErrorFactory` pattern for defining typed domain errors.

## Common Tasks

**Adding a new service:** Create folder with `server.ts`, `browser.ts`, then add to parent's `children` array
**Adding API endpoint:** Define in `gateway/` with OpenAPI spec, implement in orchestrator
**Database integration:** Create `adapter/db.ts` extending `adapter.knex`
**External API:** Create `adapter/[name].ts` extending `adapter.webhook`
**Adding tests:** Use `.http` files for manual testing, jest-cucumber for automated API tests
