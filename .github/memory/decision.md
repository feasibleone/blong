# Decisions

## User profile feature (2026-08-21)

- **Profile storage**: personal fields (name) reuse `party.person` when present, else a
  no-personal-data fallback; `preferredLanguage` stored in `core.property`
  (`(resourceId='preferredLanguage')`); `emailAddress` stays on `access_user`. No schema migration.
- **Self-service authz via `skipAuthorize`**: `access.profile.get/edit/password.change` are
  bearer-authenticated but skip the RBAC action-list check (pattern from `login.token.revoke`) → any
  logged-in user can use them, no role-grant seed changes.
- **Avatar = initials only** (no photo). Initials from `party.person` name → username/email fallback
  → generic `pi-user` icon.
- **Password change keeps the current session** (no revoke); enforced via the active `access_policy`
  minLength.
- **Profile opens as a portal tab** via the AccountMenu (`openTab`), wired through
  `IPortalConfig.profile = {page, get}`.
- **`profile` config placement**: must live INSIDE the inner `ui.portal.portal.{...}` (so
  `portalConfigGet`/`this.config.portal` carries it to the AccountMenu), while `login`/`google` stay
  as SIBLINGS of the inner `portal` key (App reads them from the portal component config). Nesting
  `login`/`google` inside the inner `portal` breaks the Register/Google buttons.
- **Profile page JSX lives in `src/pages/`** (not a well-known browser layer folder) + lazy dynamic
  import, so the Node tap runner never tries to load `.tsx`; only Vite bundles it. Loading the whole
  `./browser` folder with a `.tsx` breaks `index.test.ts` (tap).
- **blong-party full-demo wiring**: added blong-access browser child + `profile` config + the
  `integration` testHook block to the party app, plus a `partyTestProfileMerge` dbTest seed linking
  testAdmin → `party.person` via `hasProfile`. (Access browser child + profile config + testHook
  alone do NOT break google/selfRegistration — only nesting `login`/`google` inside the inner
  `portal` did.)
- **Playwright fixture note**: a test that only destructures `{page}` never triggers the `portal`
  fixture (goto + login) → page stays `about:blank`. Must request `portal`.

## Preferred language at login (2026-08-21 follow-up)

- **Login returns `profile: {actorId, language}`** (best-effort):
  `login.token.create/restore/refresh` resolve the user profile via a new configurable `profileGet`
  login method (default `access.profile.get`). A missing/disabled `profileGet` NEVER fails login —
  it silently yields `language: 'en'` and no `profile` (lightweight suites unaffected).
  Client_credentials keeps hardcoded `'en'` + no profile (machine credential, no interactive user).
- **`profile` is response-only, NOT a JWT/refresh claim**: `token.ts` destructures it out of the
  `...rest` claims spread. `language` remains a JWT claim (now the resolved preferred language
  instead of hardcoded `'en'`).
- **UI applies the language in the auth handlers** (`authLogin`/`authSessionGet` →
  `setLanguage(profile.language)`), not in the page. Suites don't need per-page wiring.
- **Translations are registered per-language in `appStore`** via `setTranslationsByLanguage`;
  `setLanguage` swaps the active `translations` table only when dicts are registered (empty
  `translationsByLanguage` = legacy behavior, so existing tests/storybook that call
  `setTranslations` + `setLanguage` are unaffected). Registration order vs `setLanguage` is
  order-independent (both re-apply).
- **The suite owns its translation dictionaries** via `portal.translations` (e.g. blong-access
  `{en: {}, bg: {...}}`); English = empty dict → English-string fallback. Translation keys ARE the
  English strings (per the existing `tr()`/`useText` convention).
- **bg PrimeReact locale is bundled in blong-browser** (`src/primereact/locales.ts` `bgLocale`,
  included in `DEFAULT_THEME.languages`) so `setLanguage('bg')` cannot crash any app with
  PrimeReact's "navigation option not found" error. Registered always, activated only when
  language='bg'. (Alternative — per-app `theme.languages` via portal config — rejected as more
  plumbing for no benefit since the locale data is framework-agnostic.)
- **Bulgarian-language test lives only in blong-access**: set `preferredLanguage='bg'` via the test
  hook, `page.reload()` to re-trigger the boot restore (which returns the language), assert the
  menu/profile render in Bulgarian, screenshot `profile-bg.png`, then restore `'en'` so the shared
  dev DB and other screenshots stay stable.

## Menubar language switcher (2026-08-21 follow-up)

- **Ad-hoc, client-side switching**: the switcher calls `appStore.setLanguage` only — it does NOT
  persist to the user profile (that is the profile page's `preferredLanguage` edit). On next login
  the preference from the profile wins.
- **New `LanguageSwitcher` component** (`core/blong-browser/src/components/LanguageSwitcher/`),
  mounted in `App.tsx` `menubarEnd` to the LEFT of `<AccountMenu />`. Renders a compact `Dropdown`
  (from the blong-browser wrapper) showing the current language; hidden when fewer than two
  languages are available.
- **Config-driven list**: `portal.languages: Array<{value, label}>` (added to `IPortalConfig` AND
  `IBlongPortalConfig`). Falls back to the keys of `portal.translations` so any app with
  translations gets a switcher without extra config. Prop override also supported for tests.
- **`portalConfig` store type note**: the store's `portalConfig` is typed as `IPortalConfig`
  (`src/types/portal.ts`), NOT `IBlongPortalConfig` — new portal config fields (here
  `languages`/`translations`) must be added to `IPortalConfig` too or tsc fails in components
  reading the store.
- **blong-access wires it**:
  `languages: [{value:'en',label:'English'},{value:'bg',label:'Български'}]` alongside the existing
  `translations`. blong-party is intentionally unaffected (no `languages`/`translations` → switcher
  renders nothing → party menubar baselines unchanged).
- **Adding the switcher changes the menubar** in every suite that shows it → re-capture ALL
  Playwright baselines that include the menubar (blong-access full suite re-captured via
  `--update-snapshots=all`).
- **PrimeReact Dropdown in vitest**: open with `userEvent.click` on the dropdown root (mousedown
  toggles the panel); options render as `.p-dropdown-item` in a body portal — query by textContent
  (the `role="option"` name matcher is unreliable here). In Playwright, assert on
  `.p-dropdown-label` for the current selection (the root element's text includes the hidden input
  value too, e.g. `"EnglishEnglish"`).

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
  override's top-level-sibling `{invoice:{...}, lines:[...]}` shape. Nested matches the existing RHF
  dotted-path payload and needs no manual override.
- **A3.1 element timeout — 5s**: Picked `BLONG_ELEMENT_TIMEOUT = 5_000` (upper end of the plan's
  3-5s range) to keep some CI headroom while failing fast vs the 30s default.
- **A3.7 — fixed harness glob bugs beyond the rubric**: In addition to `invoicing`→`invoice`, fixed
  `run.mjs` `globToRegExp` (`**/` matching zero dirs) and the `anyFile` string-includes bug, because
  without them the "fixed items" (suite-wiring etc.) could not score.

## Kopi runnable + framework `$` handling + diagnostics (2026-08-18 follow-up)

- **Do NOT scaffold a new realm for the screenshot demo**: Reverted the throwaway `dev/testrealm`
  (rush.json entry + lockfile) per the directive "do not create new realms". Instead made
  `core/blong-kopi` itself a runnable realm that generates its own screenshots.
- **Run kopi with LITERAL `$subject`/`$object` (no content rewrite)**: The template placeholder
  names are valid identifiers everywhere, so the fix is framework-side, not a scaffold-time rewrite.
  `$`-aware `methodParts` (lib.ts) + `$`-aware `capitalize` (4 call sites) make the derived names
  consistent with the `$subject$Object...` files. This is "stripping/absorbing the `$` at the proper
  places" the user asked for.
- **Seed crash was stale-handler, not `$`**: `meta/dbTest/$subject$ObjectMerge.yaml` +
  `$subjectAuthorizationMerge.yaml` dispatched methods with no handler (the master-detail refactor
  deleted the custom Add handler). `$subject$ObjectMerge` resolves via the generic `exec` fallback
  (like blong-marine's `marineCoralMerge`); `$subjectAuthorizationMerge` needs a real handler —
  added `adapter/db/$subjectAuthorizationMerge.ts` (simplified `accessAuthorizationMerge`).
- **Graceful-shutdown timeout bounds the STOP, not the run**: Moved the 30s timer from
  handler-creation into the signal handler. The old behaviour self-destructed any long-running
  `blong`/`blong-watch` server 30s after start — the root cause of the Playwright webServer backend
  dying mid-run.
- **Detail arrays OPTIONAL in auto add/edit validation**: `crudParams()` marks sibling detail arrays
  `Type.Optional` so a master without details is valid; otherwise the RBAC 403 test gets a 400
  validation error before authorization is evaluated.
- **knex `remove` cascades detail rows**: A master with children couldn't be deleted (non-cascading
  FK). Generic `remove` now deletes FK-constrained detail rows first — consistent with `edit`
  replacing children.
- **Permanent diagnostics (intent-agnostic, self-gating on trouble)**: (1) `Registry._matchMethods`
  warns when a handler factory exceeds 3s (names the method); (2) `Remote` warns when a
  `canSkipSocket` lookup finds no local method; (3) `blong-server/subject.ts` warns when a derived
  model handler name doesn't match a registered file (names the closest match). These would have
  pinpointed the `$`-mismatch hang and `_validations()` stall instantly.

## Break the gogo↔kopi↔access workspace cycle (keep kopi runnable)

- **Constraint**: `blong-kopi` must stay a runnable/testable realm, so `kopi → gogo` (for `load` in
  index.test.ts) and `kopi → access` (RBAC demo) stay.
- **Root cause**: the cycle was a `gogo ↔ kopi` 2-cycle plus access — `gogo.deps → blong-kopi`
  (scaffolder re-export) + `kopi.devDeps → gogo` + `kopi.devDeps → access` +
  `access.devDeps → gogo`. Introduced by HEAD adding kopi's framework devDeps (runnable demo).
- **Chosen fix (Option 1)**: drop `gogo → kopi`. `blong-gogo` now owns `createRealm` (`src/kopi.ts`,
  moved from `blong-kopi/kopi.ts`), resolving the template from (1) the monorepo sibling
  `core/blong-kopi` (dev) or (2) a publish-bundled `template/`. The bundle is generated ONLY at
  publish time by `scripts/copy-template.mjs` (`prepublishOnly`); the `template/` folder is
  git-ignored and never committed. gogo's `.npmignore` gets `!template/**` so it ships in the
  tarball.
- **Result**: gogo is a sink; `blong-dev`/`blong-kopi`/`access` form a chain with no back-edge.
  `rush update` succeeds (no cycle). kopi tap 6/6, blong-gogo 259 pass. `blong-kopi/kopi.ts` keeps
  its own copy of `createRealm` (twin of gogo's) for direct use — keep them in sync.
- **SUPERSEDED (twin removed)**: the `blong-kopi/kopi.ts` twin was later found to have ZERO
  consumers (CLI `bin/blong.ts` + runtime `load.ts` both import gogo's `src/kopi.ts`). It was
  deleted — `createRealm` now lives in ONE place. The template file enumeration (glob + ignore list)
  was also extracted into a shared `core/blong-gogo/src/template-files.ts`
  (`TEMPLATE_FILES_IGNORE` + `listTemplateFiles`), used by both `src/kopi.ts` and the publish-time
  `scripts/copy-template.mjs` (which imports the `.ts` module directly — Node 24 strips types), so
  the two can never drift again.

## Reuse shared `accessAuthorizationMerge`, drop the template's duplicate RBAC handler

- **Question**: Is `adapter/db/$subjectAuthorizationMerge.ts` in the kopi template really needed, or
  can the seed use `accessAuthorizationMerge.ts` (via `accessAuthorizationMerge.yaml`) like the
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
- **Verified**: kopi tap 6/6 (RBAC 401/403/200 + permissions assertion) and Playwright 4/4 both pass
  after the change; the `accessAuthorizationMerge.yaml` seed now re-ensures `$subjectManage`
  idempotently via the shared handler.

## Capability action pivot collapses CRUD actions to entity rows via a custom dropdown

- **Question**: The capability editor's action tab should not list `accessCapabilityRemove` etc. as
  separate rows. How to make the pivot list ONE row per entity with CRUD verbs as columns — and
  should it apply only to `accessCapability` or all entities?
- **Answer**: Applies to ALL entities (user clarified): any action whose name ends with a standard
  CRUD suffix (`accessUserFind`, `accessRoleEdit`, …) collapses to one entity row. Implemented by:
    1. A custom `access.crudEntity` dropdown served by a new realm handler
       `adapter/db/accessDropdownList.ts` that calls `super.exec` for the auto per-table dropdowns
       and ADDS the entity list derived from `access_action` + `core_resource` (distinct
       `access<Entity>` prefixes of standard-CRUD actions). Realm handlers override the knex
       adapter's auto `access.dropdown.list` (same mechanism as any `access.*` db handler).
    2. Model pivot `{dropdown:'access.crudEntity', join:{value:'entityName', label:'entityName'}}`.
    3. `crudActionParts`/`crudPivotActionIds` helpers map ticked cells → ensure + sync
       `access<Entity><Pred>` action edges. Non-CRUD actions → `otherAction` card inside the Action
       tab.
- **Trade-off accepted**: overriding `access.dropdown.list` means every access dropdown call pays
  the extra `access_action` query; guarded by returning base on missing `qb`. The
  `access.crudEntity` list reflects only entities that have at least one registered CRUD action
  (correct — you can only grant what exists).
- **Verified**: live DOM showed entity rows (accessUser/accessRole/accessCapability with full CRUD,
  others with Find) + Other Actions card (subject.object.schema, accessDropdownList,
  accessSessionClose); Playwright 19/19 + tap flow + both packages' lint green.

## Generic CRUD handles resource-backed entities + graph edges (opt-in)

- **Question**: blong-access has ~18 adapter/db handlers that just do resource-backed CRUD
  (`coreResourceEnsure` on add, name join on find/get, resource rename on edit, cascade on remove,
  `core_triple` hasRole/hasCapability/hasAction edge sync). Can the built-in knex `exec` absorb
  them?
- **Answer**: Yes — opt-in via `ISchemaTable.resource: true` + `ISchemaTable.edges[]`. The exec
  `add` now generates server-side PKs for `uuid`/`ulid` default markers AND for resource-backed
  not-null PKs (FK→core.resource, no default, PK absent), creates `core_type`+`core_resource`,
  strips the virtual `${object}Name` from the insert, and joins the name onto the result. find/get
  join the name, edit renames the resource, remove cascades (entity row → resource row) + declared
  edges (incl. `reverse` bindings). Declarative `edges` give graph-edge master-detail on
  get/add/edit.
- **Trade-off**: opt-in means zero impact on realms that don't declare `resource`/`edges`. Role CRUD
  is now fully generic (10 handlers deleted: 4 browse finds, role find/get/add/edit/remove,
  capability find). User/capability handlers stay custom (credentials/session/CRUD-action pivot).
  USER GUIDANCE honored: exec now handles `ulid` (was a genuine gap) and the `uidNotNull`-PK caveat
  is documented in the blong-schema skill; not-null PK generation is safe (only fires when PK
  absent).
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

## client_credentials grant: no DB session (blong-login)

- **Question**: should the `client_credentials` grant in `login.token.create` create a DB-backed
  session (via `access.session.create`)?
- **Answer**: No. App tokens are long-lived machine credentials — no refresh rotation, inactivity
  tracking or restore cookie applies. The initial attempt created a session with the application's
  key as `userId`, which FK-failed (`access_session.userId` → `access_user.userId`, apps have no
  `access_user` row) and broke the blong-gateway `appToken`/meter flow. `client_credentials` now
  mints the token + audits only; sessions are exclusive to interactive user (password) logins.
- **Verified**: blong-gateway tap 20/20 (was failing on the FK constraint).

## ILib.methods convention + object-return libraries (core/blong + blong-login)

- **Question**: how should a library expose configurable handler bindings (soft deps) so handlers
  can access them without a nested accessor function and without casts?
- **Answer**: added a framework convention — `ILib.methods?: LibMethods` in `core/blong/types.ts`
  (`LibMethods = {[m: string]: LibFn | undefined}`). A `library()` factory returns its object
  DIRECTLY; the conventional `methods` member holds the resolved handler bindings, typed via ILib.
  Handlers destructure `lib: {methods = {}, ...}` (default since the member is optional) and call
  `methods.<name>?.(...)`. Libraries do NOT re-export config constants — handlers read `config`
  directly; the library keeps only the method resolution + pure helpers. `blong-login/sessionLib.ts`
  is the reference implementation (11 `login.methods.*` bindings).
- **Trade-off**: members other than `methods` are `LibFn` (unknown returns) → call-site generics
  where a precise type is needed (only 1 place: `sha256Hex<string>` in a string comparison).
- **Verified**: core/blong, blong-login, blong-access, blong-gogo lint green; tap access 37/37,
  party 15/15, gateway 20/20, kopi 6/6; Playwright 21 passed.

## Access-check audit: expose auditId on $meta.auth (awaited in preHandler)

- **Question**: should the gateway access-check audit expose the inserted record key to the audited
  handler?
- **Answer**: Yes. `access.audit.record` now returns `{inserted, auditIds}` (the ULID keys it
  generated). `recordAccessAudit` (core/blong-gogo/src/jwt.ts) sets the first one on
  `request.auth.credentials.auditId`, and the gateway `_meta()` spreads credentials into the handler
  `$meta.auth` → `$meta.auth.auditId`.
- **Trade-off**: to make the id reliably reach the business handler, the preHandler hook now AWAITS
  the audit insert (previously fire-and-forget/"never awaited"). It is still best-effort — failures
  are caught and never fail the request — but every access-checked request now pays a DB write on
  the request path. Denied (403) requests are audited before the error is thrown, preserving the old
  audit-both-outcomes behaviour. The audit id is per-request only (the credentials object is
  re-created, so the bearer cache is not polluted).
- **Verified**: lint green (core/blong, blong-gogo, blong-access); tap access 37/37 (incl. new
  `access.audit.record` → `auditIds` ULID assertion), gateway 20/20, party 15/15, kopi 6/6;
  Playwright 21 passed (confirms async preHandler + 403 behaviour intact).

## Session-close authorization (accessSessionClose) + blong.type in login server.ts (2026-08-20 follow-up)

- **`access.session.close` own-vs-other permission**: Closing your OWN session (params.sessionId ===
  `$meta.auth.sessionId` JWT `ses` claim) needs NO permission — a valid token suffices (so logout /
  revoke / refresh-reuse-detection keep working for every user). Closing ANY OTHER session requires
  the `access.session.close` action (`$meta.auth.actions`, normalized ids). Violations throw the new
  `access.session.closeForbidden` (403) error. Callers that close another session (test seeds,
  token-exchange reuse) pass `{...$meta, auth: {...}}` to satisfy it; refresh marks the closing
  session as its own (`auth.sessionId`). Chose this over "require the action always" because
  self-close is a core logout primitive every logged-in user must have.
- **`blong.type` in blong-login server.ts**: removed the `import {Type} from 'typebox'` in
  `core/blong-login/server.ts`; the config-optional helper now uses `blong.type.*` exclusively
  (typebox is still the dependency, but the framework-provided `blong.type` is the access path).
- **Verified**: lint green (core/blong, blong-login, blong-access); tap access 37/37, gateway 20/20,
  party 15/15, kopi 6/6; Playwright 21 passed.

## CI first-run test failures — roleBit collision (2026-08-21)

- **Problem**: blong-access/gateway/kopi failed tests on a fresh DB (no pre-existing DB), but a
  second run succeeded. Root cause: the blong-access test seed creates the test-only `NoLogin` role
  via `accessAuthorizationMerge`, which hardcodes `extraColumns: {roleBit: 0}`.
  `access_role.roleBit` is a UNIQUE key, and `coreResourceEnsure` inserted entity rows with
  `.onConflict(key).merge()` (MySQL `ON DUPLICATE KEY UPDATE`), which fires on ANY unique-key
  conflict — so the `NoLogin` insert overwrote the `Admin` row (bit 0), deleting Admin from
  `access_role`. Downstream joins (`accessAuthorizationList`, `accessProfileGet`, gateway authz,
  kopi HTTP auth) failed; the next run's prod seed re-inserted Admin and the tests passed.
- **Decision**: (1) pre-seed `NoLogin` with the free `roleBit: 5` in
  `core/blong-access/meta/db/1-accessRoleMerge.yaml` — this follows the documented rule ("a new role
  must be pre-seeded via `accessRoleMerge.yaml` because the merge handler hardcodes bit 0"); (2)
  harden `coreResourceEnsure` (blong-core) to `.onConflict(key).ignore()` (`INSERT IGNORE`) instead
  of `.merge()`, so a secondary unique-key conflict can never silently overwrite an existing row.
  Chose pre-seeding over making `accessAuthorizationMerge` auto-assign roleBits (bigger contract
  change) and over `.ignore()`-only (would silently orphan the entity row).
- **Verified**: drop DB → first run passes for all four packages (access 48/48, gateway 20/20, kopi
  6/6, party 15/15 tap; Playwright access 21+3flaky, gateway 12, kopi 4, party 15+1flaky); DB now
  shows Admin(0)…Guest(4), NoLogin(5); second run idempotent.

## `blong-dev sql` usability — dev-defaults fallback (2026-08-21)

- **Problem**: `blong-dev sql` failed with `Access denied for user ''@'...'` when `.blong_devrc` did
  not configure a `srv.db` connection (the repo-root `.blong_devrc` only has `db.sql` for a remote
  ut-microservice DB and `_srv.db._google`), forcing `kubectl exec` into the MySQL pod instead.
  `readConnection` resolved to `{}` (no user/password/host) → mysql2 connected as anonymous.
- **Decision**: `readConnection` now starts from the shared `srv.db` adapter's dev defaults
  (`blong-admin`/`password` @ `localhost:3306`) when resolving the default `srv.db` key, then layers
  `.blong_devrc` + CLI overrides on top (missing fields keep the defaults). Custom `--config` keys
  stay empty when unconfigured (preserves the `--config mysql.sql → undefined` test). Added an
  `ensureDatabase` helper + `derived` flag so the command auto-creates the derived dev DB
  (`${suite}-${user}`) when missing, mirroring the dev intent's `createDatabase: true`. Chose the
  `srv.db`-only fallback over applying defaults to every key (would break the custom-key contract),
  and auto-create only for the _derived_ database (never an explicit `--database`).
- **Verified**: 44/44 tap tests (13 sql tests incl. 4 new), `tsc --noEmit` green; live run
  `blong-dev sql "SELECT 1"` auto-created `blong-access-kalin` and connected; `SHOW DATABASES` /
  table queries against `--database blong-access` work; `--config db.sql` still resolves the remote
  devrc block untouched.

## `blong-dev sql` multi-statement support (2026-08-21)

- **Ask**: run multiple `;`-separated statements in one query and return all their results.
- **Decision**: always enable `mysql2` `multipleStatements: true`. mysql2 then returns a single
  statement's result as-is (rows array or `ResultSetHeader`) but collects multi-statement results
  into an ARRAY of result sets. Added `isMultiResult` (an array whose every element is an array or a
  `fieldCount`-bearing header ⇒ multi) to detect the shape, and a `formatResultSet` helper. JSON
  output emits a single result set unchanged (backward-compatible) or the array of result sets for
  multi; pretty output prints each result set labelled `— result N`. Added an `isMultiResult` unit
  test (6 assertions).
- **Verified**: 84/84 tap tests, `tsc --noEmit` green; live `SELECT…; SELECT…` → `[[rows],[rows]]`,
  `CREATE…; INSERT…; SELECT…` → `[header, header, [rows]]`, single SELECT shape unchanged.
