# Frictions

This document is a list of frictions that have been identified during the work on the project.
Update it when something requires unexpected effort to implement or fix.

## List of unresolved frictions

- coding agent tries to run the blong CLI with --help, but it crashes;
- coding agent fails to notice the `blong-dev sql` ability and tries to use MySQL CLI locally or via pod.
- coding agent is not aware of the DB naming pattern in dev and iterates to find it. knex adapter should
  try to auto-create the DB if it doesn't exist unless opted out via a config flag.

## List of resolved frictions

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
