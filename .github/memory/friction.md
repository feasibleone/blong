# Frictions

This document is a list of frictions that have been identified during the work on the project.
Update it when something requires unexpected effort to implement or fix.

## List of unresolved frictions

_None currently._

## List of resolved frictions

Resolved by the "blong-int-adapter resource/edge integration tests" round (2026-08) — get-case edge
attachment silently skipped in the generic knex `exec`.

- **`prepareResultRow` mutates the row in place — masking binary PKs.** In the exec `get` case,
  `masterKey = row?.[keyName]` was read AFTER `prepareResultRow(row, binaryCols, table)` which
  converts Buffer → base64 **in place** (documented behaviour), so `Buffer.isBuffer(masterKey)` was
  `false` and the declared graph-edge attachment block was silently skipped. It took several debug
  runs to spot because the raw row (pre-mutation) IS a Buffer and direct knex repros return Buffers —
  only the mutation ordering differed. Fix: capture `masterKey` from the raw `row` BEFORE
  `prepareResultRow`. Lesson: never read the PK off a row after passing it to a mutating "prepare"
  helper; grab the key first or have the helper return a copy. Debug technique that worked: printing
  `JSON.stringify(row, (k,v) => Buffer.isBuffer(v) ? 'BUFFER:'+v.length : v)` right after
  `query.first()` vs. after `prepareResultRow` to see the mutation.

Resolved by the "blong-int-sql CI test timeout" debug (2026-08-19) — the deadlock test helpers
left 20s `setTimeout` handles behind, holding the process open ~19s after `platform.stop()` (over
tap's 30s per-file limit in CI).

- **Post-stop process hang in `blong-int-sql` tests.** The three deadlock helpers
  (`mysql/adapter/sql/sqlDeadlock{Builder,Trigger,ProcTrigger}.ts`) each wrapped their work in a
  duplicated `withDeadlockTimeout` that raced a 20s `setTimeout` via `Promise.race` but never
  cleared the timer when the operation settled. Three ref'd 20s timers therefore survived
  `platform.stop()`, so the test process only exited ~19s later (locally ~24s total, over tap's 30s
  per-file timeout in CI → `timeout!`). Extracted a single shared `withDeadlockTimeout.ts`
  (`export const`, no default — the loader ignores non-default-export files) that clears the timer
  in `.finally`; `ci-test` now completes in ~8s. Debug technique that worked: `process.getActiveResourcesInfo()`
  to spot the leaked `Timeout` after an unref'd stdio red-herring, then a timer registry capturing
  creation stacks to identify the source.

Resolved by the "fix unresolved frictions" plan (2026-08-19) — `--help` no longer crashes on
`blong` / `blong-watch` / `blong-dev`; `blong-dev sql` derives the dev DB name; the knex adapter
auto-creates missing dev databases.

- **`blong --help` crashed.** The `blong` / `blong-watch` CLIs now short-circuit `--help`/`-h` and
  print usage + exit 0 before realm-create / `autoRun` (shared helper
  `core/blong-gogo/src/cliHelp.ts`), so help works from any directory. The sibling `blong-dev` CLI
  also prints usage + exit 0 on `--help`/`-h`/`help` (`core/blong-dev/src/usage.ts`); its usage list
  was previously only shown via the unknown-command branch that exited 1.
- **Agent not noticing `blong-dev sql`.** `blong-dev sql` now derives the dev DB name
  (`${suite}-${user}`, e.g. `blong-access-kalin`) when none is configured (`.blong_devrc` `suite` key
  → cwd `package.json` name → `--suite`; user from os user) and renders `${suite}`/`${user}`
  templates. It is now documented as the intended way to query the DB in the `blong-schema` /
  `blong-adapter` skills and `copilot-instructions.md` ("use instead of MySQL CLI / kubectl exec").
- **Dev DB naming pattern unknown + no auto-create.** The knex adapter auto-creates a missing
  database in `start()` when `knex.createDatabase: true` (default in the `dev` intent via the shared
  `srv.db` adapter; opt out with `srv.db.dev.knex.createDatabase: false`). The dev naming pattern is
  documented in `blong-schema` and derived automatically by `blong-dev sql`, so agents no longer
  iterate to find the name. `ensureDatabase` (`core/blong-gogo/src/adapter/schema/knex/database.ts`)
  is covered by unit tests with an injected connection.

Resolved by the "improve blong-kopi + realm-creation skills" plan (2026-08-18) — Areas 1 & 2 implemented,
plus the follow-up consolidation (shared RBAC handler reuse + single-source scaffolder).

- **blong-access / RBAC reuse not highlighted.** The blong-core skill now documents the RBAC merge seed
  pattern (`accessAuthorizationMerge` reusing `core.triple.merge`, non-dotted capability names) and
  blong-realm points at it. Follow-up (2026-08-18): the template now REUSES the shared handler in code,
  not just in docs — it ships `meta/dbTest/accessAuthorizationMerge.yaml` (fixed filename, deliberately
  NO `$subject` placeholder, because the seed method derives from the filename →
  `access.authorization.merge` → blong-access's shared `accessAuthorizationMerge` handler attached to the
  `db` adapter). The earlier `adapter/db/$subjectAuthorizationMerge.ts` duplicate handler was deleted;
  only the seed CONTENT carries `$subject` placeholders. Non-dotted capability names stay the default.
- **browser/orchestrator/subject/init.ts — do not replace `subject` with the realm name.** Stated as a
  guardrail in blong-realm / blong-layer / conventions and in the template file comments; the scaffolded
  folder name `subject` stays literal (only the `namespace` value is the realm name).
- **agent fails to make models public and writes manual validations.** blong-model now states the decision
  rule: models are `public: true` by default; override only the differing operation with an explicit
  `gateway/<subject>/<method>.ts` validation; the template ships a public model + override example.
- **agent creates a realm-local orchestrator instead of reusing blong-server's subject orchestrator.**
  `[REUSE_SERVER]` guardrail added to conventions, blong-realm, blong-layer and copilot-instructions; the
  kopi template no longer ships `orchestrator/$subjectDispatch.ts` (or a realm-local `adapter/db.ts`) — it
  scaffolds `orchestrator/subject/init.ts` (namespace only) and reuses blong-server's `srv.db`.
- **Docs/skills disagree with the code about where the server test layer lives.** Skills + conventions now
  match `WELL_KNOWN_LAYERS` (`core/blong-gogo/src/load.ts`): server tap tests in `server/test/`, browser tap
  tests in `browser/test/`, top-level `test/` is the Playwright (browser) layer. The template scaffolds
  `server/test/` + `browser/test/`. (The `docs/blong/docs` pages still need the same alignment — deferred.)
- **Non-handler helper files in a handler-group folder.** blong-handler documents the convention: a helper
  used by handlers in the same group may live beside them (the `Watch.ts` warning is benign); shared
  helpers belong in a `lib/` group, and a `_`/`.`-prefix marks plain files.
- **The `db_invoice` synthetic-handler naming rabbit hole.** `[DB_ACCESS]` + blong-handler now state
  plainly: DB persistence handlers live in `adapter/db/` and use `this.config?.context?.queryBuilder`;
  the template ships the canonical `adapter/db/$subject$ObjectAdd.ts`.
- **Over-exploration before building (run A).** blong-realm is now kopi-first ("scaffold, then adjust"),
  lists the recommended skill set, and the blong-kopi README explains how to use the tooling — agents
  trust the scaffold instead of re-exploring reference realms.
- **The "make models public" rule is not universal.** blong-model now has the decision rule (public by
  default; explicit gateway override for the ops that differ). The master-detail (invoice + `lines`)
  auto-model improvement is still a separate work item.
- **Capability-name convention is ambiguous.** blong-core documents NON-dotted handler names as the default
  (`invoiceInvoiceAdd`), dotted forms as discouraged special cases; the template seed uses non-dotted.
  (Verifying against `access.authorization.list` expectations remains a follow-up.)
- **Gateway auto-validates CRUD params against `NotNull` columns.** blong-schema has an
  `[AUTO_VALIDATION]` guardrail: server-managed audit fields must be nullable
  (`createdAt: type.dateTimeNull()`); the template schema demonstrates the convention with a comment.
