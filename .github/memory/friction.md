# Frictions

This document is a list of frictions that have been identified during the work on the project.
Update it when something requires unexpected effort to implement or fix.

## List of unresolved frictions

- blong-access is not highlighted in the instructions and agents need to discover through patterns. Make sure
  the blong-realm skill knows about RBAC and how to reuse it, i.e. accessAuthorizationMerge, the model
  on top of core.triple, etc.

## List of resolved frictions

- Deterministic single-statement `knex('table')` deadlock for the integration test

The `exec` CRUD path (`knex('table')` builders) is the most common adapter path and deadlocks in production on
"big delete+inserts", but its deadlock handling could not be covered by an integration test: plain concurrent
single-statement updates/inserts (opposite `ORDER BY`, FK escalation, `ON DUPLICATE KEY` upsert, gap locking —
the common "MySQL deadlock" recipes) only deadlock as rare timing races (0–7% across 15 runs each) because a
single autocommit statement is too fast for the opposite-lock-order window to overlap.

**Resolution:** a deterministic builder-path deadlock = `SELECT … FOR UPDATE` + a `SELECT SLEEP(1)` projection
(holds the first row lock for ~1s, widening the race window) + opposite `.orderBy('id','asc'/'desc')` (opposite
lock order). As a `knex('table')` builder this is 100% reproducible (5/5, verified against live MySQL) and fires
the wrapped builder's `.then` rejection → `onDeadlock`. Implemented as `sqlDeadlockBuilder` adapter handler +
`deadlockThroughBuilder` integration step. Note: the `SLEEP(1)` projection uses `knex.raw('SLEEP(1)')` inside an
otherwise pure table-builder query — the query itself is a builder (exec path), not `knex.transaction()` or a
standalone `knex.raw()` query.

- framework handler scan treats `.test.ts` files as handlers (breaks blong CLI load)

Adding a colocated `knex-deadlock.test.ts` inside `core/blong-gogo/src/adapter/server/` broke
`graceful-shutdown.spawn.test.ts`: booting the `blong` CLI in `blong-hello` (which synthesizes a server and runs
`platform.test()`) loaded the `.test.ts` file as a handler and threw
`TypeError: Cannot read properties of undefined (reading 'name')` in `Watch._validateAndSetHandlerName`
(`Watch.load` isFile path). Root cause: the handler file scan excluded `.play.*`/`layer.*` files but had no
`.test.*` exclusion, so any `.test.ts` file inside a scanned handler folder was imported as a handler.

**Resolution:** added an `isTest` helper (`/\.test\.[mc]?[tj]sx?$/i`) in `core/blong-gogo/src/Watch.ts` and
excluded it from both the `_loadHandlers` directory scan and the `Watch.load` isFile check (consistent with the
existing `isPlay`/`isLayerActivation` exclusions). Verified: `graceful-shutdown.spawn.test.ts` passes with the
test file colocated, `blong-gogo` suite green (178 pass), lint clean.

- pino multi-target transport breaks under tap (SyntaxError: Unexpected identifier 'PinoPretty')

`blong-gateway`/`blong-int-sql` tests under `tap`/`blong-dev test` failed at platform startup:
`SyntaxError: Unexpected identifier 'PinoPretty'`. Root cause: with the `dev` intent the log config uses a pino
**multi-target** transport (`{targets: [pretty, cacache]}` in `core/blong-gogo/src/Log.ts`). pino loads
multi-target `.ts`/`.cts` targets via CJS `realRequire()` (`pino/lib/transport-stream.js`), which needs a working
ts-node/pirates hook; under tap that path breaks on `import type` (single-target transports use thread-stream +
`realImport()`/ESM and are fine). Filtering tap's `--import` hooks out of worker execArgv alone is insufficient.

**Resolution:** point both transport targets at tiny `.mjs` shims (`pino-pretty.mjs`, `pino-cacache.mjs`) that
re-export the `.ts` modules. pino then loads them via ESM `import()`, and Node's native type stripping handles the
re-exported `.ts` — works under both tap and normal dev. Verified: `blong-gateway` meter flow 11/11, `blong-int-sql`
2/2 (previously required `env -i` workaround), `blong-gogo` suite 171 pass, full-package lint clean. Debugging note:
workers do not inherit `require.extensions` or `module.register` loaders; thread-stream uses `realImport`,
`transport-stream.js` uses `realRequire` for `.ts` — the split is what matters.

- No established pattern for dev-only gateway validations + orchestrator namespaces

Making the demo metered APIs (`vision.compute`, `customer.get`) exist only in `dev` requires gating the **gateway
validation**, the **orchestrator namespace**, AND the handler. Only the handler part had a mechanism:
`adapter/dbTest/` works ONLY because the shared `db` adapter (`blong-server/adapter/db.ts`) has
`imports: [/\.db$/, /\.dbTest$/...]` under `dev` — adapter-level import regex, not a general gating mechanism.
Placing the validation in `gateway/test/` does NOT make it dev-only: `test` there is a **handler-group folder
inside the `gateway` layer**, not a layer.

**Resolution:** implemented a general `.dev`-suffixed handler-group convention — a folder like `gateway/vision.dev/`
(or `orchestrator/vision.dev/`) loads only under the `dev` intent (`core/blong-gogo/src/load.ts` layer scan). The
suffix is a loading gate only; gateway validations (function-keyed) and orchestrator namespaces (explicit in
`init.ts`) keep their names. Applied to `core/blong-gateway` (`gateway/{vision,customer}.dev/`,
`orchestrator/{vision,customer}.dev/`) and the demo hint moved to `core/test/demo/gateway/test.dev/`. Verified by
loading a fixture with/without `dev`. Docs updated: `docs/blong/docs/concepts/layer.md`, `blong-layer`/`blong-intent`
skills. The docs-vs-code "always active" discrepancy was reconciled empirically: the layers are always active and
`{integration: true}` in `WELL_KNOWN_LAYERS` is a vestigial truthy marker.

- core.resource under-represented in the blong-model skill

The core.resource architecture was not well highlighted, resulting in complicated code. Added a concise
"How the model system relates to `core.resource`" section to `.github/skills/blong-model/SKILL.md` (resource-backed
table = `type.uuid()` PK → `core_resource`; consequences: auto-bound dropdowns, auto `core_resource` row on `add`,
`merge` with `resourceType`+`name`, base64 binary PKs) and fixed the misleading `{subject}.dropdown.list` claim
(resource-backed tables are auto-bound by the knex adapter).

- MySQL queries from blong-dev CLI

Added `blong-dev sql "SELECT ..."` (`core/blong-dev/src/commands/sql.ts`): reuses `.blong_devrc` (default key
`srv.db.knex.connection`, override `--config`), CLI overrides `--host/--port/--user/--password/--database`, JSON
output for agents (non-TTY) and a colorized aligned table for humans (TTY). Human-readable rendering via a pure,
browser-safe table helper (`core/blong-dev/src/utils/table.ts`) modelled on `ut-function/console-table`. Tests:
`sql.test.ts` + `table.test.ts` (37 assertions). Template expressions (e.g. `${suite}`) in `.blong_devrc` are not
rendered — pass values via CLI flags.

- progress reporting for long async operations

Added a generic `withProgress` helper (`core/blong-gogo/src/progress.ts`): wraps a promise, polls a `getProgress`
callback every `intervalMs` once past `thresholdMs`, logs progress + a completion line. Wired into the knex adapter
start-up ops (`schema table sync`, `schema constraint sync`, `schema procedure sync`, `seed data`) in
`knex.ts ready()`. Tests: `progress.test.ts`.

- knex deadlock logging in dev mode

Added deadlock detection to the knex wrapper (`wrapKnex`/`wrapJsonBuilder` in
`core/blong-gogo/src/adapter/schema/knex/json.ts`): when a query rejects with errno 1213 / `ER_LOCK_DEADLOCK` and
dev mode (`config.debug` or `logLevel === 'debug'`), `logKnexDeadlock` logs the error incl. `err.sql`/`sqlMessage`
then rethrows (`core/blong-gogo/src/adapter/server/knex.ts`). Unit tests in `json.test.ts`; integration test
`core/blong-int-sql/mysql/test/test/testMysqlDeadlock.ts` (raw `mysql2` connections, opposite-lock-order deadlock,
runs in CI where MySQL is provisioned).

- orphaned connections / graceful shutdown

Added `gracefulShutdown`/`createShutdownHandler` (`core/blong-gogo/src/runServer.ts`): SIGTERM/SIGINT handlers run
`platform.stop()` (which closes gateway/rpc/watchers and every adapter, incl. knex pool destroy) before exiting;
second signal forces exit; bounded wait prevents hangs. Wired into `runPlatform` and the two-platform branch.
Manual `process.on` handlers (no `async-exit-hook` dependency), approach mirrored from that package. Automated test
uses the Linux `timeout` command: `core/blong-gogo/src/graceful-shutdown.spawn.test.ts` spawns the real CLI against
`blong-hello` under `timeout --preserve-status -s TERM` and asserts exit 0 + the shutdown marker; unit tests in
`graceful-shutdown.test.ts`.
