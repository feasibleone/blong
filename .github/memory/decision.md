# Decisions — Area 3 implementation (2026-08-18)

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

# Decisions — kopi runnable + framework `$` handling + diagnostics (2026-08-18 follow-up)

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

# Decision — break the gogo↔kopi↔access workspace cycle (keep kopi runnable)

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

# Decision — reuse shared `accessAuthorizationMerge`, drop the template's duplicate RBAC handler

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
