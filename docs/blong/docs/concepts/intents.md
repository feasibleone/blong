# Intents

**Intents** are named signals passed as positional CLI arguments to the `blong`
command. They tell the framework which configuration blocks, layers, and features
to activate for the current process run.

```bash
blong                    # default intents: dev + microservice + integration
blong integration        # only the integration intent
blong ./server.ts db     # load a specific file with the db intent
```

The framework always merges the `default` configuration block first; every
active intent then contributes its own block on top. A single code base can
therefore behave as a development server, an integration-test runner, a
microservice, or a database seeder — purely by changing the intents on the
command line.

## Well-Known Intents

| Intent | Primary effect | Process lifetime |
| -------------- | ------------------------------------------ | ---------------------------------- |
| `dev` | Verbose logging, relaxed config | Long-running; restarts on file change |
| `prod` | Production endpoints, strict config | Long-running |
| `integration` | Enables test layer and watch/test mode | Long-running; reruns tests on change |
| `microservice` | Activates the layers needed to run a realm as a standalone microservice | Long-running |
| `db` | Database creation / seeding | **Short-lived** — exits when done |
| `debug` | Exposes `/api/sys/*` introspection endpoints and stack traces in errors | No effect on lifetime |

## Default Intents

When no intents are specified, the framework uses
`dev + microservice + integration`. This default set is designed to give
developers an immediate, full-featured feedback loop: file changes are hot-reloaded
and integration tests rerun automatically, fulfilling the framework's goal of
minimising development effort.

## Layer Names as Intents

Well-known layer folder names (`adapter`, `orchestrator`, `gateway`, `sim`,
`test`, …) double as intent names in `layer.server.ts` / `layer.browser.ts`
files. Specifying `integration: true` in a layer activation file means
"load this layer when the `integration` intent is present". See [Layer](./layer.md)
for the auto-discovery defaults.

## Platform Intents

The `server` and `browser` intents are injected automatically by the framework
and are never passed on the command line. They allow layer activation files to
vary configuration per platform.

## Exclusion Groups

Some intents are mutually exclusive (e.g. `dev` and `prod`). Realms can
declare exclusion groups in `server.ts` so the framework warns when incompatible
intents are combined. The pair `['dev', 'prod']` is recognised by convention
without an explicit declaration.

For a detailed design rationale, see the
[Intents rationale](../rationale/intents.md).
