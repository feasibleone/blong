# Frictions

This document is a list of frictions that have been identified during the work on the project.
Update it when something requires unexpected effort to implement or fix.

## List of unresolved frictions

_None currently._

## List of resolved frictions

Resolved by the "blong-theme skill" pass (2026-09-12):

- **The workspace markdown validator mis-resolves two link forms, producing false errors that look
  like real breakage.** (1) A cross-file fragment (`./references/textures.md#delivery`) is resolved
  as a *file path* — it reports "File './references/textures.md#delivery' not found" — and (2) a
  same-document anchor (`#variant-contract`) is likewise resolved against the file system. Both
  were in the new skill; the fix is to reference the section by name in prose and link the file
  without a fragment. Also: a freshly created file is **not yet in the link index**, so brand-new
  reference files report "not found" for a while — the same four links resolved cleanly on the next
  `get_errors` call after an unrelated edit re-triggered analysis. Do not start moving files around
  in response to those two diagnostics.
- **`[CRITICAL_GUARDRAILS]` headings trip a "No link definition found" warning** because the
  bracket style is parsed as a shortcut reference link. This is a repo-wide convention (14 skills
  use it) and surfaces only for the file that currently has diagnostics, so it is accepted noise —
  do not "fix" it locally by renaming one skill's heading and breaking the convention.

Resolved by the "wood theme: bevel, buttons, typography" pass (2026-09-12):

- **No font files exist in the repo, and only DejaVu is installed in the container.**
  `core/blong-browser/.storybook/preview.tsx` sets `font-family: 'Roboto'`, which is *not*
  installed either — so every Storybook screenshot in this workspace renders in DejaVu Sans, and a
  design-match against a geometric-sans mockup is not achievable from CSS alone. Added a
  preference stack (`--wood-font`) plus matched metrics (sizes/weights/colours from measured cap
  heights), and recorded the limitation. **Check `fc-list : family` before assuming a font change
  will be visible in screenshots.**
- **"Still too thick" was a falloff problem, not a peak problem.** Two passes narrowed the bevel
  band without effect because the peak position was already correct; the band simply *held* near
  peak ~1.5 px too long. Comparing the *decay profile* (`delta` at 1.0/1.5/2.0/2.5/3.0 CSS px)
  rather than the peak value is what finally converged it. Generalise: for any soft gradient,
  measure the profile, not a single sample.
- **A border made of two layers needs both accounted for.** (Seen twice now: the card's art rim +
  CSS border, and the button's `border-box` gradient + `inset` shadows.) Scan the design's
  per-pixel profile across the edge *and* list every layer that paints there before tuning.
- **One asset can serve multiple states if it is translucent.** The button dot panel started as an
  opaque SVG with baked colours, so the error state would have needed a second asset; switching to
  `fill` + `fill-opacity` (an SVG presentation attribute — `rgba()` in `fill` is not reliable) let
  one texture tint from a CSS base colour per state.
- **`page.setContent()` harnesses can be silently reverted** by Storybook's HMR when the preview
  reloads (e.g. right after regenerating a CSS asset) — the screenshot then shows the story, not
  the harness. Regenerate assets *before* building a harness, and re-apply `setContent` if the
  screenshot looks like the app.

Resolved by the "wood theme design-match" session (2026-09-11):

- **Storybook's Vite (rolldown) does NOT rewrite relative `url(...)` inside project CSS here.**
  Moving the wood textures from inline data URIs to emitted asset files (`url('./assets/x.png')`)
  looked like an obvious payload win, but the references were left untouched in the served CSS, so
  they resolved against the *page* URL and 404'd. PrimeReact's own CSS URLs in the same bundle *are*
  rewritten, so it is specific to how this project's CSS is processed — not a general Vite
  limitation. **Reverted to inline base64 data URIs.** If this is ever retried, verify the served
  CSS in the dev server first (`curl '…/wood.css?direct'`) rather than trusting the build output.
- **Payload vs fidelity on an inlined texture.** The 2×-authored grain was 62 KB PNG ⇒ ~69 KB gzip
  added to every consumer. Quantising the grayscale to 6-bit (`-depth 6`) cut it to 35 KB with no
  visible banding (~1.3/255 per step); total generated CSS is 55 KB raw / 41 KB gzip. Prefer
  `-depth` over `-colors` for grayscale (palette PNG conversion costs more than it saves here).
- **"Still too thick" was a stacked rim, not a wide highlight.** Two rounds of narrowing the
  bevel gradient did nothing because the real cause was the *same edge painted twice*: an opaque
  rim inside the generated art plus the card's own 1px CSS `border`. Lesson: when a visual element
  is assembled from multiple layers, scan the design's **per-pixel profile** and account for *every*
  layer's contribution before tuning any single one. Also: the highlight had a `nx` term giving the
  left/right edges light the design does not have — a top-only `lit = max(0, −gy)` was correct.
- **Procedural texture tuning needs a number, not an eye.** The wood went through five iterations
  that all looked "about right" in a side-by-side yet were wrong. What converged it was measuring
  three statistics against a clean design swatch — mean tone, `sdev`, and high-frequency energy
  (`sdev(image − blur 0x1)`) — and matching those. The hf metric specifically tracked the
  "feels low-res" complaint; tone/sdev alone matched while the texture still lacked fibre.
- **An over-stretched noise octave is not "fine fibre".** `fbm(u, v, 2, 320)` over a 512 tile gives
  ~1.6-px-tall features but a ~256-px wavelength, i.e. long continuous streaks. Real fibre detail
  needs a real X frequency too. Check both axes' periods when aiming for a "fine texture" look.
- **`-strip` is required for reproducible PNG output.** ImageMagick writes a `tIME` chunk, so
  re-running the generator changed the committed base64 on every run (same length, different bytes)
  — invisible until diffed. Add `-strip` to the encoder and assert byte-identity across two runs.
- **Playwright cannot write screenshot files into the workspace.** `page.screenshot({path: …})`
  fails with `ENOENT … /workspaces/blong/…` for *any* workspace path (the browser runs outside the
  workspace FS namespace), so element/`clip` capture-to-disk is unusable. Workaround: use the
  built-in screenshot tool (returns the image directly) and, for magnification, build an isolated
  HTML harness — `page.setContent()` with the theme CSS fetched via Vite's `?direct` query (returns
  raw CSS, unlike the default `.css` request which is a JS module) — then `zoom` the harness to
  inspect 1–2px bevel/recess detail.
- **`navigate_page` mangles query strings in this remote workspace** (`?id=x&viewMode=y` is
  rewritten to `?id%3Dx%26viewMode%3Dy`, which Storybook cannot route). Workaround: call
  `page.goto(url)` from the Playwright tool instead.
- **Procedural wood grain needed four visual iterations.** First it read as corduroy, then as
  topographic contours, then as too flat (sdev 4.6 vs the design's 9.9). The fixes, in order:
  lower the sharp `seam` exponent (6 → 2.4 → 2) and weight; reduce the domain-warp amplitude
  (0.32 → 0.10 → 0.05); add a `-virtual-pixel tile -blur` pass; then, after measuring the design's
  contrast, add two heavily x-stretched fBm octaves to create the **fine stranded fibre** that
  actually characterises the reference (it is not broad bands) and roughly double all amplitudes.
  Lesson: measure `mean`/`sdev` of a clean design swatch and match those numbers instead of
  eyeballing.
- **The reference PNG was a 2× (DPR-2) capture**, which was not obvious from the file and caused a
  whole round of "too thick"/"low-res" corrections. Tell-tale: a 68px-tall input and a ~1045px-wide
  card (⇒ 34px input / 523px card in CSS). Always sanity-check device-vs-CSS scale from a known
  control's size before deriving metrics from a screenshot.
- **cspell / `blong-dev lint` still cannot run** (`blong-dev` is not built — see the entry below).
  Fell back to `get_errors` (clean) plus file-local `/* spell-checker: disable */`, which is the
  repo's documented convention for theme files.

Resolved by the "blong-browser theme switcher" session (2026-09-11):

- **`?inline` CSS is "Denied ID" under Vitest** — loading `primereact/resources/themes/*/theme.css?inline`
  in vitest (jsdom) fails with `Denied ID … pnpm/primereact@.../theme.css?inline` because the Rush
  pnpm store lives outside the vitest root, so `server.fs.allow` rejects it. It works in the real
  Vite app (dev `fs.allow` includes the workspace root; build has no restriction). Confirmed by a
  throwaway `vite build` (the CSS string inlined to 178,538 chars). Tests are unaffected because the
  Theme load effect `.catch`es the rejection — but do NOT assert on `loadThemeCss` in vitest.
- **`blong-dev` CLI not built** — `npm run ci-lint` (`blong-dev lint`) fails with
  `Cannot find module .../blong-dev/bin/blong-dev.ts`, so eslint/cspell could not be run from the
  package. Fell back to the VS Code `get_errors` diagnostics (clean) + file-local cspell disables.
  Needs a `rush build` of `tools/blong-dev` to run the real lint locally.
- **`create_and_run_task` cannot write tasks.json** — it errors with `EACCES … mkdir '/workspaces'`
  for any `workspaceFolder`. Workaround: hand-edit the workspace `.vscode/tasks.json` with
  `replace_string_in_file` and run via `run_task`, then revert the file.

Resolved by the "Commander polish" session (2026-07-09):

- **Commander grew to ~18k px with a tall table (573 MySQL rows) after adding the Splitter.** The
  `height: 100%` chain resolved against content because `.p-tabview` (Portal.css) had `flex-grow: 1`
  but no `min-height: 0` — flex `min-height: auto` blocked shrinking below content, so the tabview,
  tab panel, `.commander-page`, and Commander all grew to the table's height. Also the inner
  tree/content divs inside `SplitterPanel` collapsed to content width (panels are
  `display:flex; flex-direction:row`). ~25 min of measuring ancestor heights via
  `getBoundingClientRect` walks; root cause = missing `min-height: 0` + missing `flex:1` on panel
  children. Fixed in Portal.css + commanderBrowsePage + Commander splitter styles.

Resolved by the "Commander bug-fix pass" session (2026-08-23):

- **`{parent.X}` leaf-open templates never resolved** — `commander.node.get` only received the leaf
  node, so `{parent.path}` (vault) resolved to empty → 404 "Vault Secret Not Found"; S3
  `{parent.bucket}` only worked because the adapter fell back to a default bucket. Root cause: the
  parent's fields weren't carried to the leaf. Fix: stamp the direct parent's fields as
  `parent.<field>` on every row (`withParentContext`). ~20 min across vault/S3/mongo/k8s.
- **knex `table.list` double-prefixed table names** — `access.{tableName}.find` with
  `tableName='access_user'` built `access_access_user`. Also listed junk `$subject_*` tables and
  every visible schema's tables. Fix: filter to the connected DB + `{subject}_%` + junk names, and
  strip the `{subject}_` prefix so `{tableName}` is the object name.
- **PrimeReact DataTable kept stale body rows** after switching from a 200+ row table to a small one
  (state was correct but the DOM showed old rows — "keeps showing db data while changing columns").
  Fix: remount the DataTable per navigation via `key={selected.key}` + a `loadTokenRef` race guard.
  ~15 min of fiber-tree inspection (`__reactFiber$` state) to confirm rows state was correct while
  the DOM was stale.
- **tap snapshot ordering** — the mongodb adapter's `{...doc, id}` appended `id` at the END, so a
  manually sed-inserted `id` right after `_id` failed tap's order-sensitive snapshot compare. Use
  `TAP_SNAPSHOT=1` to regenerate, then revert unrelated snapshots (it reformats ALL of them).

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
- **`get_errors` reported a stale `Property 'retry' does not exist on type '{}'` on `knex.ts(384)`
  long after `tsc -p tsconfig.json` passed with exit 0.** The language-server cache lags multi-file
  type edits (types.ts added `retry` but the Problems panel kept an old module graph). Lesson: when
  the Problems panel disagrees with a clean package `tsc --noEmit -p tsconfig.json` run, trust the
  `tsc` run — do not chase phantom errors.
- **A folder-only refactor surfaced three classes of relative-path coupling that a `core/<pkg>` text
  grep does NOT catch**, each found only by running the tooling: (1) every package's
  `eslint.config.mjs` did `import config from '../eslint/config.mjs'` — 25 files broke the moment
  `eslint` moved to `tools/eslint`; (2) `tools/blong-graph/tsconfig.json` extended a sibling
  tsconfig by relative path; (3) `common/git-hooks/pre-commit` invoked
  `core/blong-dev/bin/blong-dev.ts` by path. Lesson: after moving packages, run `rush ci-lint` AND
  `rush build` before declaring done, and grep for `../<pkg>` (not just `core/<pkg>`) repo-wide.
- **`blong-dev lint` failing on one package masked that lint was the only thing catching the
  breakage** — `rush build` had already passed clean, because `eslint.config.mjs` is not part of any
  build graph. Do not treat a green build as sufficient for a path-only refactor.
- **The edit tool added a trailing comma when the original JSON line had none**, producing invalid
  JSON in `tools/blong-graph/tsconfig.json`. The malformed config made TypeScript fall back to the
  base config's `rootDir` and emit a cascade of TS6059 errors that looked like a path-mapping bug.
  `blong-dev lint` gave the decisive clue (`Parsing error: Unexpected token RBrace`). Lesson: after
  editing JSON/JSONC, re-read or parse the file to confirm punctuation.
- **`test/blong-int-adapter/s3.test.ts` failed with `NoSuchBucket` for `blong-integration`, and the
  terminal showed only `Alarm clock` / exit 142 — easy to misread as a refactor regression.**
  Neither the test nor the restructure was at fault. `minio-deployment.yaml` declares no
  `volumeMounts`/`persistentVolumeClaim`, so `/data` is container-ephemeral (unlike mysql/mongodb/
  keycloak, which do have PVCs). The k3d cluster restarted at 11:12:08 today (all backend pods show
  `RESTARTS 1`); the MinIO container had died uncleanly (Exit 255, Reason `Unknown`) and came back
  with an empty `/data` (only `.minio.sys`). The one-shot `minio-bucket-init` Job was already
  `Complete` from 2d19h earlier, so the bucket was never recreated. **Fix: re-run the documented
  init job** —
  `kubectl -n blong-integration delete job minio-bucket-init && kubectl apply -k test/integration/`
  — after which the test passes 15/15. Lesson: exit 142 is SIGALRM, not a process error; here it
  means the harness timeout fired because the first failing group left
  `Watch: operation "run test groups" still running (progress 1/3)` hanging, which buried the real
  error. When an integration test fails right after a cluster restart, check backend data
  (`kubectl exec deploy/minio -- ls /data`) before suspecting the test.
- **Making the Kafka seed Job idempotent took three attempts because the obvious guards are wrong.**
  (1) Guarding on "does topic `blong-integration` exist?" looks right but silently skips re-seeding
  after a reboot: `kafka-deployment.yaml` has a `lifecycle.postStart` hook that runs
  `kafka-topics --create --if-not-exists`, so every container start recreates an *empty* topic — the
  topic exists while the seed message is gone. The guard must test for the MESSAGE. (2) Probing with
  a plain `kafka-console-consumer --from-beginning --timeout-ms 3000` returned "0 messages" even
  though messages were there: it exited with `TimeoutException`, because `--timeout-ms` maps to the
  request timeout and a group-based consumer must first wait out the broker's
  `group.initial.rebalance.delay.ms` (default 3000ms) — so the probe looked like "no seed" and
  seeded a duplicate on every run. (3) `kafka-console-consumer --partition 0 --offset 0` reads the
  partition directly with no consumer group and is therefore fast and deterministic — that is the
  form used in the Job now. Verified both ways: after `rollout restart deployment/kafka` (empty
  topic, i.e. the real post-reboot state) the Job seeds exactly one message, and running it again
  logs "Seed message already present" with the count still 1.
- **Getting a screenshot's *pixels* back out of the browser cost four failed approaches** during the
  wood-theme pass, and this is likely to recur for any pixel-accurate UI work.
  (1) `run_playwright_code` has **neither `require` nor a dynamic `import()`** ("A dynamic import
  callback was not specified"), so `fs.writeFileSync` is unavailable. (2) `page.request.post` to a
  local collector fails with `Protocol error (Storage.getCookies): Method not found` — the exposed
  browser is not a full Playwright context. (3) A small Node "shot sink" listening on
  `127.0.0.1:8123` inside the container is **unreachable from the page** (`net::ERR_CONNECTION_REFUSED`):
  the integrated browser runs outside the container and only reaches ports VS Code has forwarded
  (6006 works because it is auto-forwarded; arbitrary ports are not).
  (4) Returning the image as base64 in the tool result *does* work, but only usefully for tiny
  crops — it lands in the conversation.
  **What actually worked**: measure in-page (`getBoundingClientRect`, `getComputedStyle`,
  `canvas.measureText`) for numbers, and use the built-in screenshot tool
  **with a `transform: scale(2)` + `position: fixed` harness class on the element** to magnify the
  subject so the returned (downscaled) image still shows the detail. Note `zoom` on
  `.p-multiselect-*` flex panels does not behave like `transform: scale`, and an inline `zoom`
  left on an element silently corrupts every later `getBoundingClientRect` reading — clear it.
  Related: `navigate_page` still mangles query strings here; always `page.goto()`.
- **`document.fonts.check()` is useless for local-font detection** — it returned `true` for Poppins,
  Montserrat, Jost, Century Gothic, Segoe UI *and* Roboto, none of which are installed. The
  authoritative list is `[...document.fonts].map(f => f.family)`, which showed only Nunito Sans and
  primeicons. Do not conclude a font is present from `check()`.
- **`document.styleSheets` cannot see PrimeReact v10's styles, and that cost several wrong guesses.**
  Scanning every sheet for `.p-overlaypanel:before` returned *nothing*, which sent me looking in the
  wrong files (`primereact.min.css` — which turns out to be a **153-byte empty stub** in v10; the
  theme only sets the caret *colours*) and briefly at a phantom "0.74 zoom" (see below). The
  structural rules are inside **`@layer primereact`**, so a top-level scan of `ss.cssRules` misses
  them — and the JS-injected sheets are not reliably enumerable either.
  **What worked**: CDP `CSS.getMatchedStylesForNode` (`DOM.getDocument` → `DOM.querySelector` →
  `getMatchedStylesForNode`) returns `pseudoElements[].matches[].rule`, and
  `CSS.getStyleSheetText({styleSheetId})` dumps the whole injected sheet. That is what finally
  revealed `@layer primereact { .p-overlaypanel:before { border-width: 10px } }` and the theme's
  unlayered shorthand that clobbers it. Reach for CDP *first* when a style "isn't applying".
- **Do not trust `getComputedStyle().borderWidth` as an authored value.** The reporting browser runs
  at `devicePixelRatio = 0.9` (a page/display zoom), and Chrome snaps borders to whole device pixels:
  an authored `3px` computes back as `2.22222px`, `2px` as `1.11111px` (floored) or `1.7094px`
  depending on the box, while `10px` stays exact. I nearly chased a 0.74× "secret zoom" before
  checking `devicePixelRatio`. Font sizes and paddings are **not** snapped — only border widths — so
  compare typography numerically, but judge border weight visually.
- **A screenshot's pixels still cannot be written to disk** (see above). The one route that worked
  for a *small, zoomed* crop: `page.screenshot({clip})` → base64 → `page.setContent()` with an
  `<img src="data:…" style="transform:scale(3)">` → then use the built-in screenshot tool on that
  harness page. Round-trips through Playwright and gets magnified for free.
- **`page.screenshot({clip})` returned content offset by ~13px horizontally and ~6px vertically from
  the rect requested**, in this Storybook iframe. That is worse than useless: three pixel-map
  experiments concluded "the caret is not rendering" when it was rendering correctly the whole time,
  and one "design comparison" compared against a completely different part of the reference image
  because I derived the crop offset from a scale that did not match the capture. The lesson is not
  "measure the offset" (it may not even be stable) but **anchor every capture to something visible
  inside it** — draw 1px marker outlines of known colour at known coordinates and locate them in the
  map before reading anything else, or use the built-in screenshot tool on an element, which has been
  consistent.
- **Vite's `/@fs/` endpoint 403s for paths outside the project root**, so the design PNGs in
  `plans/theme/` are not reachable from the Storybook page. Copying the reference into the package
  works — and `background-size: <png width>×2` + `background-position: -<x>×2 -<y>×2` on a div puts a
  2×-DPR capture at exactly the same screen scale as a `transform: scale(4)` harness, which made a
  genuine side-by-side possible. Remember to delete the copy.
