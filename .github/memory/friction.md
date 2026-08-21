# Frictions

This document is a list of frictions that have been identified during the work on the project.
Update it when something requires unexpected effort to implement or fix.

## List of unresolved frictions

_None currently._

## List of resolved frictions

Resolved by the "access UI models + knex CRUD" session analysis (2026-08-21) — frictions that cost
the most time in the "blong-access lacks the models for the UI" session.

- **Realm function/async children silently skipped without a config entry.** A child declared as a
  function/async import
  (`async function core() { return import('@feasibleone/blong-core/server.ts') }`) is NOT loaded
  unless the realm config has a matching block for the child's name (`mergedConfig[itemName]`).
  Symptom: `objectSchema` keys lacked the child (`['mysql']` only) and core tables never synced.
  Fix: add `core: {}` (or per-intent blocks) to the realm `config`. ~28 min in the blong-int-adapter
  mysql round; root-caused by reading `core/blong-gogo/src/load.ts`.
- **Generic knex `add` returns empty rows for explicit binary PKs.** The `add` case falls back to
  `inserted[0]` (auto-increment insertId = 0 for non-auto-increment PKs), so an explicitly supplied
  `ulid`/`uuid` PK returned an empty row. Fix: prefer `insertCols[keyName]` (explicit PK) before
  `inserted[0]`.
- **Model pages never populate pivot-table dropdowns (TableWidget gap).** Pivot `dropdowns` prop was
  never populated on `meta/model` pages → "No available options"; join-only pivots had no assignment
  mechanism. Fix: TableWidget self-loads pivot dropdowns via `dropdownRegistry`/`portalDropdownList`
  (mirroring DropdownWidget). ~26 min / 14 attempts in req6.
- **Playwright screenshot-verification loop.** `view_image`/`screenshot_page` couldn't render
  pixels, and a static `http.server` hit port conflicts. Working path: boot the dev server manually
  with `PLAYWRIGHT_BACKEND_PORT=9083` so the Vite proxy (default 8080) routes to the real backend
  (fixes 502 / MLE-key errors), then verify via the live DOM.
- **`ITabLayoutConfig.type` only accepts `'steps'`.** Tabs are inferred by OMITTING `type`; passing
  `type: 'tabs'` fails lint (`'"tabs"' not assignable to '"steps"'`).

Resolved by the "blong-int-adapter resource/edge integration tests" round (2026-08) — get-case edge
attachment silently skipped in the generic knex `exec`.

- **`prepareResultRow` mutates the row in place — masking binary PKs.** In the exec `get` case,
  `masterKey = row?.[keyName]` was read AFTER `prepareResultRow(row, binaryCols, table)` which
  converts Buffer → base64 **in place** (documented behaviour), so `Buffer.isBuffer(masterKey)` was
  `false` and the declared graph-edge attachment block was silently skipped. It took several debug
  runs to spot because the raw row (pre-mutation) IS a Buffer and direct knex repros return Buffers
  — only the mutation ordering differed. Fix: capture `masterKey` from the raw `row` BEFORE
  `prepareResultRow`. Lesson: never read the PK off a row after passing it to a mutating "prepare"
  helper; grab the key first or have the helper return a copy. Debug technique that worked: printing
  `JSON.stringify(row, (k,v) => Buffer.isBuffer(v) ? 'BUFFER:'+v.length : v)` right after
  `query.first()` vs. after `prepareResultRow` to see the mutation.

Resolved by the "blong-int-sql CI test timeout" debug (2026-08-19) — the deadlock test helpers left
20s `setTimeout` handles behind, holding the process open ~19s after `platform.stop()` (over tap's
30s per-file limit in CI).

- **Post-stop process hang in `blong-int-sql` tests.** The three deadlock helpers
  (`mysql/adapter/sql/sqlDeadlock{Builder,Trigger,ProcTrigger}.ts`) each wrapped their work in a
  duplicated `withDeadlockTimeout` that raced a 20s `setTimeout` via `Promise.race` but never
  cleared the timer when the operation settled. Three ref'd 20s timers therefore survived
  `platform.stop()`, so the test process only exited ~19s later (locally ~24s total, over tap's 30s
  per-file timeout in CI → `timeout!`). Extracted a single shared `withDeadlockTimeout.ts`
  (`export const`, no default — the loader ignores non-default-export files) that clears the timer
  in `.finally`; `ci-test` now completes in ~8s. Debug technique that worked:
  `process.getActiveResourcesInfo()` to spot the leaked `Timeout` after an unref'd stdio
  red-herring, then a timer registry capturing creation stacks to identify the source.

Resolved by the "fix unresolved frictions" plan (2026-08-19) — `--help` no longer crashes on `blong`
/ `blong-watch` / `blong-dev`; `blong-dev sql` derives the dev DB name; the knex adapter
auto-creates missing dev databases.

- **`blong --help` crashed.** The `blong` / `blong-watch` CLIs now short-circuit `--help`/`-h` and
  print usage + exit 0 before realm-create / `autoRun` (shared helper
  `core/blong-gogo/src/cliHelp.ts`), so help works from any directory. The sibling `blong-dev` CLI
  also prints usage + exit 0 on `--help`/`-h`/`help` (`core/blong-dev/src/usage.ts`); its usage list
  was previously only shown via the unknown-command branch that exited 1.
- **Agent not noticing `blong-dev sql`.** `blong-dev sql` now derives the dev DB name
  (`${suite}-${user}`, e.g. `blong-access-kalin`) when none is configured (`.blong_devrc` `suite`
  key → cwd `package.json` name → `--suite`; user from os user) and renders `${suite}`/`${user}`
  templates. It is now documented as the intended way to query the DB in the `blong-schema` /
  `blong-adapter` skills and `copilot-instructions.md` ("use instead of MySQL CLI / kubectl exec").
- **Dev DB naming pattern unknown + no auto-create.** The knex adapter auto-creates a missing
  database in `start()` when `knex.createDatabase: true` (default in the `dev` intent via the shared
  `srv.db` adapter; opt out with `srv.db.dev.knex.createDatabase: false`). The dev naming pattern is
  documented in `blong-schema` and derived automatically by `blong-dev sql`, so agents no longer
  iterate to find the name. `ensureDatabase` (`core/blong-gogo/src/adapter/schema/knex/database.ts`)
  is covered by unit tests with an injected connection.

Resolved by the "improve blong-kopi + realm-creation skills" plan (2026-08-18) — Areas 1 & 2
implemented, plus the follow-up consolidation (shared RBAC handler reuse + single-source
scaffolder).

- **blong-access / RBAC reuse not highlighted.** The blong-core skill now documents the RBAC merge
  seed pattern (`accessAuthorizationMerge` reusing `core.triple.merge`, non-dotted capability names)
  and blong-realm points at it. Follow-up (2026-08-18): the template now REUSES the shared handler
  in code, not just in docs — it ships `meta/dbTest/accessAuthorizationMerge.yaml` (fixed filename,
  deliberately NO `$subject` placeholder, because the seed method derives from the filename →
  `access.authorization.merge` → blong-access's shared `accessAuthorizationMerge` handler attached
  to the `db` adapter). The earlier `adapter/db/$subjectAuthorizationMerge.ts` duplicate handler was
  deleted; only the seed CONTENT carries `$subject` placeholders. Non-dotted capability names stay
  the default.
- **browser/orchestrator/subject/init.ts — do not replace `subject` with the realm name.** Stated as
  a guardrail in blong-realm / blong-layer / conventions and in the template file comments; the
  scaffolded folder name `subject` stays literal (only the `namespace` value is the realm name).
- **agent fails to make models public and writes manual validations.** blong-model now states the
  decision rule: models are `public: true` by default; override only the differing operation with an
  explicit `gateway/<subject>/<method>.ts` validation; the template ships a public model + override
  example.
- **agent creates a realm-local orchestrator instead of reusing blong-server's subject
  orchestrator.** `[REUSE_SERVER]` guardrail added to conventions, blong-realm, blong-layer and
  copilot-instructions; the kopi template no longer ships `orchestrator/$subjectDispatch.ts` (or a
  realm-local `adapter/db.ts`) — it scaffolds `orchestrator/subject/init.ts` (namespace only) and
  reuses blong-server's `srv.db`.
- **Docs/skills disagree with the code about where the server test layer lives.** Skills +
  conventions now match `WELL_KNOWN_LAYERS` (`core/blong-gogo/src/load.ts`): server tap tests in
  `server/test/`, browser tap tests in `browser/test/`, top-level `test/` is the Playwright
  (browser) layer. The template scaffolds `server/test/` + `browser/test/`. (The `docs/blong/docs`
  pages still need the same alignment — deferred.)
- **Non-handler helper files in a handler-group folder.** blong-handler documents the convention: a
  helper used by handlers in the same group may live beside them (the `Watch.ts` warning is benign);
  shared helpers belong in a `lib/` group, and a `_`/`.`-prefix marks plain files.
- **The `db_invoice` synthetic-handler naming rabbit hole.** `[DB_ACCESS]` + blong-handler now state
  plainly: DB persistence handlers live in `adapter/db/` and use
  `this.config?.context?.queryBuilder`; the template ships the canonical
  `adapter/db/$subject$ObjectAdd.ts`.
- **Over-exploration before building (run A).** blong-realm is now kopi-first ("scaffold, then
  adjust"), lists the recommended skill set, and the blong-kopi README explains how to use the
  tooling — agents trust the scaffold instead of re-exploring reference realms.
- **The "make models public" rule is not universal.** blong-model now has the decision rule (public
  by default; explicit gateway override for the ops that differ). The master-detail (invoice +
  `lines`) auto-model improvement is still a separate work item.
- **Capability-name convention is ambiguous.** blong-core documents NON-dotted handler names as the
  default (`invoiceInvoiceAdd`), dotted forms as discouraged special cases; the template seed uses
  non-dotted. (Verifying against `access.authorization.list` expectations remains a follow-up.)
- **Gateway auto-validates CRUD params against `NotNull` columns.** blong-schema has an
  `[AUTO_VALIDATION]` guardrail: server-managed audit fields must be nullable
  (`createdAt: type.dateTimeNull()`); the template schema demonstrates the convention with a
  comment.

Resolved by the "CI first-run test failures" debug (2026-08-21) — blong-access/gateway/kopi failed
tests on a fresh DB but passed on the second run.

- **`access_role.roleBit` collision silently destroyed the Admin row.** The blong-access test seed
  (`meta/dbTest/accessAuthorizationMerge.yaml`) creates the test-only `NoLogin` role via
  `accessAuthorizationMerge`, which hardcodes `extraColumns: {roleBit: 0}`. `access_role` has
  `UNIQUE KEY access_role_ux_roleBit(roleBit)`, and `coreResourceEnsure`
  (`core/blong-core/adapter/db/coreResourceEnsure.ts`) inserts the entity row with
  `.onConflict(keyName).merge()` → MySQL `ON DUPLICATE KEY UPDATE`, which fires on ANY unique-key
  conflict — so the `NoLogin` insert (roleBit 0) OVERWROTE the existing `Admin` row (roleBit 0),
  deleting Admin from `access_role` (its `core_resource` row survived). Tests joining `access_role`
  (`accessAuthorizationList`, `accessProfileGet` — and gateway's authz / kopi's HTTP auth) then
  failed while login (which reads materialized `core_path`, still intact) passed. On the second run
  the prod seed `1-accessRoleMerge.yaml` re-inserted Admin (roleBit 0 → overwrote NoLogin's row
  back), so tests passed → "first run fails, second succeeds". Fix: pre-seed `NoLogin` with a free
  `roleBit: 5` in `meta/db/1-accessRoleMerge.yaml` (the documented "pre-seed roles" rule), and
  hardened `coreResourceEnsure` to use `.onConflict(keyName).ignore()` (`INSERT IGNORE`) instead of
  `.merge()` so a secondary unique-key conflict can never clobber an existing row. Debug technique
  that worked: reproduce on a fresh DB, then query `access_role`/`core_resource` mid-run — the
  missing Admin row + NoLogin owning bit 0 was the smoking gun.

Resolved by the "blong-dev sql usability" follow-up (2026-08-21) — the dev SQL CLI was unusable out
of the box (had to `kubectl exec` into the MySQL pod).

- **`blong-dev sql` connected as anonymous user.** `readConnection` started from `{}` and only
  layered `.blong_devrc`/CLI values, so with no `srv.db` in `.blong_devrc` the connection had no
  user/password → `Access denied for user ''@'...'`. Fix: fall back to the shared `srv.db` adapter's
  dev defaults (`blong-admin`/`password` @ `localhost:3306`) for the default `srv.db` key only
  (custom `--config` keys stay empty), and auto-create the derived dev DB (`${suite}-${user}`) when
  missing (mirrors dev `createDatabase: true`). Lesson: the dev tool should mirror the framework's
  own dev connection defaults instead of requiring per-developer `.blong_devrc` setup.

## MySQL connection-lost retry (2026-08-21)

- **Investigating intermittent `PROTOCOL_CONNECTION_LOST` in CI required verifying knex/tarn pool
  internals from source**: `QueryBuilder.clone()` constructs a fresh builder from `_*` fields and
  does NOT copy own-property `then`/`insert`/`update` overrides (safe for retry re-execution), and
  `then()` re-runs from builder state on each call. The first retry implementation recursively
  called the wrapped `then` on the first attempt (`target.then` after overriding `builder.then`) →
  "Maximum call stack size exceeded". Fix: capture `originalThen` before overriding and use it for
  attempt 0; use the clone's own (prototype) `then` for retries.
- **`get_errors` reported a stale `Property 'retry' does not exist on type '{}'` on
  `knex.ts(384)` long after `tsc -p tsconfig.json` passed with exit 0.** The language-server cache
  lags multi-file type edits (types.ts added `retry` but the Problems panel kept an old module
  graph). Lesson: when the Problems panel disagrees with a clean package `tsc --noEmit -p
  tsconfig.json` run, trust the `tsc` run — do not chase phantom errors.
