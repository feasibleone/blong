# Prior Art

## Problem

No single existing paradigm delivers the combination of properties Blong
requires: type-safe modular architecture, fast test feedback, transparent
deployment flexibility (monolith ↔ microservices), and minimal developer
overhead. Building on a single technology stack (e.g., pure REST or pure
GraphQL) forces trade-offs that compound over time. Blong therefore selectively
adopts the strongest ideas from each paradigm and combines them into a coherent
whole, while explicitly rejecting the parts that introduce accidental complexity.

## Solution

Blong blends the good parts of well-known paradigms:

- [API-first approach](https://www.google.com/search?q=API-first+approach)
- [Application server](https://en.wikipedia.org/wiki/Application_server)
- [Composition over inheritance](https://en.wikipedia.org/wiki/Composition_over_inheritance)
- [Convention over configuration](https://en.wikipedia.org/wiki/Convention_over_configuration)
- [Declarative programming](https://en.wikipedia.org/wiki/Declarative_programming)
- [Dependency injection](https://en.wikipedia.org/wiki/Dependency_injection)
- [Domain driven design](https://en.wikipedia.org/wiki/Domain-driven_design)
- [Fast feedback loop](https://www.google.com/search?q=fast+feedback+loop)
- [Indirection](https://en.wikipedia.org/wiki/Indirection)
- [Inversion of control](https://en.wikipedia.org/wiki/Inversion_of_control)
- [Modular programming](https://en.wikipedia.org/wiki/Modular_programming)
- [Observability](https://en.wikipedia.org/wiki/Observability_(software))
- [Remote procedure call](https://en.wikipedia.org/wiki/Remote_procedure_call)
- [Scripting language](https://en.wikipedia.org/wiki/Scripting_language)
- [Service oriented architecture](https://en.wikipedia.org/wiki/Service-oriented_architecture)
- [Test driven development](https://en.wikipedia.org/wiki/Test-driven_development)

Blong has similarities with approaches also described elsewhere:

- [Uber: Introducing Domain-Oriented Microservice Architecture](https://www.uber.com/blog/microservice-architecture/)
- [Redhat: Distributed transaction patterns](https://developers.redhat.com/articles/2021/09/21/distributed-transaction-patterns-microservices-compared)
- [Voxer Engineering: Backpressure and Unbounded Concurrency in Node.js](https://engineering.voxer.com/2013/09/16/backpressure-in-nodejs/)
- [Microsoft: Data-tier applications (DAC)](https://learn.microsoft.com/en-us/sql/relational-databases/data-tier-applications/data-tier-applications)

## Design: How Paradigms Map to Framework Features

The table below maps each paradigm cluster to a concrete framework feature,
making the adoption decisions explicit rather than aspirational.

| Paradigm Cluster | Adopted As | Example in Codebase |
|---|---|---|
| Domain-Driven Design | Realms as bounded contexts | `core/handler-test-poc/order/` — the `order` realm owns all order logic |
| Convention over configuration | Semantic triple naming + layer folders | `orderOrderCreate.ts` in `orchestrator/order/`; no registration step needed |
| Dependency injection + Inversion of control | Handler factory function receives `{handler, lib, errors, config}` | `handler(({handler: {orderOrderCreate}}) => ...)` — dependencies injected by the framework |
| Composition over inheritance | Handlers compose other handlers via the proxy | `orderFlowExecute` calls `orderOrderCreate` + `orderOrderConfirm` |
| RPC | JSON-RPC 2.0 as the external API protocol | `POST /rpc/order/order/create` maps to `orderOrderCreate` |
| TDD + fast feedback loop | Hot-reload + automatic test rerun on file save | `Watch.ts` triggers test re-run within the same process on handler change |
| Observability | `$meta.checkpoint?.(name, data)` + real-time log | `core/blong-log` — UDP transport → WS viewer |
| Modular programming + SOA | Suites compose realms; realms deploy independently | `config: {microservice: {adapter: true, orchestrator: true}}` |
| Scripting language | Minimal boilerplate; one file per handler | ~20-line handler files with no class boilerplate |

### What Blong Deliberately Avoids

Not every paradigm was adopted. The following were considered and rejected:

- **Class-based inheritance for handlers** — inheritance hierarchies
  obscure dependencies and make hot-reload harder. Composition via the
  handler factory is used instead.
- **GraphQL as the primary API protocol** — schema stitching and resolver
  complexity outweigh the benefits for internal microservice communication.
  JSON-RPC 2.0 is simpler and maps directly to semantic triple naming.
- **Event sourcing as default persistence** — valuable for specific domains
  but too expensive as a default pattern. Adapters abstract persistence
  without mandating event sourcing.
- **Decorator-based metadata (e.g., NestJS `@Controller`)** — decorators
  couple metadata to implementation. Blong uses file-system conventions and
  activation config instead.

## Future Ideas

1. **Adopted vs. rejected decision matrix** — for each paradigm in the list
   above, add a one-line "adopted because / rejected because" entry to make
   the rationale explicit for new contributors, not just the reference link.

2. **Framework comparison table** — add a concise comparison with tRPC,
   NestJS, and Fastify that maps each framework's approach to the paradigm
   clusters above, making Blong's trade-offs visible to developers choosing
   between frameworks.

3. **Living paradigm map** — generate the paradigm-to-feature table
   automatically from code annotations (e.g., `@paradigm('DDD')` JSDoc tag
   on handler factories) so the map stays accurate as the framework evolves.
