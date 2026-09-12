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

## Commander polish (2026-07-09)

- **Portal height-chain fix (GLOBAL)**: `.p-tabview`, `.p-tabview .p-tabview-panels` and
  `.p-tabview .p-tabview-panel` in `Portal.css` got `min-height: 0` so tabs fill the portal body and
  NEVER grow beyond the viewport (a 573-row table used to stretch the whole page to ~18k px). This
  affects every portal page — any page that previously relied on growing beyond the viewport would
  now scroll internally (that was a bug, not a feature). If a non-commander page's Playwright
  baseline shifts, regenerate it.
- **Jump-to-path actually navigates** — the old "Jump to path…" input was a no-op (`onJump` was
  never wired). The combined crumb/jump widget's `onJump` now resolves the typed `/`-joined label
  path through a new `Navigator.jumpTo(labels)` handle method (lazy-materializes + reveals).
- **Splitter state persisted locally** (`stateKey="blong-commander.splitter"`,
  `stateStorage="local"`) — pane sizes survive reloads, Explorer-style.

## Commander bug-fix pass (2026-08-23)

- **Leaf `open` `{parent.X}` resolution via row stamping** — `commander.node.get` only receives the
  leaf node, so `{parent.path}`/`{parent.namespace}` templates could never resolve (vault 404, S3
  bucket empty). Instead of changing the RPC contract to carry the parent, rows are stamped with
  their direct parent's fields as `parent.<field>` (`withParentContext`, dropping inherited
  `parent.*` to avoid `parent.parent.*` accumulation). `cleanLeafNode` strips these + `__*` for
  viewer display. This is the mechanism all leaf viewers rely on now.
- **S3 kept AWS-native `Key`** — a first attempt lowercased S3 object list keys (`Key` → `key`),
  which broke the `blong-int-adapter` s3 snapshots/assertions. Reverted the adapter; the commander
  source config now uses `keyField: 'Key'` + `{Key}` (and `{parent.bucket}` via the stamped
  context). Prefer fixing the commander config over changing a shared adapter's wire shape.
- **mongodb `collection.find/get` add a string `id`** — the adapter's `{...doc, id: String(_id)}` is
  an intentional (small) contract change so the commander rows have a unique label/key (mongo `_id`
  is an ObjectId dropped by scalar flattening). The CRUD test mask and `tap-snapshots/mongodb...`
  were updated; tap snapshots are order-sensitive, so `id` must be the last field.
- **k8s synthetic levels have no RBAC `permission`** — category/resource/item levels use unseeded
  permission strings that the gateway's `access.authorization.list` filter dropped, collapsing the
  tree to one level (namespace became a leaf → wrong viewer). The namespace level's `permission`
  gates the whole k8s source; deeper synthetic levels are ungated.
- **Home = welcome panel, not a source table** — the initial table duplicated the tree and was
  deemed useless. Replaced with a `.blong-commander-home` panel (title + hint + clickable source
  tiles). `loadRows` with no selection sets `rows=[]`.
- **`blong-int-adapter` test pollution of the shared dev redis** — running those integration tests
  seeds `blong-test:*` keys into redis db 0, which changes the Commander's redis Playwright
  baseline. Clean db 0 + re-seed `commander:demo`/`commander:greeting` before/after running them.
  `redis-cli` is NOT installed on this host — use ioredis from `core/blong-gogo`.

## Realm-owned RBAC merge files (2026-08-23)

- **Each realm seeds its own capabilities/grants** — commander-specific RBAC (`commanderAdmin`
  capability + the `Admin` role grant) moved OUT of
  `core/blong-access/meta/dbTest/accessAuthorizationMerge.yaml` into the commander realm's own
  `core/blong-commander/meta/dbTest/commander-accessAuthorizationMerge.yaml`. The blong-access merge
  file keeps only access-realm RBAC (testAdmin/Admin, accessModelAdmin, loginCapability, ...).
- **File → method mapping**: the last `-`-segment of the YAML filename maps to the handler method
  (`commander-accessAuthorizationMerge.yaml` → `access.authorization.merge`). Any realm's
  `meta/dbTest/*.yaml` is auto-bound as `<realm>.dbTest.asset` (the `meta` layer is a well-known
  auto-discovered layer; nested `db`/`dbTest` folders are scanned as handler groups). The shared
  `srv.db` adapter's `processSeedAssets` merges the YAML via `ctx.handle(params, {method})`.
- **Idempotent/additive**: the merge handler is insert-only on conflict (`coreResourceEnsure`) and
  uses `core.triple.merge` for edges, so the access file and commander file run in ANY order — both
  can be applied to the same DB repeatedly without duplicates.
- **Verified end-to-end**: deleted commanderAdmin's 22 `hasAction` edges in the dev DB, restarted
  the backend, and the commander merge file re-seeded all 22 + the `Admin → commanderAdmin`
  `hasCapability` grant; testAdmin's `commander.source.list` still returns all 8 sources (RBAC
  pruning intact). The access `accessModelAdmin` (24 actions) was untouched.
- **`commanderAdmin` was never in a committed git version** of the access merge file — it was an
  uncommitted working-tree Phase 2 addition; removing it returns the file to its committed state.
- **MongoDB dev-infra fix** (unrelated but blocking): the `mongosh` exec liveness probe (Node 16
  startup + connect) exceeded the 10s timeout and crash-looped the pod even though mongod was
  healthy. `test/integration/mongodb-deployment.yaml` now uses a `tcpSocket` probe on 27017 (with
  512Mi memory limit) — pod is stable, 0 restarts.

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

## MySQL connection-loss retry + CI resilience (2026-08-21)

- **Problem**: intermittent `PROTOCOL_CONNECTION_LOST` (`fatal: true`) in GitHub Actions CI fails
  random packages (one+ at a time), e.g. `@feasibleone/blong-suite` "Process from config.webServer
  was not able to start". MySQL is a k8s Deployment in k3d (`mysql/mysql-server:8.0.32`, 768Mi,
  `max_connections=151` defaults); the knex adapter had no pool tuning, no keepalive, no retry — a
  single transient drop during schema sync/seed (coinciding with `adapter.ready`) was fatal.
- **Decision**: (1) opt-in retry of transient connection errors in the knex adapter
  (`core/blong-gogo/src/adapter/schema/knex/json.ts` — `isRetryableConnectionError` +
  `withConnectionRetry`), re-executing builders via `clone()` and `raw()` via re-invocation, with
  linear backoff; gated by explicit `knex.retry` config — enabled ONLY in the `ci`/`dev` blocks of
  the shared `srv.db` adapter (`core/blong-server/adapter/db.ts`), never in prod. Also enabled
  mysql2 `enableKeepAlive` + tarn `pool.maxConnectionLifetimeMillis` in those same non-prod blocks.
  (2) Added an `onConnectionError` logging hook (`logKnexConnectionError`, debug/logLevel-gated) for
  diagnostics even when retry is off. (3) Hardened `test/integration/wait.sh` to wait for real MySQL
  readiness (`mysqladmin ping` + `blong-admin SELECT 1`), fixing the cold-start race. (4) Added a
  `failure()` k8s/MySQL diagnostic dump as a repo-owned script (`test/integration/ci-diagnostics.sh`
  in blong); the shared `infitx-org/actions` rush workflow detects the script in its `setup` "Config
  check" step and, on failure, runs it and uploads the `ci-diagnostics` artifact only when the
  script exists (keeps the shared action repo-agnostic). NOT changing MySQL `max_connections`/memory
  until diagnostics show `ER_CON_COUNT_ERROR` (1040) or OOMKilled — the observed signature
  (`PROTOCOL_CONNECTION_LOST`) points to pod restart / idle-drop, not connection exhaustion. v1 does
  NOT auto-retry whole transactions (only inner builder/raw queries) to avoid re-running user
  callbacks with external side effects.
- **Verified**: full blong-gogo `tsc --noEmit` green (exit 0); 89/89 tap tests (json + knex
  deadlock/connection files, incl. new retry + connection-error tests); `ci-lint`
  (tsc+cspell+eslint) clean on changed files; `wait.sh` syntax OK; `rush.yaml` YAML valid.

## Commander tests: DB auto-provisioning + deterministic screenshots (2026-09-07)

- **Backend tap test was missing its DB**: `core/blong-commander/test.ts` loaded with only
  `['integration']`, so the shared `srv.db` adapter's `createDatabase`/schema-sync/seed (which live
  under the `dev` intent) never ran → "Unknown database 'commander'". Fixed by loading with
  `['microservice','integration','dev', ...(CI?['ci']:[])]` (mirrors blong-access) → the DB is
  auto-created + schema synced + `meta/db`+`meta/dbTest` seeds applied.
- **Lingering socket on tap exit**: the redis adapter's `stop()` `quit()` on a lazy/connecting
  ioredis client left the 6379 socket open → tap `timeout!`. `adapter/server/redis.ts` now calls
  `disconnect()` after `quit()` (best-effort, idempotent).
- **Backend seeds are now provisioned by cluster init jobs** in `test/integration/` (run by
  `kubectl apply -k test/integration/` in CI and locally via k3d-create), so no manual action:
  minio-bucket-init uploads `commander/hello.txt`; new vault-seed-init writes KV-v1
  `secret/commander-demo`; new redis-seed-init sets `commander:demo`/`commander:greeting`;
  kafka-topic-init now also produces ONE deterministic seed JSON message. Deterministic content →
  identical in CI + local.
- **Screenshots never bake machine-specific data**: replace whole-table masks (too opaque) with (a)
  the Commander's built-in Filter… input to narrow to the seeded subset (e.g. `commander` keys,
  `commander-demo` secret, `commander/` object, seed message, `admin` db, `master` realm) and (b)
  magenta column masks ONLY on the specific dynamic columns (vault Accessor, k8s ResourceVersion/
  Uid/NodeName + pod names, mongo SizeOnDisk, keycloak realm/user Id + created timestamp, kafka
  offset). Field-name/stable columns stay visible so reviewers can tell the UI works.
- **Filter persists across drill navigation** in the Commander (component-level `search`), so the
  test must `clearFilter()` before drilling into a child after a filtered screenshot, or the child
  view is wrongly filtered (keycloak users empty under the `master` filter; mongo only passed
  because its collections carry a `Database=admin` column).

## Glass theme glare continuity (blong-browser)

- **Chose a single top-left light sweep, not strict line collinearity.** Computing each panel's
  boundary from an exact global straight line (geometry division by per-panel axis length) makes
  every lower same-column card saturate to fully black at steep angles (~140deg measured) → many
  panels clamp flat and the layout looks wrong.
- **Implementation** (`src/components/Theme/glassReflection.ts`): project each panel's top-left
  corner onto the shared light direction (sin/cos of `GLARE_ANGLE_DEG`, default 150), normalize over
  the live panel stack, and spread `--glare-shift` smoothly 42% (nearest light) → 12% (farthest).
  CSS reads `linear-gradient(var(--glare-angle, 150deg), ...)` (cards, toolbar, inspector) so JS
  angle and CSS gradient always agree.
- **Knob**: `GLARE_ANGLE_DEG` in glassReflection.ts (90..180). Verified live in Editor/GlassToolbar:
  toolbar 42% → habitat 12% descending; right Form Inspector rail lit less (31% at same row height
  as 41% card) — coherent light read.
- **Interval (250ms) + resize/load refresh in Theme.tsx** remains the trigger (async story content
  defeats MutationObserver/ResizeObserver in the Storybook iframe).

## Glass glare geometry — perpendicular confusion (correction, blong-browser)

- **The user's "gradient line" = the visible light/dark EDGE, which is PERPENDICULAR to the CSS
  `linear-gradient` axis.** Raising GLARE_ANGLE_DEG (135→150) made the edge MORE HORIZONTAL (the
  opposite of the request) because axis 150° ⇒ edge ~30°; axis 135° ⇒ edge 45°; axis 90° ⇒ edge
  vertical; axis 103° ⇒ edge ~77° (steep). Keep 90..180 knob, smaller = edge more vertical.
- **Symptom "tops align, bottoms wrong"** = parallel per-panel edges placed by projection, not
  collinear. Fix = strict single straight edge: shift_i = (edgeC − axis-proj of top-left) / axis
  span_i, edgeC from the top-most anchor panel at ANCHOR_FRACTION (0.5). Verified every main-column
  card lands on edge constant 357.8 (toolbar 50 → edit 66.3 → taxonomy 53.4 → reproduction 40.9 →
  morphology 27.5 → links 13%). A single steep edge can only cross one vertical column; far-right
  rail (Form Inspector) and the last low card fall back to a top-left falloff (FALLOFF_TOP .4 →
  FALLOFF_BOTTOM .1) instead of pure black.
- **CSS fallback** in glass.css (`var(--glare-angle, 103deg)`) must match GLARE_ANGLE_DEG.

## Glass glare per-lane collinearity (final, blong-browser)

- The editor re-lays itself between ONE column (narrow) and TWO card columns (wide, >~1200px), plus
  a full-width header toolbar and a right Form Inspector rail. A single straight glare edge can only
  cross one vertical lane, so:
    - **Left lane = header toolbar + left-most card column** share ONE straight edge.
    - **Right card column** gets its OWN parallel edge (can't share the full-width header line).
    - **Form Inspector** is independent: fixed `--glare-shift` 50% ("starting at the middle").
- Anchor for a lane's edge is its **top-most CARD** (not the header) at ANCHOR_FRACTION 0.5 —
  anchoring on the wide header stretches/over-lights the narrow cards.
- Implementation (`glassReflection.ts`): cluster non-header cards by centre-x (COLUMN_GAP 120px),
  header joins columns[0]; `updateGlassReflections` re-runs on resize so lanes follow reflow.
- Verified live @1500px (edge constants): left lane toolbar 23.2/edit 50/morphology 35.3/links 26.6
  (C=340.7); right lane taxonomy 50/reproduction 42.6/habitat 36.3 (C=944); inspector 50.
  Single-column: header 40.5/edit 50→habitat 15.8 all on one line.

## Playwright unique ports — AUTO-DERIVED from rush.json in CI (2026-09-07, supersedes explicit-port scheme)

- **Problem**: realms running Playwright under parallel `rush ci-test` all defaulted to 8080/5173 →
  webServer "http://localhost:8080 is already used" collisions. First fix was hand-written unique
  ports per realm (9001/9101…9086/9186) — brittle, easy to forget when adding a realm.
- **Final design (user-chosen Option 1)**: `defineBlongConfig`
  (`core/blong-browser/src/playwright/ config.ts`) auto-derives a per-package port pair from the
  package's index in the Rush `rush.json` (`backend = 9000 + index`, `frontend = backend + 100`),
  applied ONLY in CI; locally it falls back to the classic 8080/5173 so a single local run reuses
  the running dev server.
- **Port selection priority**: explicit `backendPort`/`frontendPort` option →
  `PLAYWRIGHT_BACKEND_PORT` / `PLAYWRIGHT_FRONTEND_PORT` env → (CI) derived from rush.json index →
  (local) 8080/5173. Helpers: `stripJsoncComments` (rush.json is JSONC), `findUp` (cwd →
  package.json + rush.json).
- **Hand-written ports removed** from all 7 realm `playwright.config.ts` (kopi, commander, marine,
  access, gateway, party, suite) — each now just calls `defineBlongConfig()` (+ projects/
  realmPackages where used).
- **Derived values (ALL UNIQUE)**: kopi 9014/9114, commander 9015/9115, marine 9033/9133, access
  9035/9135, gateway 9037/9137, party 9038/9138, suite 9040/9140. Verified numerically + by running
  commander Playwright: local → binds 5173 (10 pass); `CI=1 PLAYWRIGHT_SKIP_INSTALL=1` → binds 9115
  (10 pass), no conflict. blong-browser lint clean.
- **Local `CI=1` simulation gotcha**: `blong-dev playwright` runs `playwright install --with-deps`
  when `CI` is set (unless `PLAYWRIGHT_SKIP_INSTALL`), which on a dev box runs
  `sudo apt-get update && apt-get install …` → password prompt. Real CI is fine: `rush.yaml` sets
  `PLAYWRIGHT_SKIP_INSTALL: '1'` and browsers are pre-installed in the setup step. Simulate CI
  locally with `CI=1 PLAYWRIGHT_SKIP_INSTALL=1`.
- **Out of scope**: `blong-graph/playwright.config.{js,ts}` is a standalone config (own
  `test:server` on port 3000, no `defineBlongConfig`) — unaffected.
  `common/deploy/core/blong-kopi/ playwright.config.ts` (still hardcodes 9003/9103) is a git-ignored
  deployment artifact, not used by CI.

## CI metrics deltas in summary/comment (2026-09-09) — `infitx-org/actions` + blong

- **Baseline storage = B (committed file updated by a main-side updater)**: `.github/metrics.json`
  committed on main; a reusable `update-metrics.yaml` folds the merged PR's run snapshot into it.
  The PR branch is never mutated → no re-triggered builds / no required-check staleness.
- **Delta meaning**: "vs last merged main state" — baseline only advances when a green PR merges.
- **Granularity**: aggregate line + per-package Δ columns (tests count Δ and coverage pp Δ).
- **History**: the committed file holds the latest snapshot as the baseline plus `history` array of
  the last ~10 merged runs (newest first).
- **Extensibility**: schema v1 is metric-agnostic at the aggregate level; future metrics add a
  field + a small delta reducer in the same renderer. Only tests/coverage now.
- **Implementation shape (auto-decided, minor)**: everything (parse, baseline diff, snapshot write,
  render) lives in the single `render-ci.mjs` embedded in rush.yaml's `Render CI summary` step;
  `metrics.json` snapshot is uploaded as the `metrics` artifact. Guarded so the very first run (no
  baseline) renders exactly like before.
- **Schema keying conventions (auto-decided, keep consistent)**: top-level
  `coverage.lines = {hit, found}` (NOT `{hit,total}` — a renderer bug initially read `.total` and
  silently produced null deltas); per-package `packages[<name>].coverage = {linesHit, linesTotal}`.
  blong's `release.yaml` gained an `update-metrics` job calling the reusable workflow @main with
  `RELEASE_PLEASE_TOKEN`.

## Extract complex bash/heredoc steps into composite actions (2026-09-09) — `infitx-org/actions`

- **Why**: the shared `rush.yaml` is a _reusable_ workflow consumed by other repos (`uses: …@main`),
  so it runs in the **caller's** checkout — plain `run: node scripts/x.mjs` from the actions repo
  would not resolve. That pushed logic into giant bash blocks + heredocs embedded in YAML (hard to
  lint/test/diff; quoting hazards). Decision: **composite actions committed in the actions repo**,
  invoked via `uses: infitx-org/actions/.github/actions/<name>@main` (GitHub clones the actions repo
  into `${{ github.action_path }}` at runtime).
- **Scope of this pass**: the two genuinely complex blocks → `.github/actions/render-ci` (report
  parse + baseline diff + metrics snapshot + step summary, dependency-free `.mjs`) and
  `.github/actions/deploy-report` (gh-pages publish: clone/init, copy, prune numeric run dirs, regen
  index.html, force push, resolve pages URL). Small glue bash steps left as-is.
- **Conventions that must hold** (validated): actions are dependency-free plain node (no
  `@actions/*`/build step); composite steps use `shell: bash` +
  `run: node "${{ github.action_path }}/index.mjs"`; inputs flow via explicit `env: INPUT_*:`
  mapping; outputs are written by appending to `$GITHUB_OUTPUT` and declared under the action's
  `outputs:` (consumed downstream as `steps.<id>.outputs.*`); all filesystem work is anchored to
  `$GITHUB_WORKSPACE` via `process.chdir` / `join(workspace,…)`. publish-report gained a `- *node`
  setup step so Node is guaranteed on PATH.
- **Deferred**: converting the remaining small bash (Assemble comment, List reports, Config check,
  List Dockerfiles) — smallest benefit; can follow the same pattern later.
- Note: consumers stay pinned to `rush.yaml@main`, so these actions are exercised only after merging
  to the actions repo's main (matches the existing model).

## Package folders split into six categories (`core/`, `realm/`, `suite/`, `demo/`, `test/`, `tools/`)

- **Scope (implied choice)**: only packages under `core/` were relocated. `ext/rest-fs`, `docs/blong`
  and the gitignored `dev/` were left in place — even though `ext/rest-fs` is dev tooling that would
  fit `tools/` — because the shared `infitx-org/actions` CI workflow and both `.vscode/launch.json`
  files assume `ext/` exists for other consumers of that workflow.
- **Category assignment (user-confirmed)**: framework → `core/`; reusable realms → `realm/`;
  reusable suites → `suite/`; demonstration realms/suites → `demo/`; framework tests → `test/`;
  dev tooling → `tools/`. Explicitly chosen: `config-hot-reload` + `blong-kopi` stay in `core/`;
  `blong-eip` → `demo/`; `blong-access-mock` + `blong-test` → `realm/`; `blong-sim-api` +
  `blong-sim-tcp` → `test/`; `blong-ttk` → `tools/`; `blong-allure` + `blong-chain` +
  `blong-cucumber` stay in `core/`.
- **`test/` naming**: framework test packages merged into the pre-existing top-level `test/` folder
  (which also holds the non-package `test/integration/` k8s manifests). `@feasibleone/test` was
  renamed `test/framework` to avoid `test/test/`.
- **`chromatic.sh`**: `core/common/chromatic.sh` moved to repo-root `common/chromatic.sh`, removing
  the undocumented `core/common` sibling trick. Both consumers now use `../../common/chromatic.sh`.
- **`blong-graph` tsconfig (pre-existing bug, fixed)**: `tools/blong-graph/tsconfig.json` extended
  `core/blong/tsconfig.json`, whose `rootDir: "."` TypeScript resolves relative to the **base**
  config's directory — so `rootDir` became `core/blong` and every blong-graph source file fell
  outside it (TS6059), with `outDir` likewise pointing at `core/blong/dist`. Verified via a minimal
  repro that this predates the move. Fixed by adding an explicit `rootDir`/`outDir` override in
  blong-graph's own config. **Reconsider if** blong-graph should instead get a standalone tsconfig.
- **Deliberately not rewritten**: `plans/**` (historical plans + friction archives, ~1000 stale
  refs), `.github/memory/*.md`, and the untracked (regenerated) Docusaurus `docs/blong/build/`.
- **`rush.json` order frozen**: `projects` was rewritten in place, never reordered, because
  `blong-browser/src/playwright/config.ts` derives Playwright ports from each package's index.

## blong-browser theme switcher (App menubar)

- **Family-based theme list** (user-chosen): one dropdown entry per PrimeReact theme family (16
  families = 32 folders) + 24 single-variant themes + the blong `glass`/`wood` variants = 42
  entries. A sun/moon light/dark toggle appears only when the selected option has BOTH variants.
- **Glass/Wood are standalone** (user-chosen): dark base, no light/dark toggle (their CSS is
  dark-only). They layer over the config default folder (`PRIMEREACT_PALETTE_THEMES[type][palette]`).
- **State lives in `appStore.theme`** (`{themeId?, palette?}` + `setTheme`), persisted to
  `localStorage['blong.theme']` (read at store creation, guarded by `typeof localStorage`). The
  `<Theme>` provider merges it over the `IThemeConfig` prop — an explicit selection outranks config.
- **Config gate `IThemeConfig.switcher?: boolean`** (default true): `ThemeSwitcher` returns `null`
  when false. Exposed through the new `useTheme()` context (`IThemeContextValue`).
- **New `IThemeConfig.name?: string`** accepts a theme-option id (`lara-blue`, `glass`) OR a
  PrimeReact folder (`lara-dark-blue`) and overrides the legacy `type`+`palette` mapping. `type`
  stays font-size-only; the switcher changes only theme + palette.
- **CSS swap via `?inline` + one `<style id="blong-prime-theme">`** (`themeRegistry.ts`
  `THEME_LOADERS`). This FIXES a latent bug: side-effect dynamic imports are never re-injected, so
  revisiting a theme kept losing to a later-loaded one. Exactly one theme is active now. Verified
  `?inline` returns the full CSS (178,538 chars for vela-blue) with a throwaway Vite build.
- **Menubar order**: `<ThemeSwitcher />` → `<LanguageSwitcher />` → `<AccountMenu />`. Storybook
  `withDispatch` resets the theme selection per story so `parameters.theme` wins.
- **cspell**: files containing theme names carry a file-local `/* spell-checker: disable */`
  (`themeRegistry.ts`, `Theme.tsx`, `Theme.test.tsx`, `ThemeSwitcher.{test,stories}.tsx`) — no
  global dictionary changes.
- **Verified**: 36 targeted tests + full blong-browser suite 450 passed (the only failing suite is
  the pre-existing `Editor.test.tsx` that cannot resolve `@feasibleone/marine-data`); `get_errors`
  clean on all touched files.

## Wood theme design-match: card plate + input channels (blong-browser, 2026-09-11)

Design-matched `wood.css` §W2/§W3 to `plans/theme/wood-card.png` (the close-up of the Morphology
card). The reference has **no corner screws**, so the old `::after` hex-screw layer was removed.

### Second pass — the reference is a 2× (DPR-2) capture

The first pass matched the *relative* styling but produced edges that were twice too thick, an
invented bottom shadow on the inputs, and "low-res" textures. Root cause: **`wood-card.png` is
rendered at 2× DPR**, so every measured pixel distance is 2 device px per CSS px. Measured geometry
(image px → CSS px):

| Feature | Design | CSS target |
| --- | --- | --- |
| Card corner radius | ~12 | **6** |
| Card outer dark rim | 2–3 | ~1–1.5 |
| Card top highlight | band ~10 total, peak at 4 | peak ~2 inside, gone by ~5 |
| Input corner radius | ~6 | **3–4** (used 4) |
| Input top occlusion | 6–7, near-black | ~3.5, near-black |
| Input bottom | light glare band 4, **no shadow** | light glare peak ~2.5 up, 0 at floor |
| Mesh cell / period | 4 / 8 | 2 / 4 |
| Input height | 68 | 34 |

- **Every texture is now authored at 2× and drawn at half size**, so it is 1:1 on a DPR-2 display:
  grain 512px drawn at `background-size: 256px`, edge art 32px slices drawn into a **16 CSS-px**
  border (`border-image-width: 16px`), ramps drawn at `100% 4px`.
- **The mesh is SVG, not a raster tile.** A raster tile is necessarily crisp at one DPR only; an
  inline SVG checkerboard (2 CSS-px squares, drawn at `background-size: 4px`) is vector-crisp at
  any ratio. This is what fixed the "low-res" complaint.
- **The wood grain is fine stranded fibre, not broad bands.** Measurement drove this: the design's
  clean band is `rgb(77,48,35)` with **per-channel sdev ≈ 9.9**; the first pass rendered sdev ≈ 4.6
  (too flat). Two heavily x-stretched fBm octaves (`fbm(u,v,3,170)` and `fbm(u,v,2,320)`) now carry
  the texture and the amplitudes were roughly doubled, giving `rgb(72,45,33)` / sdev ≈ 8.8.
- **Grain mean is pinned to 128** (generator base 133) so `overlay` is neutral on average and the
  CSS walnut tone shows through unchanged — tone is controlled in CSS only, which is what let the
  two layers be calibrated independently.
- **Grain quantised to 6-bit** (`-depth 6`): 62 KB → 35 KB PNG with no visible banding (~1.3/255 per
  step). Total generated CSS is now **55 KB raw / 41 KB gzip**.

### Third pass — bevel thickness, fibre detail, brass buttons

Three follow-ups: "card bevel is still too thick", "wood misses the tiny fibres", and matching the
toolbar buttons to `plans/theme/wood-buttons.png`.

- **"Too thick" was a doubled rim, not a too-wide highlight.** The per-pixel edge scan
  (`wood-card.png` x=540, y=8..34) shows the design is: a **~0.75 CSS-px dark rim**, then a narrow
  warm highlight peaking at **+1.5 CSS px** and back to the wood by **+5**. My art had its own
  opaque rim stacked on the card's 1px CSS `border`, producing a ~2px near-black edge. Fix: **the
  art no longer paints a rim at all** — the CSS `border` (recoloured `#2a1608` → `#1d1310`, the
  design's actual rim rgb(29,19,16)) is the rim, and the art carries only the highlight. The
  profile is now `wLight = smoothstep(1.2, 3.0, b) · (1 − smoothstep(3.0, 10.5, b)) · lit` with
  `lit = max(0, −gy/gl)` (top-facing only — the design's left/right edges show a *shade*, no
  highlight, so the old `nx` term was wrong).
- **The "tiny fibres" are short, not long.** My first fibre octaves were stretched so far
  (`fbm(u,v,3,170)`, `fbm(u,v,2,320)`) that they produced long continuous streaks; the design is a
  **dense stipple of ~1–3 device-px-tall, ~10–50-px-long fibres**. Rebalanced to
  `(12,170)`, `(24,340)`, `(44,480)` plus `(5,120)` for the long grain lines. Calibrated with two
  measurements against a clean design swatch: **tone** (`rgb 77,48,35`) and **high-frequency
  energy** (`sdev` of `image − blur(1px)` = 1.35). Final: tone `rgb(76,48,35)`, hf 1.25, sdev 9.5
  vs the design's 9.9 — the hf metric was the one that actually correlated with "feels low-res".
- **Grain quantised to 5-bit** (`-depth 5`): 59 KB → 44 KB; verified indistinguishable from 8-bit
  at 2×. Total generated sheet: **66 KB raw / 49 KB gzip**.
- **§W8 toolbar buttons rewritten** from the old flat steel switches to the design's brass keys.
  Measured at 2×: frame 6 device px (3 CSS px), radius ≈9 (5 CSS px), height 78 (39 CSS px), brass
  rgb(120,90,56)→rgb(219,183,135), panel rgb(35,32,29) with rgb(74,64,56) dots on a 4 CSS-px pitch,
  label gold rgb(222,187,138), ~4 CSS-px drop shadow, title case (the old `text-transform:
  uppercase` was wrong).
  - The metal is a **`border-box` gradient behind `padding-box` inner layers** with a 3px
    transparent border — the gradient spans the whole button, so the top/bottom *borders* pick up
    the bright stops and the sides take the mid tones, giving the measured "bright top **and**
    bottom, dimmer sides" tube look with no image.
  - The panel dots are a second generated SVG (`--wood-btn-dots`, 8-unit tile drawn at 8px).
  - The icon-only buttons were previously **unstyled** (the old selector excluded them, and they
    render `p-disabled`); they now get the same frame plus a struck-back disabled state.
- **Verified**: 46 files / 502 tests pass; `vite build` clean; generator byte-reproducible; card
  bevel + input + buttons compared against the design at 1:1 and 3–4× zoom; toolbar checked in the
  `editor--wood-toolbar` story.

### Fourth pass — bevel falloff, button states, typography

Follow-ups from `plans/theme/wood-buttons-2.png` (a new 2× capture showing the normal **and**
error/active buttons plus the failure hint) plus "the card bevel is still too thick" and "fix the
card, label and input fonts".

- **The bevel peak was right; the *falloff* was wrong.** My art peaked at the design's +1.5 CSS px
  but held near-peak out to ~4.5 px. Measured deltas from the design's scan
  (`wood-card.png` x=540): +34 / +68 / +48 / +27 / 0 at **1.0 / 1.5 / 2.0 / 2.5 / 3.0 CSS px** —
  a band only ~3 px wide. Fix: the fall ends at art 6.0 (was 10.5) with the peak alpha 0.59 → 0.52,
  and the unlit-side shade was shortened (art 13 → 11) and weakened (0.42 → 0.34). Verified against
  the design: +29 / +70 / +52 / +18. **Lesson: when a gradient "looks too thick", compare the
  *decay profile*, not just the peak.**
- **Buttons — the frame is a bullnose, not a flat bevel.** Per-pixel scan (device px, outer→inner):
  top **107,162,116,133,125,73**, bottom **57,117,116,122,159,126** — so the brass peaks near the
  *outer* edge on top and near the *inner* edge on the bottom, i.e. a rounded ring lit from above.
  Normal peak ≈rgb(162,138,110); error/active ≈rgb(196,164,126). The earlier frame was far too
  light (`#e2c396`, peak 226). Now: `#a58c6e → #7a6448 → #6d5940 → #7a6448 → #a58c6e`.
- **Outset frame / inset body** now come from the shadow stack: `0 0 0 1px rgba(0,0,0,.5)` (outer
  ring) + `0 3px 6px` (cast) + `inset 0 0 0 1px #150c05` (the seam) + `inset 0 2px 3px` and
  `inset 0 0 6px` (the recessed panel).
- **The dot panel is now a *translucent* SVG** (`#000` @0.22 field + `#fff` @0.09 dots) so one asset
  tints for both states — the normal and error panels differ only by their base colour
  (`#1f1f20` vs `#a04f32` ⇒ field rgb(25,25,26) vs rgb(125,62,39), matching the design). Pitch
  reduced 4 → **3 CSS px** (drawn at `background-size: 6px`, the design's ≈6 device px at 2×).
  `rgba()` is not reliable in SVG presentation attributes, so `fill` + `fill-opacity` is used.
- **Error/active button state is now wired, not just styled.** `ActionButton` gained a `failed`
  state set for **2000 ms** after a rejected call — deliberately matching `ActionHint`'s own
  auto-dismiss — which adds `blong-action-error`; the theme also honours `.p-button-danger`. The
  hint itself (`ActionHint` → PrimeReact `OverlayPanel`, mounted at the body portal) is styled to
  the reference's brass frame + rust panel with the caret recoloured to match.
- **Typography.** The design's face is a geometric sans (circular bowls, spurless `a`, short `r`
  arm). **No font files exist in the repo and only DejaVu is installed in the container**, so
  Storybook's `preview.tsx` request for Roboto silently falls back — meaning an exact match is not
  achievable from CSS alone. Added `--wood-font`
  (`'Poppins','Montserrat','Jost','Century Gothic','Segoe UI',…`; also declared on the
  `blong-theme-wood` root marker so body-portal overlays resolve it) and matched the **metrics**
  against measured cap heights: card title 14.5 px cap ⇒ `1.45rem`, field label 9 ⇒ `0.92rem`,
  input text 10 ⇒ `1.02rem` + warm cream `#f2ddc4`, button text 11 ⇒ `1.1rem` @ weight 500.
  Line 0.70 em cap ratio was assumed for the rem maths. Colours taken from the design: title
  `#efd3b4`, label `#e9ceb5`, button gold `#dcb98a`, hint `#e0b085`.
- **Verified**: 46 files / 502 tests pass; `vite build` clean; button normal/disabled/error + hint
  compared against the reference in a 3× harness; card bevel + title/label/input compared at 2.4×;
  error state confirmed live in `editor--wood-toolbar` (`.blong-action-error` + `.p-overlaypanel`).

### Structural decisions (unchanged from the first pass)

- **Synthesis over extraction for the wood grain** (user-approved wording "extract/synthesize"):
  the design has no large clean wood patch (every wide area is interrupted by text/inputs), so the
  grain is generated procedurally with **periodic** value-noise fBm (hash lattice that wraps at the
  tile edge) → seamless by construction, then colour-matched to the sampled palette. Extracted
  values drove the tuning; the pixels are synthesised.
- **Tileable vs stretch-safe assets** (the two size-independence strategies):
  - tileable both axes: `wood-grain` (512px grayscale, `overlay`-blended so CSS supplies the hue)
    and `wood-mesh` (SVG, drawn at `4px`).
  - 1-D, uniform along the other axis → stretched with `background-size: 100% <px>`: the two
    `wood-recess-*` ramps.
  - 9-slice, stretched with `border-image`: `wood-edge` (32px slices, 12-unit arc).
- **Edges = alpha-channel image + CSS, not gradients alone.** The card bevel is a 9-slice RGBA
  frame on `.p-card::after` (`border: 16px solid transparent; border-image-*`), drawn from an SDF so
  the rim darkens and the warm facet follows the facet normal. Its **outer arc is transparent**,
  which is what lets the card's own `border-radius: 6px` supply the rounding — `border-image` is
  *not* clipped by `border-radius`, and a pseudo-element avoids the border shifting `.p-card`
  layout. **Coupling**: art arc radius × 0.5 (the 2× draw scale) must equal the CSS `border-radius`;
  `EDGE.radius = 12` ⇒ 6px.
- **Input recess = alpha ramps + `border-radius` clipping.** Ramps are `no-repeat` pinned to
  `top`/`bottom` so the occlusion thickness is constant at any input height; because background
  layers *are* clipped by `border-radius`, the recess rounds correctly without corner art.
- **Assets are inlined as base64 data URIs in a generated `wood-assets.css`**, imported before
  `wood.css` and exposed as `--wood-*` custom properties. Emitted asset files were tried and
  **reverted**: Storybook's Vite (rolldown) does not rewrite relative `url(...)` inside project CSS
  here, so they 404 — see `friction.md`. Inline also keeps `var(--x, none)` fallbacks meaningful.
  Regenerate with `npm run theme:wood-assets` (`scripts/woodAssets.mjs`); ImageMagick is used only
  as a raw-pixels→PNG encoder (with `-virtual-pixel tile` so the softening blur keeps the grain
  seamless).
- **Canvas recoloured** `#1a1613` → `#16171c`: the reference backdrop is a cool charcoal steel, not
  the old warm brown, so the walnut cards read as mounted on a cold chassis.
- **Verified**: `theme:wood-assets` regenerated; 46 files / 502 tests pass; `vite build` clean
  (419 KB CSS, 81 KB gzip); design compared side-by-side against the extracted swatches at 1:1
  *and* at 3× zoom in an isolated harness (card bevel + input recess + mesh).

## Fifth pass — Habitat checkboxes, Links datatable, Form Inspector (§W4–§W7)

Three regions of `plans/theme/wood.png` (2752×1536, **2× DPR** ⇒ ÷2 for CSS px) were measured
pixel-by-pixel rather than eyeballed, because two earlier passes had already been rejected for
"too thick" / "too low-res" eyeball readings. Measurements are crop-relative device px; the
`/tmp/wcmp/m2.mjs` helper (row/col run scans, ink bounding boxes, colour samples) was written ad
hoc and is not committed.

### Decisions

- **§W4 was deleted, not restyled.** The reference shows the Links `+ Add` / `Delete` controls are
  the *same* brass key as the header toolbars, so §W8's selector list became
  `:is(.blong-toolbar-left, .blong-toolbar-right, .blong-design-toolbar, .p-card .p-toolbar)` and
  §W4 is now a tombstone comment. This avoided a second, divergent button language.
- **Habitat group stays transparent** (explicit user instruction) even though the reference paints
  dark bands behind some columns — those read as a screenshot artifact of the app's own panel
  fill, not a deliberate per-item highlight, so `.p-highlight` no longer tints the row.
- **Checkbox is a brass *bezel*, not a brass *disc*.** Measured on the design: box **44 device =
  22 CSS px**, frame **4 device = 2 CSS px**, radius 6 device = 3 CSS px, socket rgb(34,29,26).
  The frame is *not* uniformly dark-topped: top rgb(171,145,112) `#ab9170`, flanks
  rgb(117,95,71) `#77604a`, **bottom re-lit** rgb(141,121,88) `#8d7958`, plus a hard 1px dark line
  under the floor. Selected keeps the dark socket and only lights the indicator (`#a68d63`);
  the reference's second state is a **solid amber dot** (44→22 device px wide,
  rgb(174,136,76) `#ae884c`) which PrimeReact has no class for, so it is painted on
  `.p-checkbox-box.p-indeterminate .p-checkbox-icon` via `radial-gradient` with
  `color: transparent`.
- **Row pitch is 23 CSS px** (boxes 44 device tall, stacked 46 device apart) — a **1px** grid row
  gap, not the 12px first guessed. `.p-multiselect-item` needed `min-height: 22px` or the 22px
  socket overflowed the 20px line box and the pitch came out at 21.
- **Table and rows are transparent** — sampled at x=300 the "row background" is wood
  (rgb(50–63,30–43,23–34)). The header rule is a **groove**, not a line: rgb(17,8,1) over a
  re-lit rgb(63,50,44) at the next device row, so it is `border-bottom: 1px solid #150c04` **plus**
  `box-shadow: 0 1px 0 rgba(212,190,165,0.13)`. Row separators use the same shape, far fainter.
- **Inspector = walnut plate + one continuous dark recess**, not the old brass faceplate. The
  reference's panel runs all the way to the bottom rail with a uniform ~11px wood margin, and the
  title is a *sibling* of the sections, so the plate became `display: flex; flex-direction: column`
  and `:last-child` gets `flex: 1 1 auto` — that is what makes the recess reach the bottom instead
  of stopping after the last section. Outer/inner rounding comes from
  `.blong-property-editor__title + .blong-inspector__section` (6/6/0/0) and `:last-child` (0/0/6/6)
  because there is no wrapper element to round. The plate reuses §W2's `--wood-edge` 9-slice on
  `::after`; `src/design/index.css` does **not** use `::after` on these classes (checked).
- **Type sizes were re-derived from ink bounding boxes, not from the earlier estimates**, and the
  width method was found to be ~19% pessimistic (it assumes Poppins advances) so **only the
  ascender/cap-height method was trusted**: habitat label 12 CSS-px ascender ⇒ `1.14rem`; datatable
  header 12.5 ⇒ `1.14rem` (title case, *not* uppercase); datatable rows ⇒ `1.14rem`; inspector
  title 9.5 cap ⇒ `0.95rem` uppercase; section toggle 9 asc ⇒ `0.88rem`; chevron ⇒ `0.7rem`;
  empty-state italic ⇒ `0.82rem`; JSON 8.5 cap / 12.5 pitch ⇒ `0.85rem` @ `line-height: 1.28`.
- **The fallback face is wider than the design's.** `document.fonts` confirms no Poppins is loaded
  (only Nunito Sans + primeicons); the browser falls through to a host font (Century Gothic shape —
  single-storey `a`) that measures 93 CSS px for "Shallow Reef" against the design's 83 at the same
  ascender height. **Height was matched deliberately** so a machine that *does* have Poppins gets an
  exact result; matching width instead would over-shrink everywhere else.

### Verified

- 46 files / 502 tests pass; `vite build` clean (434 KB CSS, 90 KB gzip).
- Live geometry in `editor--wood`: checkbox 22×22, item 22 tall, **row pitch 23.0** (design 23),
  toolbar button 84.1×34.0 vs the design's ≈85×35, inspector `:last-child` bottom 12.3px from the
  plate's bottom edge (design ≈11).
- Links card + inspector captured and compared against 1.75×/2.2× design crops.

## Sixth pass — toolbar key sizing, hint caret, dropdown popup

Three follow-up defects, all measured before touching CSS.

### Decisions

- **All toolbar keys are now a fixed 37 CSS px tall and the two icon keys are square.** Measured on
  `wood.png`: the save/replay keys and Browse/Open/Error all span y 8..81 device px (74–75 ⇒ 37 CSS),
  and the icon keys are square in the design. The live row was 33×39 for the icon keys vs 34 for the
  labelled ones — not uniform, not square. `height: 37px` + `box-sizing: border-box` on the shared
  `.p-button` rule, and `width: 37px` (+ inline-flex centring, `padding: 0`) on `.p-button-icon-only`.
  Verified live: 37/37, 37/37, then 108.8/94.5/92.1/95.9 × **37**. The same 37 applies to the in-card
  Links keys (design ≈36.5 there), so §W8's shared selector list stayed shared.
- **The ActionHint caret was genuinely broken, and the cause was a cascade-order bug, not my CSS.**
  PrimeReact v10 now ships `primereact.min.css` as an **explicitly empty stub** and moved the
  structural CSS into **`@layer primereact`**, injected from the component. `theme.css` is injected
  separately by `themeRegistry` and its rule
  `.p-overlaypanel:before { border: solid transparent; border-color: …; border-bottom-color: … }`
  contains **no `border-width`** — the shorthand resets it to `medium` (3px), and because the theme
  sheet lands *later in the same layer* it beats the structural `.p-overlaypanel::before {
  border-width: 10px; margin-left: -10px }`. Result: all four borders 3px → a ~2px square nub
  instead of a triangle. **Fix**: restate the caret geometry in the wood theme unlayered with
  `!important` (content/position/size/border-style/border-color/border-width + `bottom: 100%`), and
  mirror it for `p-overlaypanel-flipped`.
  Sized from the design: the notch is a **wide shallow tab — 32 × 11 CSS px** (device x 658..728,
  y 78..100), not the default 20×10, with the frame's 3px brass rim on the two slopes. Outer
  `border-width: 0 16px 11px 16px`, inner `0 13px 8px 13px` at `margin-left: -13px`, `::before`
  brass `#c6a67f` behind `::after` rust `#a04f32`. `left: calc(var(--overlayArrowLeft, 0px) +
  1.25rem)` is kept from the structural sheet so the caret still tracks the trigger; with the 10px
  panel offset the apex lands exactly on the button's bottom edge (verified: button bottom 44.0,
  panel top 54.0, caret height 10).
- **The dropdown popup now speaks the theme's language.** It was a flat `rgba(20,15,11,0.97)` panel
  with a 1px dull-brown border and a copper wash on the selected row — none of which appears
  anywhere else in the variant. It is now a **carved charcoal recess** built from the same three
  layers as §W3's inputs (`--wood-recess-top` / `--wood-recess-bottom` / `--wood-mesh`) inside the
  **same 2px brass bezel as the §W5 checkbox socket** (`#77604a` flanks, `#ab9170` top, `#8d7958`
  floor), with parchment rows and the plant's amber teak (not a flat copper wash) on the selected
  row. It is scoped on `.blong-theme-wood` because the popup is a body portal, so it **cannot**
  inherit the `.blong-app-wood .p-inputtext` rules — the dropdown's own filter field is therefore
  re-declared inside the panel rule.

### Verified

- 46 files / 502 tests pass; `vite build` clean (**437.15 KB** CSS, 90.88 KB gzip).
- Live: six toolbar keys all 37px tall, first two exactly 37×37; caret `::before` renders
  `0 15.56px 10px` brass over `::after` `0 12.22px 7.78px` rust (the odd values are device-pixel
  snapping at the reporter's `devicePixelRatio = 0.9`, not authored values — see `friction.md`);
  caret and dropdown panel both captured through a magnifying harness and compared to the design.

## Seventh pass — the caret, take two: it was geometry, not colour

The first caret fix restored *a* caret but the user still saw a patch: the rim read as a thin
outline against the frame, and the hint's frame line plus its inset seam ran straight across under
the bump. Both turned out to be geometry, and both were only visible once the caret could actually
be looked at at 16×.

### Decisions

- **The seam, not the colour.** An absolutely positioned child is measured against the panel's
  **padding box**, so the bump's rust ended 3px short of the panel's outer edge and the frame's brass
  band (`border-box` gradient) plus the panel's `inset 0 0 0 1px #3a1608` seam stayed painted across
  the notch. The panel's seam is real and correct everywhere else — measured at rgb(38,9,0) at device
  y110 — so it is not removed. Instead the rust silhouette is a bump **plus a 2.5px skirt** and its
  base is anchored with `bottom: 100%` (= the panel's *inner* edge), while the brass silhouette is
  anchored with `bottom: calc(100% + 3px)` (= its *outer* edge). The skirt is what swallows the band
  and the seam; the brass base being 3px higher is what leaves 3px of band each side and makes the
  rim read as the frame turning outward.
- **The rim was thin because the slopes were not parallel.** Traced row by row on `wood.png`, the rim
  is a constant 7 device px (3.5 CSS) *horizontally* on both slopes — which only holds if the rust
  half-width is the brass half-width minus the rim at every height. The first attempt used
  Béziers with an effective slope of ~1.55 against the rust's 1.0, so the gap closed up the flanks
  and opened at the apex. Silhouettes are now built in one coordinate system and the rust is the
  brass's curve scaled about the centre (x × 0.7, y × 0.7), so the two stay parallel by construction.
  Shape: a **bell**, not a triangle — brass 20 × 10 with a long concave fillet into the frame line and
  a broadly rounded apex, rust 14 × 9.5 with an apex 3.4px lower.
- **The interior is no longer a separate colour patch.** The rust silhouette carries the panel's own
  dot layer with `background-position: 0 100%`, anchored to its base so the mesh phase matches the
  panel's rather than restarting at the notch, and only a gentle tone ramp on top — the first attempt's
  ramp (0.44 → 0.19) made the whole bump sit in the dark end and read as a blob. Now 0.34 → 0.12.
- **Verification approach, recorded because it took several wrong turns.** `document.styleSheets`
  cannot see PrimeReact v10's styles (they live in `@layer primereact`), so the caret's geometry was
  finally found with CDP `getMatchedStylesForNode`. `page.screenshot({clip})` proved unreliable for
  this (the capture came back offset by ~13px/6px from the requested rect, so pixel maps contradicted
  the DOM), so the working method is a **CSS harness**: clone the panel into
  `.blong-theme-wood > .p-overlaypanel` at a known position with a real class chain, wrap it in
  `transform: scale(6)`, and use the built-in screenshot tool on the wrapper. For a design comparison,
  copy the reference PNG into the package so Storybook's dev server serves it, and set
  `background-size: <device>×2` + `background-position: -<device x>×2 -<device y>×2` on a div — that
  puts the 2×-DPR capture at exactly the same scale as a `scale(4)` harness. The temp PNG was removed.
- The hint is auto-dismissed by a 2000 ms `setTimeout` in `Hint.tsx`; holding it open for a live look
  is done by patching `window.setTimeout` in the page to ignore a 2000 ms delay (no code change).

### Verified

- 46 files / 502 tests pass; `vite build` clean (437.15 KB CSS, 90.88 KB gzip).
- Caret and panel captured side by side with the reference at 4 screen px per CSS px, and the live
  hint captured held open: the bump now reads as a speech-bubble notch with a uniform rim, no frame
  line or seam crossing it, and an interior that continues the panel's texture.

## Eighth pass — caret settled as SOLID brass (supersedes the two rim attempts)

**Product decision (user): "make the caret solid and match the hint border."** After two passes
building the caret as a brass *rim* around a rust interior — first with border triangles, then with a
bell-shaped brass silhouette over a matching rust one — it still read as patchy, and the rim's width
never quite matched the frame's. The instruction is to stop trying to reproduce the reference's
interior and fill the caret with the frame's brass instead.

### Decisions

- **The rim approach was abandoned deliberately, not fixed a third time.** Reproducing the reference
  exactly required the caret's interior to redraw the panel's mesh, its top occlusion and its
  `inset 0 0 0 1px #3a1608` seam at a *different background origin* from the panel's own. However
  carefully that is calibrated it leaves a visible join, and the rim's width is then a third thing to
  keep in step with the frame. Solid brass deletes that entire problem class: there is no interior to
  blend, so the frame line simply runs underneath and the caret merges with it.
- **Construction.** A single `::before`, `clip-path: path('M0,10 L8.6,1.4 Q10,0.2 11.4,1.4 L20,10 Z')`
  — 20 × 10 CSS px, i.e. the reference's notch **outline** (device x677..715, y85..105), now filled.
  The base sits at `bottom: calc(100% + 2px)`, which is 2px above the panel's *padding box* top and
  therefore **1px inside the 3px frame**, so the two overlap and no hairline can appear between them.
  Gradient `#d3b183 → #c0a075 → #a98d66` matches the frame's top-of-border tone, so the eye reads one
  cast shape. `::after` — which existed only for the inner silhouette — is switched off with
  `content: none`. The flipped mirror uses the vertically reflected path.
- Superseded reasoning, kept for context: the padding-box vs border-box anchoring problem described in
  the seventh pass is still real, it just no longer matters — nothing is anchored to the inner edge.

### Verified

- 46 files / 502 tests pass; `vite build` clean (435.92 KB CSS, 90.57 KB gzip).
- Live geometry: `::before` 20 × 10 at `bottom: 32.66px` (= the padding-box top + 2px), `::after`
  `content: none`; harness capture at 6× and the live hint held open both show the triangle merging
  into the frame with no seam.

## Ninth pass — ConfirmPopup (Reset key's "discard changes?")

The last unstyled surface in the wood variant. Reached from `editor--wood-toolbar` by editing a field
(which enables the toolbar's two icon keys) and pressing the second one, `pi pi-replay` — the Reset
key. `Editor.tsx` raises it with `confirmPopup({…})`, which renders a **`.p-confirm-popup`** at the
body portal, so like the hint it is scoped on the `blong-theme-wood` root marker.

### Decisions

- **It is a sibling of the ActionHint, not a new language.** PrimeReact gives it the *same* caret
  machinery — `.p-confirm-popup:before/after { bottom: 100%; left: calc(var(--overlayArrowLeft, 0) +
  1.25rem) }` with `border-width: 10px/8px` in `@layer primereact`, which the theme's unlayered
  `border: solid transparent` shorthand collapses to a nub exactly as it does for the hint. So it
  reuses the hint's 3px brass frame, its outset ring + drop shadow, and the **solid brass caret** from
  the eighth pass (with `::after` switched off).
- **Only the panel differs**: charcoal `#1f1f20` + the dot texture rather than the hint's rust
  `#a04f32`. Both are transient plates pinned to the button that raised them, but the hint reports a
  *failure* while this is a neutral *question*, so they should not share a body colour. The warning
  triangle is amber `#e0b085` rather than a red.
- **The two answers are compact versions of the theme's key** (`height: 30px`, 2px brass frame via the
  same `padding-box`/`border-box` double-gradient trick as §W8) rather than stock text buttons; `Yes`
  gets the brighter brass already used for the engaged toggle and the selected dropdown row, so the
  affirmative action is the one that reads as active. Needed `!important` on `background-image` to
  beat PrimeReact's `.p-button-text`.
- Sizing/typography follow §W3/§W7: message `1.02rem` in `--wood-font` on `#dcc8b6`, icon `1.4rem`,
  content `0.7/0.95rem`, footer `0/0.95/0.8rem`, buttons right-aligned.

### Verified

- 46 files / 502 tests pass; `vite build` clean (**439.07 KB** CSS, 90.83 KB gzip).
- Live: popup 486.9 × 83.1, border 2.22px (the 3px authored, snapped at the reporter's DPR 0.9),
  radius 5px, `--wood-font` resolved, message `14.28px`; accept key 48.8 × 30, radius 4;
  caret `::before` 20 × 10 with the solid path and `::after` `content: none`.
- Captured live: brass frame + dotted panel, amber warning triangle, parchment message, two brass
  keys with `Yes` brighter, and the solid caret pointing up at the Reset key.

### Popup family, complete

| Surface | Frame | Panel | Caret |
| --- | --- | --- | --- |
| `.p-overlaypanel` (ActionHint) | 3px brass `#c6a67f…` | rust `#a04f32` + dots | solid brass |
| `.p-confirm-popup` | 3px brass `#c6a67f…` | charcoal `#1f1f20` + dots | solid brass |
| `.p-dropdown-panel` | 2px brass bezel | charcoal recess + mesh | — |

## Tenth pass — focus states (last unstyled surface)

### Decisions

- **The design does show a focused field, and it is not a glow.** `wood.png`'s `Type` dropdown is
  focused: its thin dark edge widens into a ~3 CSS-px **brass bezel**, brightest along the top and
  left and falling away to the right and floor. Sampled along device columns/rows — top
  rgb(222,188,143), left rgb(194,160,112), right rgb(148,112,62), bottom rgb(166,132,84), with a dark
  outer line rgb(38,12,0) and a dark inner lip. That is the same bezel language as the §W5 socket,
  so the theme already had the vocabulary; the old rule (an `#b45309` orange border plus a `0 0 10px`
  amber halo) was inherited from the pre-redesign palette and matched nothing else.
- **Implemented as per-side border colours plus four directional `inset` shadows**, not a thicker
  border: the 1px `border` supplies the bezel's outer pixel and the insets add the second, so the
  field does not change size on focus (a wider border made the whole form jitter). The `inset 0 0 0
  3px rgba(14,8,3,0.4)` reproduces the dark lip inside the bezel, and the two depth shadows are kept.
- **The dropdown is one continuous channel.** The design shows no separate trigger panel and no
  divider — the mesh runs to the frame — and both the chevron and the clear `×` are warm cream
  (sampled rgb(220,200,175) and rgb(226,205,180)). They were still on the old palette's `#fcd34d`
  amber with `background: rgba(0,0,0,0.25)` and a gold `border-left`, so the trigger is now
  transparent/divider-less and both icons are `#dfcbb2`.
- **Two PrimeReact focus mechanics worth knowing, both discovered the hard way:**
  - `--focus-ring` looks like the knob for focus colour, and PrimeReact's *newer* themes consume it,
    but the vendored `vela-blue` **hard-codes `#93cbf9`** in every rule, so setting the token alone
    changes nothing. It is still declared (brass) for forward compatibility, but it is not the fix.
  - §W8's keys and §W5's sockets set their own `!important` `box-shadow`, which **silently
    overrode the theme's focus ring** — leaving those controls with *no* visible focus at all. This
    was a regression introduced by the earlier passes, not a pre-existing one. Fixed by repainting
    the ring with `outline` on `:focus-visible`, which nothing else in the file touches, instead of
    joining the `!important` shadow war.
- Also worth recording: `.p-dropdown`/`.p-inputtext` carry `transition: border-color 0.2s`, so a
  `getComputedStyle` read taken immediately after adding a focus class returns the **pre-transition**
  value. Two rounds of "the CSS isn't applying" were this, not the CSS.

### Verified

- 46 files / 502 tests pass; `vite build` clean (**439.65 KB** CSS, 90.95 KB gzip).
- Focused input and focused dropdown both settle to border-top `rgb(201,168,120)`, left
  `rgb(176,138,86)`, right `rgb(122,90,51)`, bottom `rgb(138,106,62)` with the dark outer ring
  `rgba(38,12,0,0.9) 0 0 0 1px`; trigger and clear icons `rgb(223,203,178)`; trigger background
  transparent and `border-left-width: 0`; checkbox `:focus-visible` outline falls back to
  `rgba(201,168,120,0.85)`.
- Captured at 4× with the focused input above the focused dropdown and an unfocused field below: the
  brass bezel reads clearly against the unfocused dark edge.

## blong-theme skill created from the wood-theme lessons (2026-09-12)

Context: after the wood variant was accepted, the user asked for a skill so future themes are
cheaper to produce ("basing the instructions on the lessons learned, the decisions and frictions
during the wood theme creation").

### Decisions

- **Workspace-scoped, not personal** — this is team knowledge that must roam with the repo, so it
  lives in `.github/skills/blong-theme/` and is registered in the `[SKILLS_DELEGATOR]` table in
  `copilot-instructions.md` (plus a routing sentence in `blong-browser`'s description and body).
- **Named `blong-theme`**, matching the `blong-<domain>` convention (`blong-i18n`, `blong-model`).
  The subject is specifically *visual variant layers*, not PrimeReact theme families; the
  description says so and routes components/pages to `blong-browser` and Storybook to
  `storybook-v10-setup`.
- **Four reference files rather than one long SKILL.md** (progressive loading): `design-match`
  (measurement + verification harnesses + environment limits), `prime-react-cascade` (v10 layer
  mechanics, focus, CDP), `textures` (tiling law, calibration, formats, delivery), `wood-theme`
  (the worked example with the measured constants). SKILL.md is 171 lines and carries the
  guardrails, procedure, variant contract and definition of done.
- **No `scripts/` in the skill.** The measurement recipes live as commands inside the references
  instead of as an untested helper script — shipping executable code that was never run would be
  worse than the recipes it would replace.
- **The wood caret decision is codified as binding** (guardrail 8: stop after two failed attempts
  at a pixel-exact detail and get an explicit product decision; never "restore" such a decision).
  This was the single most expensive lesson of the session and the likeliest to be undone by a
  future agent trying to be helpful.
- **Fixed the stale `wood.css` header while passing.** Its header still claimed inlining was
  deliberate because Storybook does not rewrite relative `url()` — the exact claim disproved and
  corrected in the generator header in the previous pass. Left alone, the two headers would have
  contradicted each other.

### Verified

- Frontmatter valid: `name` matches the folder, `description` 737 chars, no colons in the value.
- All four reference links resolve; `get_errors` clean on every skill file (the only diagnostic is
  the repo-wide `[CRITICAL_GUARDRAILS]` shortcut-reference warning shared by 14 other skills).
- Router table row aligned to the existing 102-char rows; `git check-ignore` confirms nothing in
  `.github/skills/blong-theme/` is ignored, so it is committable.

## Investigation — emitting the theme textures as files / WebP

Requested as "put the assets into webp files … may need separate addressing for Storybook and the
production build, where assets are served from `/s/`". Researched, **not yet implemented** — the
measurements change the picture enough that the choice is the user's (see `todo.md`).

**Finding 1 — the blocker that forced data URIs no longer exists.** The generator's header says
Storybook's Vite (rolldown) does not rewrite relative `url()` in project CSS so emitted files 404.
That is stale: probing with a real texture next to the stylesheet resolved `url("./__probe.png")` to
`http://localhost:6006/src/components/Theme/__probe.png` — **HTTP 200, `image/png`**. Any future
touch of `woodAssets.mjs` should correct that comment rather than repeat it.

**Finding 2 — no Vite config change is needed, and the two environments do NOT need separate
addressing.** A minimal build reproducing `defineBlongViteConfig`'s shape (`base: '/s/'`,
`assetsInlineLimit: 0`, `cssCodeSplit`) emitted `assets/grain-CQ5NWcEa.png` and
`assets/edge-Dh0T0AsO.webp` as **content-hashed files** and rewrote the stylesheet to
`url(/s/assets/…)` — a **151-byte** CSS. That is exactly the prefix `static.ts` serves
(`prefix: '/s'`, `maxAge: 1y`, `immutable`), so the suite's `base` already handles it. One relative
`url()` works in Storybook dev *and* in the `/s/` production build.

**Finding 3 — the package's own lib build INLINES assets.** Adding a 45 KB `url()` grew
`dist/assets/blong-browser.css` from 439.65 KB to 501.39 KB (+61.7 KB ≈ base64 of 45.5 KB) and emitted
no asset file — Vite library mode inlines. So `dist/` consumers keep today's behaviour: no
regression, but no win either. (The suite resolves `blong-browser` from **source** via the
`development` export condition, which is why the suite build does get files.)

**Finding 4 — WebP only wins on one of the six assets.**

| asset | today | WebP lossless | verdict |
| --- | --- | --- | --- |
| `wood-grain` 512² grey | PNG **44,104 B** | **45,488 B** | worse (+3%) |
| `wood-edge` 96² RGBA | PNG **3,189 B** | **1,842 B** | **−42%** |
| `wood-mesh` / `wood-btn-dots` | SVG 230 / 284 B | — | keep SVG (vector, crisp at any DPR) |
| `wood-recess-top/bottom` 1×8 | PNG 137 B each | — | keep PNG (WebP header ≥ payload) |

**Finding 5 — lossy WebP is not an option for the grain.** q80 → 27,184 B (−38%), but against the
original: RMSE **3.10** (the texture's own sdev is ~9.9) and, decisively, the **wrap discontinuity
rises 0.74 → 3.73** — above the mean horizontal neighbour delta (1.89), i.e. the codec turns the
seamless tile into a visible seam. Seamless tiling was a hard requirement of the original brief.

**Finding 6 — the real win is de-inlining, not the format.** 47.5 KB of images are base64'd into a
**65 KB** stylesheet that every consumer must download and parse before the theme paints. Emitted
files shrink that stylesheet to ~0.2 KB and give each texture its own cache entry under the
`immutable` 1-year policy already configured on the static plugin.

### Implemented — option (A), confirmed by the user

Chosen: **de-inline the two large textures; WebP lossless for `wood-edge` only; grain stays PNG;
tile stays 512².** Changed `scripts/woodAssets.mjs`:

- the encoder helper `png()` became `encode()` (it now writes WebP too, by extension);
- `grain` and `edge` are written to a **committed** `src/components/Theme/assets/` and referenced as
  `url("./assets/wood-grain.png")` / `url("./assets/wood-edge.webp")` via a new `fileUri()` helper;
- the two 1×8 ramps still go to scratch space in `$TMPDIR` and stay inline as data URIs, as do the
  two SVGs — a few hundred bytes each, so inlining avoids four extra requests for no real saving;
- the stale "Storybook does not rewrite relative `url()`" paragraph in the generator header was
  replaced with the measured behaviour, and the generated stylesheet's own header updated to match.

Result: `wood-assets.css` **65,448 B → 2,616 B**; `wood-edge` 3,189 → 1,842 B; the grain unchanged at
44,104 B.

**Verified in all four environments, with no config change in any of them:**

| environment | grain | edge |
| --- | --- | --- |
| Storybook dev | file, `200 image/png`, 44,104 B | file, `200 image/webp`, 1,842 B |
| suite build (`base:'/s/'`, `assetsInlineLimit: 0`) | `url(/s/assets/wood-grain-CQ5NWcEa.png)` | `url(/s/assets/wood-edge-Dh0T0AsO.webp)` |
| `storybook build` | file, `url(./wood-grain-CQ5NWcEa.png)` | inlined (1.8 KB < its 4 KB default) |
| package lib build | inlined | inlined — `dist/` consumers unchanged, CSS 439.65 → 437.85 kB |

The content hashes were identical across two independent builds, so the output is deterministic.
Note the suite's `assetsInlineLimit: 0` is what forces files there while Storybook's 4 KB default
leaves the small edge inline — that is Vite doing the right thing per environment, not a
configuration to align.

