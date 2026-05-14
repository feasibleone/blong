# Intents — CLI Activation System

## Problem

A Blong process needs to play many different roles depending on context:

- **Development server** — hot-reload on every file save, verbose logging,
  relaxed configuration.
- **Integration-test runner** — watch source files, rerun tests on change,
  include the test and sim layers.
- **Microservice** — activate the layers required to route traffic between
  realms as separate Kubernetes services.
- **Database seeder** — run a one-shot migration or seed script and exit.
- **Debug session** — expose introspection endpoints and include stack traces
  in error responses.

Early versions addressed this by passing environment names as positional CLI
arguments, sometimes called "activations". The terminology was vague — it was
unclear whether an activation was an environment, a feature flag, a deployment
mode, or something else entirely. This ambiguity made it hard for developers
and coding agents to reason about what a given process was doing, and made
documentation inconsistent.

A second problem was that the CLI argument parser (`minimist`) placed all
positional arguments into `_` without distinguishing between a file path and a
configuration signal. This caused the first positional argument — which is
optionally a file to load — to be incorrectly forwarded as a configuration name
when it was in fact a path.

Finally, there was no standardised vocabulary for describing the behaviour a
specific signal implied at the process level (e.g. "will this exit?", "will
this restart on file changes?").

## Solution

The concept of **intents** replaces "activations" with a clearer model:

- The positional CLI arguments to `blong` are split into an optional **target**
  (the first argument, only when `existsSync` confirms it is a real file or
  folder) and zero or more **intents** (all remaining positional arguments).
- Each intent is a named signal that activates specific configuration blocks,
  layers, and framework features for the lifetime of the process.
- The `default` configuration block is always merged first; each active intent
  contributes its own block on top, in the order they appear on the command line.
- When no intents are provided, the framework defaults to
  `dev + microservice + integration` — a set designed to give an immediate,
  full-featured development experience without any flags.

### Well-Known Intents and Their Process Behaviour

| Intent | Primary effect | Process lifetime |
| -------------- | ----------------------------------------------- | ---------------------------------- |
| `dev` | Verbose logging, relaxed config, hot-reload | Long-running; restarts on file change |
| `prod` | Production endpoints, strict config | Long-running |
| `integration` | Enables test layer and watch/test mode | Long-running; reruns tests on change; exits on CI |
| `microservice` | Activates layers needed for standalone realm deployment | Long-running |
| `db` | Database creation / seeding | **Short-lived** — exits after completion |
| `debug` | Exposes `/api/sys/*`, includes stack traces | No effect on lifetime |
| `server` *(implicit)* | Always present on the server platform | — |
| `browser` *(implicit)* | Always present on the browser platform | — |

### The `microservice` Intent

The `microservice` intent's primary role is to activate the layers required to
run a realm as a self-contained microservice. In practice, the `activation`
block for `microservice` in realms typically contains only
layer-activation flags. For example:

```typescript
// server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    config: {
        microservice: {
            adapter: true,
            orchestrator: true,
        },
    },
}));
```

### The Default Intent Set

Running `blong` with no arguments activates `dev`, `microservice`, and
`integration` simultaneously. This combination is deliberate:

- `dev` applies developer-friendly overrides (verbose logs, relaxed timeouts).
- `microservice` wires up the layers needed for the full inter-realm routing
  stack, so the development server behaves exactly like a deployed microservice.
- `integration` enables the watch/test subsystem, so integration tests rerun
  automatically whenever a source file changes.

The result is a **fast feedback loop**: save a handler file, see the change
hot-reloaded, and get test results within seconds — all without restarting the
process or running a separate command. This directly fulfils the framework's
"Minimising development effort" goal by collapsing the
write → reload → test cycle into a single `blong` invocation.

### CLI Parsing Fix

`bin/blong.ts` (and `bin/blong-dev.ts`) now correctly separate the optional
target from the intent list:

```typescript
const [maybeTarget, ...rest] = argv._;
const target = maybeTarget && existsSync(resolve(maybeTarget)) ? maybeTarget : undefined;
const intents = target ? rest : argv._;
```

When no intents are present (plain `blong`), `runServer.ts` falls back to
`DEFAULT_INTENTS = ['microservice', 'integration', 'dev']`.

### Exclusion Groups

Intents that are semantically incompatible can be declared as exclusion groups
in `server.ts`:

```typescript
intentsExclusionGroups: [
    ['dev', 'prod'],         // environment intents — must not combine
    ['integration', 'prod'], // test vs production
]
```

The pair `['dev', 'prod']` is recognised by convention even without an explicit
declaration.

### Platform Intents

`server` and `browser` are added automatically by the framework — they are
never passed on the CLI. They allow layer activation maps to vary configuration
per platform without requiring separate files.

## See Also

- [Intents concept](../concepts/intents.md) — concise reference for day-to-day use
- **blong-intent** agent skill — step-by-step guide for creating a new intent

