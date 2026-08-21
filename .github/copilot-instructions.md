# Blong Coding Instructions

Blong: TypeScript API framework — Rush.js monorepo (pnpm). Same codebase runs as modular monolith
(dev) or microservices (prod) unchanged. This instruction is the **router** — providing rules and
pointers to skills and details. Full detail lives in skills: invoke them via the `skill` tool.

## [CRITICAL_OBSERVABILITY]

- Output todo metrics explicitly. Emit the marker **immediately after the switch/pivot**, before
  during reasoning and right before starting the next task from the list. Emit at least once per
  todo item completed, and also within major milestones inside a single todo - every time you pivot
  to a new objective, finish a debugging cycle, or completely switch focus.

    Use ✅ COMPLETED / ❌ ABANDONED / 🔄 PIVOTED for the status and this exact structure for your
    markers:

    ```markdown
    # Task metrics: ✅/❌/🔄 [Short todo name]

    - Turns: [Number of responses spent on this todo]
    - Failures: [Count of failures/bugs hit during this todo]
    - Friction: [Low / Medium / High]
    - Tools: [Comma-separated list of tools used and how many times each]
    ```

- Track automatic decisions explicitly. Whenever you hesitated about what the user requested or you
  implied and made a choice, you MUST output this in: .github/memory/decision.md. If this is a
  critical decision that is likely to take a lot of effort to reconsider, you MUST stop and point
  the user to this file and state the decision needed. Make sure that you do not allow the Autopilot
  mode to interfere and answer questions instead of the user.

- Track missing, deferred or incomplete features explicitly in: .github/memory/todo.md. Update it
  with any tasks that you are deferring or leaving incomplete because it was not explicitly
  requested or for any other reason.

## [CRITICAL_GUARDRAILS]

Hard rules — apply first, never contradict.

- **Never import handlers directly.** Cross-handler deps via `handler()` proxy (`runtime.handler`);
  direct imports break IoC.
- **Semantic triple naming** `subjectObjectPredicate`; file = export = wire name; singular
  subject/object, present-tense predicate. Flag violations before proceeding.
- **Standard predicates prioritized.** `get`/`find`/`add`/`edit`/`remove`/`merge` (single);
  `insert`/`update`/`delete` (bulk). Never invent if one is already standard.
- **Always forward `$meta`** as the 2nd arg through every handler call.
- **One handler per file.** File = exported fn = triple. Library fns get their own files too.
- **Hierarchy never skipped:** suite → realm → layer → handler group → handler.
- **Two-word properties.** `userName` not `name`; `customerId` not `id`; `emailAddress` not `email`.
- **Adapters never call adapters directly.** Coordinate via orchestrators.
- **[REUSE_SERVER]** Realms reuse blong-server's subject orchestrator + db adapter — do NOT create a
  realm-local `adapter/db.ts` or a dispatch orchestrator; contribute `orchestrator/subject/init.ts`
  (namespace) + `adapter/db/*.ts` handlers (`queryBuilder`) + `meta/`.
- **Never enable `systemDebug` in production.**
- **Never commit to `dev/`** (gitignored) — committed code lives in `core/`.
- **Always invoke the matching `skill`** before implementing (see `[SKILLS_DELEGATOR]`).
- **Verify after every change** — `get_errors`, tests, lint; never claim "complete" unverified.

## [CORE_PARADIGMS]

- **Handler-runtime pattern.** Handlers = isolated functions; framework adds config, validation, API
  docs, hot reload, mocking, telemetry, caching, dependency analysis without handler awareness.
- **API definition is the source of truth.** Derive from TypeBox schemas co-located with handlers
  (preferred) or an existing OpenAPI spec (`x-blong-method` per op). Determine before implementing.
- **Layers.** Adapters = integration points (translate triple API ↔ external API); orchestrators =
  business-logic coordinators (namespace → K8s service in microservice mode); gateway = public
  JSON-RPC/REST surface.
- **Self-contained components.** Adapter/orchestrator `activation` config co-located in the layer
  file — not the realm `server.ts`.
- **Conflict priority.** handler/runtime pattern → API definition → adapters/orchestrators → DRY →
  RAD → DMMT → KISS.
- **Reusable realms.** `core/blong-core` (resource/party/access graph), `blong-party`,
  `blong-access` (RBAC: users, roles, capabilities, actions, authz).

## [CRITICAL_DEPENDENCY_PATHS]

- `core/blong/` — TS types + small utils; primary `@feasibleone/blong` dependency.
- `core/blong-gogo/` — runtime; never imported directly; run via global `blong` CLI.
- `core/blong-browser/` — browser realm (UI components, model system).
- `core/blong-login/` — JWT auth (`/rpc/login/token/create`).
- `core/blong-test/` — public API testing realm.
- `core/blong-suite/` — full-stack demonstration suite (reference).
- `docs/blong/docs/rationale/` — design rationale docs.
- Canonical shared framework rules: `.github/skills/_shared/conventions.md`.

## [ANCHOR_TOKENS]

Voluntary search markers — add at model discretion where they aid locating implementations; never
enforced.

```typescript
// @framework-archetype: HANDLER
// @framework-skills: blong-handler, blong-validation
```

---

## [RULES] — Authoritative Details

Blong is work in progress — features may be incomplete or contradictory. When in doubt, treat the
API definition as the primary source of truth and apply the conflict priority in `[CORE_PARADIGMS]`.

- **Runtime, not library.** `blong-gogo` is never a production dependency of realm/suite code; it
  ships as a Docker image (prod) or the global `blong` CLI (dev). CLI positional args activate
  configurations (e.g. `blong integration xxx.adapter`); `--key=value` sets config (e.g.
  `--db.connection.password=secret`). Exception: `index.test.ts` files launched via tap reference
  the `load` function in `blong-gogo`.
- **Adapters/orchestrators = functionality wrappers** (older term: "port"). Orchestrators may call
  other orchestrators and adapters; adapters must not call other adapters directly.
- **Singletons allowed.** Adapters/orchestrators may be singletons (DB pool, shared auth state, test
  orchestrator) — they can import/attach handlers or reference other realms via RegEx patterns.
  Nothing in the design enforces singleton usage.
- **File naming.** Use semantic triple or two-word convention; avoid `index.x` where a descriptive
  name fits (ctrl+p discoverability). Classes/React components `CamelCase`; everything else
  `camelCase`.
- **Well-known layers auto-discovered** — server: `error`, `sim`, `adapter`, `orchestrator`,
  `gateway`, `meta`, `server/api`, `server/init`, `server/test`; browser: `backend`, `component`,
  `action(s)`, `test`, `browser/api`, `browser/init`, `browser/test`, `browser/orchestrator`.
  Top-level `test/` is a BROWSER layer (Playwright `*.play.ts`); server tap tests live in
  `server/test/`. Custom folder names need a `layer.server.ts` / `layer.browser.ts`.
- **Create realms from the `blong-kopi` template** — `blong realm <name>` (or
  `blong create realm <name>`, or the auto-trigger under `kopi.realm`), then adjust per
  `blong-realm`. Do not hand-build the folder structure.
- **Lint changed files.** Use vscode error reporting or `node --run ci-lint -- [files...]` per
  affected package. For spell errors prefer proper words / snake-case / camelCase over dictionary
  additions.
- **Search before read.** Prefer `grep_search` / `file_search` over linear `read_file` for targeted
  exploration.
- **Record frictions.** If a task needed unexpected effort or failed, append a short note to
  `.github/memory/friction.md` (also: long investigations, hard decisions, lots of source read).
- **TypeScript is not compiled**, unless strictly necessary. We run on latest Node.js which can
  strip types.

## Architecture Hierarchy

```
Suite             — top-level entry point, glues realms, defines deployment config
  └── Realm       — business domain boundary (e.g. user, payment, marine)
        └── Layer — functional group within a realm (adapter, orchestrator, gateway, …)
              └── Handler Group  — folder of related handlers (AKA realm namespaces)
                    └── Handler  — single function in a single file
```

## [SKILLS_DELEGATOR]

> **Must call the `skill` tool for matching tasks** — check the table before implementing. The skill
> provides domain-specific patterns that prevent mistakes and cut correction cycles. Do not rely on
> general knowledge when a domain-specific skill exists.

**For implementation tasks:**

| Your Task                                  | Call `skill` with                                     |
| ------------------------------------------ | ----------------------------------------------------- |
| Creating a new top-level solution          | **blong-suite**                                       |
| Creating a new business domain             | **blong-realm** (scaffold via **blong-kopi**)         |
| Adding an API endpoint                     | **blong-handler** (JSON-RPC) or **blong-rest** (REST) |
| Connecting to database                     | **blong-adapter** (see SQL adapter patterns)          |
| Calling external API                       | **blong-adapter** (see HTTP adapter patterns)         |
| Implementing business logic                | **blong-orchestrator**                                |
| Organizing code into layers                | **blong-layer**                                       |
| Implementing protocols                     | **blong-codec**                                       |
| Adding input validation                    | **blong-validation**                                  |
| Defining typed errors                      | **blong-error**                                       |
| Writing tests                              | **blong-test**                                        |
| Setting up test entry point (index.ts)     | **blong-test-api**                                    |
| Simulating HTTP/TCP backends locally       | **blong-test-sim**                                    |
| CI integration tests with K8s backends     | **blong-test-int**                                    |
| Testing with mock handlers (server-side)   | **blong-mock-test**                                   |
| Implementing EIP integration patterns      | **blong-eip**                                         |
| Configuring / creating CLI intents         | **blong-intent**                                      |
| Setting up Storybook                       | **storybook-v10-setup**                               |
| Developing with Storybook                  | **storybook-testing-workflow**                        |
| Viewing logs                               | **blong-log**                                         |
| Developing the logging tooling             | **blong-log-dev**                                     |
| Implementing blong-browser components      | **blong-browser**                                     |
| Adding multi-language / i18n support       | **blong-i18n**                                        |
| Using the model for realm CRUD pages       | **blong-model**                                       |
| Developing the model system internals      | **blong-model-dev**                                   |
| Full-stack Playwright testing              | **blong-playwright**                                  |
| Writing or reviewing documentation         | **blong-docs**                                        |
| Parties, RBAC, users, auth, resource graph | **blong-core**                                        |

**For understanding concepts — also call `skill`:**

- Suite structure and test entry points: Call `skill` with **blong-suite**
- Layer architecture and organization: Call `skill` with **blong-layer**
- Protocol implementation details: Call `skill` with **blong-codec**
- Realm deployment patterns: Call `skill` with **blong-realm**
- CLI intents and activation system: Call `skill` with **blong-intent**
- Party/access graph, RBAC, authorization: Call `skill` with **blong-core**

## [KEY_PATTERNS]

**One-line pointers only — invoke the skill for full patterns.**

**Core definitions.**

- **Suite** — top-level unit; groups realms, defines multi-platform entry points (`server.ts`,
  `browser.ts`, `index.ts`), takes deployment decisions. See `blong-suite`.
- **Modular architecture** — realms combined in one suite with maximum isolation.
- **Business logic separation** — business process/workflow (orchestrators) / data integrity (DB
  stored procedures) / integration (adapters).
- **Platforms** — `server` (K8s pods), `browser` (web apps), `desktop`/`mobile` (future).
- **Interaction origins** — application front ends, edge devices (ATM/POS/IoT), third-party systems
  (core banking/payment/APIs), automated processes (scheduled/event-driven).
- **Deployment ("bring your own architecture")** — modular monolith | microservices | hybrid: same
  code, no changes.
- **Philosophy** — RAD, minimal learning curve, fast build/deploy, test-driven, 100% coverage goal.

**Key patterns.**

- **Suite** — entry point gluing realms + deployment config. See `blong-suite`.
- **Service definition** — realms/layers via builder pattern; adapters/orchestrators self-contained
  (`activation` co-located in the layer file, not `server.ts`). See `blong-realm`, `blong-adapter`,
  `blong-orchestrator`.
- **Handler & runtime** — `handler()` factory; semantic triples;
  `runtime.{lib,errors,config,log,handler}` proxy (IoC, hot reload, mocking). See `blong-handler`.
- **Adapter** — integration points; stream (TCP encode/decode) vs API (HTTP/SDK) based. See
  `blong-adapter`.
- **Orchestrator** — business-logic coordinators; dispatch + schedule; saga; namespace → K8s
  service. See `blong-orchestrator`.
- **Gateway** — public JSON-RPC surface (default) + REST; validation + API docs. See `blong-rest`,
  `blong-validation`.
- **Default protocol JSON-RPC 2.0** — external `POST /rpc/{subject}/{object}/{predicate}`; internal
  `POST http://{namespace}/ports/{subject}/request` (errors via `mtid:'error'`, never JSON-RPC
  errors); notifications `/publish`. Handler code is transport-agnostic. See `blong-rest`,
  `blong-codec`.
- **Codec** — protocol impl on transports (OpenAPI, JSON-RPC, MLE, TCP). See `blong-codec`.

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
- **`canSkipSocket` auto-detection:** Set to `true` on the browser platform (default) and also in
  the `integration` intent — no need to add `remote: {canSkipSocket: true}` in realm/suite configs.
- **`resolution: true` in dev:** Enabled by default for the `dev` intent — no need to set it per
  suite.
- **Gateway static keys:** Development-time sign/encrypt JWK keys are generated automatically if no
  keys are configured (env vars `GATEWAY_SIGN_KEY` / `GATEWAY_ENCRYPT_KEY` or explicit config). This
  keeps Playwright sessions stable across server hot-reloads without any per-suite configuration.
- **Gateway defaults in integration:** `debug: true` and `expectedErrors: true` are set by default
  for the `integration` intent — no need to add them in suite/realm configs.

### Well-Known Layer Intents (Auto-discovery Defaults)

The intent listed is the CLI intent that must be active for the layer to load automatically.
`default` means the layer loads regardless of intents. Canonical table:
`.github/skills/_shared/conventions.md` → `[LAYER_DEFAULTS_TABLE]`.

## Development Workflows

### Build Commands

- **Primary build:** `npm run build` (runs heft build --clean via Rush)
- **Rush install:** `node common/scripts/install-run-rush.js install`
- **Rush rebuild:** `node common/scripts/install-run-rush.js rebuild`

### Testing

- **Unit tests:** Use `tap` framework (see package.json devDependencies)
- **API tests:** `index.ts` is either a simple re-export of `server.ts` (declarative, detected by
  kind) or a callback function that loads both server and browser platforms and runs tests from the
  browser side (fastest, simulates most common interaction)
- **Internal API tests:** Defined in `internal.test.ts` — loads only server, uses `tap` for coverage
- **HTTP testing:** Use `.http` files for manual/scripted API testing
- **Wiring test groups (`integration.watch.test`):** every test group a realm runs must be listed in
  the `integration.watch.test` config of the platform that owns it. Server-side groups go in
  `index.ts` / `server.ts`; browser-side groups (`browser/test/test/*.ts`) go in the **browser**
  suite's config too (the tap runner loads a dedicated `browser-test.ts` alongside `index.ts` and
  calls each platform's `test()`). A group missing from the browser suite silently never executes
  and coverage reports "incomplete". See the **blong-test-api** skill for the full pattern.

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
- Use `.ts` extensions in local imports
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

### Authorization

- **blong-access** - RBAC
- **blong-gateway** - API gateway (optional)

### Error Handling

Typed domain errors via `IErrorFactory` (error object shape, definition, throwing, expected errors
in tests) — see **blong-error**.

### Runtime Introspection (Debug Mode)

`systemDebug: {enabled: true}` (default in `dev`) exposes `/api/sys/*` introspection endpoints:
`/api/sys/config` (merged config snapshot), `/api/sys/ports`, `/api/sys/methods`,
`/api/sys/modules`, `/api/sys/rpc`. **Never enable in production** (see `[CRITICAL_GUARDRAILS]`).
They are enabled in `dev` and are unlikely to need config changes. For deeper understanding or
extending, see the source: `core/blong-gogo/src/SystemDebug.ts`.

## Common Tasks

- **Implementation guides** → invoke the skill from `[SKILLS_DELEGATOR]` above (task → skill table).
- **Manual testing** → use `.http` files.
- **Expected errors in tests** → enabled by default in `dev`, set `$meta.expect` in test calls — see
  [expected errors concept](../docs/blong/docs/concepts/expected-errors.md).

## Local Development Environment

### Storybook (blong-browser / blong-marine / blong-suite)

When working on `core/blong-browser/`, `core/blong-suite/` or any realm, Storybook may already be
running on `http://localhost:6006`. A shared browser tab pointing to it may also be available in the
session.

**Check if Storybook is running and which package it belongs to:**

```bash
PID=$(ss -tlnp | grep ':6006' | grep -oP 'pid=\K[0-9]+'); [ -n "$PID" ] && readlink /proc/$PID/cwd || echo "Storybook not running"
```

This prints the working directory of the Storybook process (e.g. `.../core/blong-marine`,
`.../core/blong-suite`, or `.../core/blong-browser`), making it clear which package's Storybook is
running. If the port is listening, open or reuse the shared browser tab at `http://localhost:6006`
to validate UI changes interactively after each edit.

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
| 6379  | Redis                 |

**Check if backends are running:**

```bash
ss -tlnp | grep -E ':8180|:9092|:27017|:3306|:9000|:8200|:6379'
```

Any port not listed in the output means that service is not yet started.

### dev tooling (blong-dev proxy / trace / log / sql)

The `blong-dev` CLI ships two helpers for talking to a running gateway without re-implementing the
MLE codec:

- **`blong-dev proxy`** — curl-friendly HTTP proxy in front of a gateway's MLE-encrypted RPC
  endpoint. Start it in the realm/suite that owns the gateway, then curl plain JSON:

    ```bash
    # Pre-authenticated (logs in on startup):
    blong-dev proxy --port 8099 --target http://localhost:8080 \
        --username testAdmin --password testPassword

    # Manual login (login happens through the proxy):
    blong-dev proxy --port 8099 --target http://localhost:8080 --no-login
    curl -s -X POST http://localhost:8099/login/token/create \
         -H 'content-type: application/json' -d '{}'   # captures the session
    curl -s -X POST http://localhost:8099/gateway/bundle/find \
         -H 'content-type: application/json' -d '{"params":{"paging":{}}}'
    ```

    Credentials fall back to `MLE_USERNAME` / `MLE_PASSWORD` env vars. Implemented in
    `core/blong-dev/src/commands/proxy.ts` on top of `@feasibleone/blong-mle`
    (`core/blong-mle/src/client.ts`).

- **`blong-dev trace`** — inspect a `trace.zip` bundle (client actions, failed requests, console
  output). Implemented in `core/blong-dev/src/commands/trace.ts`.

- **`blong-dev log`** — fetch log entries that the `pino-cacache` transport stored on disk. Pass a
  ULID to fetch one entry. Implemented in `core/blong-dev/src/commands/log.ts` on top of `cacache`.
  See the **blong-log** skill for full usage.

- **`blong-dev sql`** — run SQL queries against the local dev database (use this instead of a MySQL
  CLI locally or `kubectl exec` into a pod). Reuses `.blong_devrc` (default key `srv.db`); derives
  the dev database name (`${suite}-${user}`, e.g. `blong-access-kalin`) when none is configured.
  `--output json` is the agent-friendly default for non-TTY. Implemented in
  `core/blong-dev/src/commands/sql.ts`. Example: `blong-dev sql "SELECT * FROM access_role"`.

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
