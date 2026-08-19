# Decisions

## Area 3 implementation (2026-08-18)

- **A3.4 override fix — REPLACE over `override` flag**: Chose to make `Registry._validations()`
  replace a later-registered validation per `methodParts` key (plan's primary option) instead of
  adding an explicit `override` flag on gateway files. Reason: minimal + deterministic, and it also
  fixes the ut-function.merge TypeBox `Kind`-symbol corruption (nested `details` arrays threw
  "Unknown type"). No existing code relies on same-key merge.
- **A3.9 deploy snapshot — regenerated (sync) not deprecated**: Ran `rush deploy --overwrite` to
  sync `common/deploy/` (it is a generated, gitignored artifact used by the Docker build), rather
  than adding ephemeral deprecation notes inside a gitignored folder. `kopi.ts` now matches `core/`
  and `blong-kopi` is v1.9.0.
- **A3.5 master-detail — nested `master.<detail>` arrays**: Chose `IModelSpec.details` producing
  NESTED array properties on the master object schema (`{invoice:{..., line:[...]}}`) over the kopi
  override's top-level-sibling `{invoice:{...}, lines:[...]}` shape. Nested matches the existing
  RHF dotted-path payload and needs no manual override.
- **A3.1 element timeout — 5s**: Picked `BLONG_ELEMENT_TIMEOUT = 5_000` (upper end of the plan's
  3-5s range) to keep some CI headroom while failing fast vs the 30s default.
- **A3.7 — fixed harness glob bugs beyond the rubric**: In addition to `invoicing`→`invoice`,
  fixed `run.mjs` `globToRegExp` (`**/` matching zero dirs) and the `anyFile` string-includes bug,
  because without them the "fixed items" (suite-wiring etc.) could not score.

## Kopi runnable + framework `$` handling + diagnostics (2026-08-18 follow-up)

- **Do NOT scaffold a new realm for the screenshot demo**: Reverted the throwaway `dev/testrealm`
  (rush.json entry + lockfile) per the directive "do not create new realms". Instead made
  `core/blong-kopi` itself a runnable realm that generates its own screenshots.
- **Run kopi with LITERAL `$subject`/`$object` (no content rewrite)**: The template placeholder
  names are valid identifiers everywhere, so the fix is framework-side, not a scaffold-time
  rewrite. `$`-aware `methodParts` (lib.ts) + `$`-aware `capitalize` (4 call sites) make the
  derived names consistent with the `$subject$Object...` files. This is "stripping/absorbing the
  `$` at the proper places" the user asked for.
- **Seed crash was stale-handler, not `$`**: `meta/dbTest/$subject$ObjectMerge.yaml` +
  `$subjectAuthorizationMerge.yaml` dispatched methods with no handler (the master-detail refactor
  deleted the custom Add handler). `$subject$ObjectMerge` resolves via the generic `exec` fallback
  (like blong-marine's `marineCoralMerge`); `$subjectAuthorizationMerge` needs a real handler —
  added `adapter/db/$subjectAuthorizationMerge.ts` (simplified `accessAuthorizationMerge`).
- **Graceful-shutdown timeout bounds the STOP, not the run**: Moved the 30s timer from
  handler-creation into the signal handler. The old behaviour self-destructed any long-running
  `blong`/`blong-watch` server 30s after start — the root cause of the Playwright webServer
  backend dying mid-run.
- **Detail arrays OPTIONAL in auto add/edit validation**: `crudParams()` marks sibling detail
  arrays `Type.Optional` so a master without details is valid; otherwise the RBAC 403 test gets a
  400 validation error before authorization is evaluated.
- **knex `remove` cascades detail rows**: A master with children couldn't be deleted (non-cascading
  FK). Generic `remove` now deletes FK-constrained detail rows first — consistent with `edit`
  replacing children.
- **Permanent diagnostics (intent-agnostic, self-gating on trouble)**: (1) `Registry._matchMethods`
  warns when a handler factory exceeds 3s (names the method); (2) `Remote` warns when a
  `canSkipSocket` lookup finds no local method; (3) `blong-server/subject.ts` warns when a derived
  model handler name doesn't match a registered file (names the closest match). These would have
  pinpointed the `$`-mismatch hang and `_validations()` stall instantly.

## Break the gogo↔kopi↔access workspace cycle (keep kopi runnable)

- **Constraint**: `blong-kopi` must stay a runnable/testable realm, so `kopi →
  gogo` (for `load` in index.test.ts) and `kopi → access` (RBAC demo) stay.
- **Root cause**: the cycle was a `gogo ↔ kopi` 2-cycle plus access — `gogo.deps
  → blong-kopi` (scaffolder re-export) + `kopi.devDeps → gogo` + `kopi.devDeps →
  access` + `access.devDeps → gogo`. Introduced by HEAD adding kopi's framework
  devDeps (runnable demo).
- **Chosen fix (Option 1)**: drop `gogo → kopi`. `blong-gogo` now owns
  `createRealm` (`src/kopi.ts`, moved from `blong-kopi/kopi.ts`), resolving the
  template from (1) the monorepo sibling `core/blong-kopi` (dev) or (2) a
  publish-bundled `template/`. The bundle is generated ONLY at publish time by
  `scripts/copy-template.mjs` (`prepublishOnly`); the `template/` folder is
  git-ignored and never committed. gogo's `.npmignore` gets `!template/**` so it
  ships in the tarball.
- **Result**: gogo is a sink; `blong-dev`/`blong-kopi`/`access` form a chain with
  no back-edge. `rush update` succeeds (no cycle). kopi tap 6/6, blong-gogo 259
  pass. `blong-kopi/kopi.ts` keeps its own copy of `createRealm` (twin of
  gogo's) for direct use — keep them in sync.
- **SUPERSEDED (twin removed)**: the `blong-kopi/kopi.ts` twin was later found to
  have ZERO consumers (CLI `bin/blong.ts` + runtime `load.ts` both import gogo's
  `src/kopi.ts`). It was deleted — `createRealm` now lives in ONE place. The
  template file enumeration (glob + ignore list) was also extracted into a
  shared `core/blong-gogo/src/template-files.ts` (`TEMPLATE_FILES_IGNORE` +
  `listTemplateFiles`), used by both `src/kopi.ts` and the publish-time
  `scripts/copy-template.mjs` (which imports the `.ts` module directly — Node 24
  strips types), so the two can never drift again.

## Reuse shared `accessAuthorizationMerge`, drop the template's duplicate RBAC handler

- **Question**: Is `adapter/db/$subjectAuthorizationMerge.ts` in the kopi template really needed,
  or can the seed use `accessAuthorizationMerge.ts` (via `accessAuthorizationMerge.yaml`) like the
  other realms?
- **Answer**: NOT needed. blong-access's `accessAuthorizationMerge` handler is fully generic — it
  processes any `user`/`role`/`capability`/`policy` names given (no `access`-specific logic) and is
  attached to the `db` adapter in every suite (access is a child realm; srv.db imports `/.db$/`).
- **Root cause of the duplicate**: the seed was named `$subjectAuthorizationMerge.yaml`, so its
  derived method was `$subject.authorization.merge` with no matching handler. The scaffold-name
  placeholder in the FILENAME caused a missing handler, forcing the per-realm duplicate.
- **Chosen fix**: delete `core/blong-kopi/adapter/db/$subjectAuthorizationMerge.ts` and rename the
  seed to `core/blong-kopi/meta/dbTest/accessAuthorizationMerge.yaml`. The fixed (non-`$subject`)
  file name derives `access.authorization.merge` → dispatches to the SHARED handler. Only the seed
  CONTENT carries `$subject` placeholders (substituted per realm at scaffold time), so scaffolded
  realms always reuse the framework handler. Template stays minimal (no duplicated handlers).
- **Verified**: kopi tap 6/6 (RBAC 401/403/200 + permissions assertion) and Playwright 4/4 both
  pass after the change; the `accessAuthorizationMerge.yaml` seed now re-ensures `$subjectManage`
  idempotently via the shared handler.

## Capability action pivot collapses CRUD actions to entity rows via a custom dropdown

- **Question**: The capability editor's action tab should not list `accessCapabilityRemove` etc. as
  separate rows. How to make the pivot list ONE row per entity with CRUD verbs as columns — and
  should it apply only to `accessCapability` or all entities?
- **Answer**: Applies to ALL entities (user clarified): any action whose name ends with a standard
  CRUD suffix (`accessUserFind`, `accessRoleEdit`, …) collapses to one entity row. Implemented by:
  1. A custom `access.crudEntity` dropdown served by a new realm handler
     `adapter/db/accessDropdownList.ts` that calls `super.exec` for the auto per-table dropdowns and
     ADDS the entity list derived from `access_action` + `core_resource` (distinct `access<Entity>`
     prefixes of standard-CRUD actions). Realm handlers override the knex adapter's auto
     `access.dropdown.list` (same mechanism as any `access.*` db handler).
  2. Model pivot `{dropdown:'access.crudEntity', join:{value:'entityName', label:'entityName'}}`.
  3. `crudActionParts`/`crudPivotActionIds` helpers map ticked cells → ensure + sync
     `access<Entity><Pred>` action edges. Non-CRUD actions → `otherAction` card inside the Action tab.
- **Trade-off accepted**: overriding `access.dropdown.list` means every access dropdown call pays the
  extra `access_action` query; guarded by returning base on missing `qb`. The `access.crudEntity`
  list reflects only entities that have at least one registered CRUD action (correct — you can only
  grant what exists).
- **Verified**: live DOM showed entity rows (accessUser/accessRole/accessCapability with full CRUD,
  others with Find) + Other Actions card (subject.object.schema, accessDropdownList,
  accessSessionClose); Playwright 19/19 + tap flow + both packages' lint green.

## Generic CRUD handles resource-backed entities + graph edges (opt-in)

- **Question**: blong-access has ~18 adapter/db handlers that just do resource-backed CRUD
  (`coreResourceEnsure` on add, name join on find/get, resource rename on edit, cascade on remove,
  `core_triple` hasRole/hasCapability/hasAction edge sync). Can the built-in knex `exec` absorb them?
- **Answer**: Yes — opt-in via `ISchemaTable.resource: true` + `ISchemaTable.edges[]`. The exec `add`
  now generates server-side PKs for `uuid`/`ulid` default markers AND for resource-backed not-null
  PKs (FK→core.resource, no default, PK absent), creates `core_type`+`core_resource`, strips the
  virtual `${object}Name` from the insert, and joins the name onto the result. find/get join the
  name, edit renames the resource, remove cascades (entity row → resource row) + declared edges
  (incl. `reverse` bindings). Declarative `edges` give graph-edge master-detail on get/add/edit.
- **Trade-off**: opt-in means zero impact on realms that don't declare `resource`/`edges`. Role CRUD
  is now fully generic (10 handlers deleted: 4 browse finds, role find/get/add/edit/remove,
  capability find). User/capability handlers stay custom (credentials/session/CRUD-action pivot).
  USER GUIDANCE honored: exec now handles `ulid` (was a genuine gap) and the `uidNotNull`-PK caveat
  is documented in the blong-schema skill; not-null PK generation is safe (only fires when PK absent).
- **Verified**: tap 22/22 + Playwright 19/19 + both packages' lint green. Bugs fixed along the way:
  remove order (FK), reverse-only edge binding clobbering the master key, edge name join on Buffers,
  add result missing `${object}Name`.

## Integration coverage (blong-int-adapter)

- **Question**: the new resource/edge exec features need integration test coverage.
- **Answer**: wired `@feasibleone/blong-core` as a mysql realm child (user-approved) and added a
  `mysql resource/edge CRUD` group (12 steps: resource-backed person CRUD, ulid/uuid PK generation,
  hasMember graph-edge team master-detail, cascade remove). All pass.
- **Bug found by the tests**: exec `get` read `masterKey = row?.[keyName]` AFTER
  `prepareResultRow(row, …)` mutates the row in-place (Buffer→base64 string), so
  `Buffer.isBuffer(masterKey)` was false and declared edges were never attached. Fixed by capturing
  the raw PK before the mutation. Also widened `resolveTableSpec` to accept `undefined` tableConfig.
- **Noted**: binary(16) columns round-trip as 24-char base64, not 26-char ULID (documented in the
  blong-schema skill).
