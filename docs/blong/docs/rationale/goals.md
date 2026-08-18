# Goals

## Problem

Enterprise API development is expensive. Teams repeatedly solve the same
problems — wiring HTTP layers, writing integration boilerplate, deciding folder
structures, handling configuration across environments, connecting to databases
and external services — before they write a single line of business logic. Each
project starts from scratch, accumulates its own conventions, and becomes harder
to onboard new developers. Test coverage is incomplete because writing tests is
harder than writing features. Deployments require choosing between monolith
simplicity and microservice scalability, and that choice is often hard to reverse.

## Solution

Blong is a TypeScript API framework designed to remove the recurring costs of
enterprise application development. Its primary goal is to decrease the cost of
developing and running solutions by:

- **Minimizing development effort** — test-driven development with fast reload
  and minimal restarts. Handlers are hot-reloaded on change; tests rerun
  automatically without restarting the process.
- **Reducing the learning curve** — a minimal API surface with well-defined
  conventions. Developers learn one pattern (the handler) and apply it
  consistently for adapters, orchestrators, gateways, and tests.
- **Faster build and deploy cycles** — the framework behaves more like a runtime
  than a library. It is available as a base image or a single dependency, not a
  scaffolding tool that generates files.
- **100% test coverage as a default** — test handlers are first-class citizens,
  co-located with business logic, and reuse the same execution model.

## Approach

To achieve the primary goal, the framework assumes the following architectural
approach:

### Modular Architecture

Common tasks are implemented once in a well-defined place and reused across
realms. A realm is an isolated business domain with its own handlers, adapters,
and orchestrators. Realms compose into suites that define multi-platform entry
points.

```
core/handler-test-poc/order/
├── orchestrator/order/    ← business logic
│   ├── orderOrderCreate.ts
│   └── orderFlowExecute.ts
├── adapter/               ← integration
└── server/test/         ← server test handlers, same pattern
    └── testOrderCheckpoint.ts
```

### Deployment Flexibility

The same codebase runs as a modular monolith during development or as
independent microservices in production. The deployment architecture is
a configuration choice, not a code change:

```typescript
// server.ts — microservice environment activates each layer as a separate pod
config: {
    default:      {},
    microservice: {adapter: true, orchestrator: true, gateway: true},
    dev:          {},
}
```

### Predictable, Type-Safe Code

Developers write less code, and what they write is predictable and reviewable:

- **Structure**: handlers live in well-defined layer folders
- **Naming conventions**: semantic triples (`subjectObjectPredicate`) make
  intent discoverable — `orderOrderCreate`, `paymentTransferExecute`
- **Type checking**: TypeScript + TypeBox provide compile-time and runtime safety
- **Integrations**: adapters abstract protocols so business logic never
  couples to HTTP, TCP, or SQL specifics
- **Deployment**: cloud-native friendly — see [cncf.io](https://cncf.io)

### Multiple Runtimes

The primary runtimes are Node.js (server) and the web browser. The same handler
code that runs server-side can be exercised from browser-side tests, simulating
the most realistic interaction pattern at the lowest cost.

## Non-goals

The framework only solves tasks that repeat often and solves them as much as
possible within the framework. It does not aim to:

- Solve every complex business problem for you
- Make complex problems easier
- Be the easiest solution for every problem
- Be the fastest way to achieve a POC for every problem

Instead, in the hands of knowledgeable developers, it makes all of the above
feasible to achieve and maintain in the long run.

## Future Ideas

1. **Measurable acceptance criteria per goal** — define CI-visible thresholds
   (e.g., handler hot-reload latency < 200 ms, test cycle < 30 s) so that each
   goal is continuously validated and regressions are caught automatically.

2. **Developer experience score** — derive a "time to first green test" metric
   from framework telemetry and track it across releases, making the
   learning-curve goal measurable rather than aspirational.

3. **Automated complexity budget** — flag handlers that exceed a line count or
   cyclomatic complexity threshold in CI to enforce the minimal-API-surface goal
   at the code level, not just the documentation level.
