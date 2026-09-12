# Frictions

This document is a list of frictions that have been identified during the work on the project.
Update it when something requires unexpected effort to implement or fix.

## List of unresolved frictions

_None currently._

## List of resolved frictions

Resolved by the "blong-theme skill" pass (2026-09-12):

- **The workspace markdown validator mis-resolves two link forms, producing false errors that look
  like real breakage.** (1) A cross-file fragment (`./references/textures.md#delivery`) is resolved
  as a _file path_ — it reports "File './references/textures.md#delivery' not found" — and (2) a
  same-document anchor (`#variant-contract`) is likewise resolved against the file system. Both were
  in the new skill; the fix is to reference the section by name in prose and link the file without a
  fragment. Also: a freshly created file is **not yet in the link index**, so brand-new reference
  files report "not found" for a while — the same four links resolved cleanly on the next
  `get_errors` call after an unrelated edit re-triggered analysis. Do not start moving files around
  in response to those two diagnostics.
- **`[CRITICAL_GUARDRAILS]` headings trip a "No link definition found" warning** because the bracket
  style is parsed as a shortcut reference link. This is a repo-wide convention (14 skills use it)
  and surfaces only for the file that currently has diagnostics, so it is accepted noise — do not
  "fix" it locally by renaming one skill's heading and breaking the convention.

Resolved by the "wood theme: bevel, buttons, typography" pass (2026-09-12):

- **No font files exist in the repo, and only DejaVu is installed in the container.**
  `core/blong-browser/.storybook/preview.tsx` sets `font-family: 'Roboto'`, which is _not_ installed
  either — so every Storybook screenshot in this workspace renders in DejaVu Sans, and a
  design-match against a geometric-sans mockup is not achievable from CSS alone. Added a preference
  stack (`--wood-font`) plus matched metrics (sizes/weights/colours from measured cap heights), and
  recorded the limitation. **Check `fc-list : family` before assuming a font change will be visible
  in screenshots.**
- **"Still too thick" was a falloff problem, not a peak problem.** Two passes narrowed the bevel
  band without effect because the peak position was already correct; the band simply _held_ near
  peak ~1.5 px too long. Comparing the _decay profile_ (`delta` at 1.0/1.5/2.0/2.5/3.0 CSS px)
  rather than the peak value is what finally converged it. Generalise: for any soft gradient,
  measure the profile, not a single sample.
- **A border made of two layers needs both accounted for.** (Seen twice now: the card's art rim +
  CSS border, and the button's `border-box` gradient + `inset` shadows.) Scan the design's per-pixel
  profile across the edge _and_ list every layer that paints there before tuning.
- **One asset can serve multiple states if it is translucent.** The button dot panel started as an
  opaque SVG with baked colours, so the error state would have needed a second asset; switching to
  `fill` + `fill-opacity` (an SVG presentation attribute — `rgba()` in `fill` is not reliable) let
  one texture tint from a CSS base colour per state.
- **`page.setContent()` harnesses can be silently reverted** by Storybook's HMR when the preview
  reloads (e.g. right after regenerating a CSS asset) — the screenshot then shows the story, not the
  harness. Regenerate assets _before_ building a harness, and re-apply `setContent` if the
  screenshot looks like the app.

Resolved by the "wood theme design-match" session (2026-09-11):

- **Storybook's Vite (rolldown) does NOT rewrite relative `url(...)` inside project CSS here.**
  Moving the wood textures from inline data URIs to emitted asset files (`url('./assets/x.png')`)
  looked like an obvious payload win, but the references were left untouched in the served CSS, so
  they resolved against the _page_ URL and 404'd. PrimeReact's own CSS URLs in the same bundle _are_
  rewritten, so it is specific to how this project's CSS is processed — not a general Vite
  limitation. **Reverted to inline base64 data URIs.** If this is ever retried, verify the served
  CSS in the dev server first (`curl '…/wood.css?direct'`) rather than trusting the build output.
- **Payload vs fidelity on an inlined texture.** The 2×-authored grain was 62 KB PNG ⇒ ~69 KB gzip
  added to every consumer. Quantising the grayscale to 6-bit (`-depth 6`) cut it to 35 KB with no
  visible banding (~1.3/255 per step); total generated CSS is 55 KB raw / 41 KB gzip. Prefer
  `-depth` over `-colors` for grayscale (palette PNG conversion costs more than it saves here).
- **"Still too thick" was a stacked rim, not a wide highlight.** Two rounds of narrowing the bevel
  gradient did nothing because the real cause was the _same edge painted twice_: an opaque rim
  inside the generated art plus the card's own 1px CSS `border`. Lesson: when a visual element is
  assembled from multiple layers, scan the design's **per-pixel profile** and account for _every_
  layer's contribution before tuning any single one. Also: the highlight had a `nx` term giving the
  left/right edges light the design does not have — a top-only `lit = max(0, −gy)` was correct.
- **Procedural texture tuning needs a number, not an eye.** The wood went through five iterations
  that all looked "about right" in a side-by-side yet were wrong. What converged it was measuring
  three statistics against a clean design swatch — mean tone, `sdev`, and high-frequency energy
  (`sdev(image − blur 0x1)`) — and matching those. The hf metric specifically tracked the "feels
  low-res" complaint; tone/sdev alone matched while the texture still lacked fibre.
- **An over-stretched noise octave is not "fine fibre".** `fbm(u, v, 2, 320)` over a 512 tile gives
  ~1.6-px-tall features but a ~256-px wavelength, i.e. long continuous streaks. Real fibre detail
  needs a real X frequency too. Check both axes' periods when aiming for a "fine texture" look.
- **`-strip` is required for reproducible PNG output.** ImageMagick writes a `tIME` chunk, so
  re-running the generator changed the committed base64 on every run (same length, different bytes)
  — invisible until diffed. Add `-strip` to the encoder and assert byte-identity across two runs.
- **Playwright cannot write screenshot files into the workspace.** `page.screenshot({path: …})`
  fails with `ENOENT … /workspaces/blong/…` for _any_ workspace path (the browser runs outside the
  workspace FS namespace), so element/`clip` capture-to-disk is unusable. Workaround: use the
  built-in screenshot tool (returns the image directly) and, for magnification, build an isolated
  HTML harness — `page.setContent()` with the theme CSS fetched via Vite's `?direct` query (returns
  raw CSS, unlike the default `.css` request which is a JS module) — then `zoom` the harness to
  inspect 1–2px bevel/recess detail.
- **`navigate_page` mangles query strings in this remote workspace** (`?id=x&viewMode=y` is
  rewritten to `?id%3Dx%26viewMode%3Dy`, which Storybook cannot route). Workaround: call
  `page.goto(url)` from the Playwright tool instead.
- **Procedural wood grain needed four visual iterations.** First it read as corduroy, then as
  topographic contours, then as too flat (sdev 4.6 vs the design's 9.9). The fixes, in order: lower
  the sharp `seam` exponent (6 → 2.4 → 2) and weight; reduce the domain-warp amplitude (0.32 → 0.10
  → 0.05); add a `-virtual-pixel tile -blur` pass; then, after measuring the design's contrast, add
  two heavily x-stretched fBm octaves to create the **fine stranded fibre** that actually
  characterises the reference (it is not broad bands) and roughly double all amplitudes. Lesson:
  measure `mean`/`sdev` of a clean design swatch and match those numbers instead of eyeballing.
- **The reference PNG was a 2× (DPR-2) capture**, which was not obvious from the file and caused a
  whole round of "too thick"/"low-res" corrections. Tell-tale: a 68px-tall input and a ~1045px-wide
  card (⇒ 34px input / 523px card in CSS). Always sanity-check device-vs-CSS scale from a known
  control's size before deriving metrics from a screenshot.
- **cspell / `blong-dev lint` still cannot run** (`blong-dev` is not built — see the entry below).
  Fell back to `get_errors` (clean) plus file-local `/* spell-checker: disable */`, which is the
  repo's documented convention for theme files.

Resolved by the "blong-browser theme switcher" session (2026-09-11):

- **`?inline` CSS is "Denied ID" under Vitest** — loading
  `primereact/resources/themes/*/theme.css?inline` in vitest (jsdom) fails with
  `Denied ID … pnpm/primereact@.../theme.css?inline` because the Rush pnpm store lives outside the
  vitest root, so `server.fs.allow` rejects it. It works in the real Vite app (dev `fs.allow`
  includes the workspace root; build has no restriction). Confirmed by a throwaway `vite build` (the
  CSS string inlined to 178,538 chars). Tests are unaffected because the Theme load effect
  `.catch`es the rejection — but do NOT assert on `loadThemeCss` in vitest.
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
  `kafka-topics --create --if-not-exists`, so every container start recreates an _empty_ topic — the
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
- **Getting a screenshot's _pixels_ back out of the browser cost four failed approaches** during the
  wood-theme pass, and this is likely to recur for any pixel-accurate UI work. (1)
  `run_playwright_code` has **neither `require` nor a dynamic `import()`** ("A dynamic import
  callback was not specified"), so `fs.writeFileSync` is unavailable. (2) `page.request.post` to a
  local collector fails with `Protocol error (Storage.getCookies): Method not found` — the exposed
  browser is not a full Playwright context. (3) A small Node "shot sink" listening on
  `127.0.0.1:8123` inside the container is **unreachable from the page**
  (`net::ERR_CONNECTION_REFUSED`): the integrated browser runs outside the container and only
  reaches ports VS Code has forwarded (6006 works because it is auto-forwarded; arbitrary ports are
  not). (4) Returning the image as base64 in the tool result _does_ work, but only usefully for tiny
  crops — it lands in the conversation. **What actually worked**: measure in-page
  (`getBoundingClientRect`, `getComputedStyle`, `canvas.measureText`) for numbers, and use the
  built-in screenshot tool **with a `transform: scale(2)` + `position: fixed` harness class on the
  element** to magnify the subject so the returned (downscaled) image still shows the detail. Note
  `zoom` on `.p-multiselect-*` flex panels does not behave like `transform: scale`, and an inline
  `zoom` left on an element silently corrupts every later `getBoundingClientRect` reading — clear
  it. Related: `navigate_page` still mangles query strings here; always `page.goto()`.
- **`document.fonts.check()` is useless for local-font detection** — it returned `true` for Poppins,
  Montserrat, Jost, Century Gothic, Segoe UI _and_ Roboto, none of which are installed. The
  authoritative list is `[...document.fonts].map(f => f.family)`, which showed only Nunito Sans and
  primeicons. Do not conclude a font is present from `check()`.
- **`document.styleSheets` cannot see PrimeReact v10's styles, and that cost several wrong
  guesses.** Scanning every sheet for `.p-overlaypanel:before` returned _nothing_, which sent me
  looking in the wrong files (`primereact.min.css` — which turns out to be a **153-byte empty stub**
  in v10; the theme only sets the caret _colours_) and briefly at a phantom "0.74 zoom" (see below).
  The structural rules are inside **`@layer primereact`**, so a top-level scan of `ss.cssRules`
  misses them — and the JS-injected sheets are not reliably enumerable either. **What worked**: CDP
  `CSS.getMatchedStylesForNode` (`DOM.getDocument` → `DOM.querySelector` →
  `getMatchedStylesForNode`) returns `pseudoElements[].matches[].rule`, and
  `CSS.getStyleSheetText({styleSheetId})` dumps the whole injected sheet. That is what finally
  revealed `@layer primereact { .p-overlaypanel:before { border-width: 10px } }` and the theme's
  unlayered shorthand that clobbers it. Reach for CDP _first_ when a style "isn't applying".
- **Do not trust `getComputedStyle().borderWidth` as an authored value.** The reporting browser runs
  at `devicePixelRatio = 0.9` (a page/display zoom), and Chrome snaps borders to whole device
  pixels: an authored `3px` computes back as `2.22222px`, `2px` as `1.11111px` (floored) or
  `1.7094px` depending on the box, while `10px` stays exact. I nearly chased a 0.74× "secret zoom"
  before checking `devicePixelRatio`. Font sizes and paddings are **not** snapped — only border
  widths — so compare typography numerically, but judge border weight visually.
- **A screenshot's pixels still cannot be written to disk** (see above). The one route that worked
  for a _small, zoomed_ crop: `page.screenshot({clip})` → base64 → `page.setContent()` with an
  `<img src="data:…" style="transform:scale(3)">` → then use the built-in screenshot tool on that
  harness page. Round-trips through Playwright and gets magnified for free.
- **`page.screenshot({clip})` returned content offset by ~13px horizontally and ~6px vertically from
  the rect requested**, in this Storybook iframe. That is worse than useless: three pixel-map
  experiments concluded "the caret is not rendering" when it was rendering correctly the whole time,
  and one "design comparison" compared against a completely different part of the reference image
  because I derived the crop offset from a scale that did not match the capture. The lesson is not
  "measure the offset" (it may not even be stable) but **anchor every capture to something visible
  inside it** — draw 1px marker outlines of known colour at known coordinates and locate them in the
  map before reading anything else, or use the built-in screenshot tool on an element, which has
  been consistent.
- **Vite's `/@fs/` endpoint 403s for paths outside the project root**, so the design PNGs in
  `plans/theme/` are not reachable from the Storybook page. Copying the reference into the package
  works — and `background-size: <png width>×2` + `background-position: -<x>×2 -<y>×2` on a div puts
  a 2×-DPR capture at exactly the same screen scale as a `transform: scale(4)` harness, which made a
  genuine side-by-side possible. Remember to delete the copy.
- **A generated gateway route silently collapsed to the empty key.** `blong-kukum` builds its ~70
  validations programmatically and returns them from a `validation()` export.
  `Registry._validations()` takes the route key from the **function's `.name`**, not the object key,
  because that is how `blong-mock.validation(models)` works. JavaScript's `SetFunctionName` only
  fires for a function _literal_ assigned directly to a property — assigning the result of a helper
  call (`result[method] = entry(method)`) leaves `.name === ''`, so every route collapsed onto one
  empty key and the gateway served a bogus `/rpc//` route that 401'd. Fix: set the name explicitly
  with `Object.defineProperty(fn, 'name', {value: method})`. Diagnosed by temporarily logging the
  validations map inside `Gateway.route`. **Reuse this**: when a record-driven API surface "exists
  but is unreachable", check the function names before anything else.
- **`cspell --reporter json` is not built in.** It resolves a separate package
  (`cspell-json-reporter`) and exits 1 with `Failed to load reporter json` — while printing
  **nothing** to stdout. Because the diagnostics parser found no output it reported "clean", so
  `blong-dev lint` printed `✓ cspell` and still exited 1. Now `@feasibleone/blong-lint` parses
  cspell's default `path:line:col - message` reporter and only falls back to JSON if it parses.
  **Lesson**: a wrapper that treats "no parsed diagnostics" as success hides a tool that failed to
  start; always propagate the child's exit code.
- **tap's TypeScript loader needs the `ts-node` block.** A shiny new package tsconfig with `outDir`
  but no `ts-node: {transpileOnly: true, swc: true}` made tap fail with TS5011
  (`The common source directory ... must have rootDir set`) or an opaque
  `Debug Failure. Output generation failed`, while `node file.ts` worked fine. Copying the
  `blong-kopi` template's tsconfig `ts-node` section fixed it.
- **tap compiles with the package's tsconfig**, so a package whose `tsconfig.json` omits
  `types: ["node"]` cannot resolve `node:*` or `process` even though `@types/node` is installed —
  `core/blong-lib` got away with it only because it never imports a node builtin.
- **MCP over Streamable HTTP took four attempts because every failure mode is a bare 500.** (1)
  Sharing one stateless transport across requests made the _second_ request fail — the SDK expects a
  per-request transport in stateless mode. (2) Switching to per-request servers made `tools/list`
  return `Method not found`, because the protocol requires `initialize` on the _same_ session and a
  fresh server has not been initialised. (3) The working shape is the documented stateful one: one
  `McpServer` plus one transport per `Mcp-Session-Id`. (4) Even then the tool list was empty because
  `Mcp.init()` read `gateway.describe()` during load — routes are published in `registry.start()`,
  so the read must happen inside the fastify plugin factory (which runs at `gateway.start()`).
  **Lesson**: `reply.hijack()` + a transport that writes its own response hides every error as an
  empty 500; wrap the call and log, and read the route table only after start.
- **A pattern list was silently turned into an exact match.** `routes()` appended `$` to each
  configured regex to "anchor" it, so the default `^kukum\\.` became `^kukum\\.$` and matched
  nothing — producing an MCP endpoint that answered `initialize` but advertised zero tools. Do not
  normalise regexes the caller supplied.
- **`kukum realm add` needs a single-word realm name.** The `blong-kopi` template substitutes
  `$subject` into _identifiers_ (`browser-test.ts` has a `$subject:` object key) and derives seed
  method names from `<subject><Object>Merge`. `demo-realm` produced a syntax error, `demoRealm`
  produced a realm whose test seed dispatched to the non-existent `demo.realm.thingMerge`. `demo`
  works. `blong realm <name>` has the same constraint but fails later and less clearly, so the
  `realm` primitive now rejects multi-word names up front.
- **Nested `${...}` inside a generator's template literal is a trap.** Writing a template that emits
  a literal `${current}` from inside another template literal needs `\${`, and writing
  `${${object}Id}` needs `\${${object}Id}` — but getting the backslash count wrong does not fail
  loudly: the _outer_ file still parses, and the error surfaces only when the generated artifact is
  read (`Unexpected token '{'` pointing at the generator, not the artifact). Node's type-stripper
  reports the whole generator module as unparseable, which reads like a syntax error in code that is
  fine. **Lesson**: do not escape nested placeholders. Build them at runtime
  (`'$' + '{' + ctx.object + 'Id}'`) and interpolate the result — it removes the escaping entirely
  and the generated text is verifiable in one command.
- **A regression test can encode the behaviour you are deliberately replacing.** Renaming the
  shared-file overwrite to a merge left `operations.test.ts`'s "add warns when a shared file is
  replaced" failing. The test was not wrong when written — it pinned the old contract. **Lesson**:
  when a failing test describes the exact behaviour being changed, rewrite it to the new contract
  plus a case for the old one under `--replace`, rather than deleting it.
- **`tap`'s positional file globs bypass its own `exclude` rules.** `blong-dev test` passes
  `'*.test.ts' '**/*.test.ts'` as positional test files, and tap then ignores both its default
  excludes (folders named `dist`, `fixture`, `fixtures`) and an explicit `--exclude=…` — so a
  package's generated fixture directory gets run as part of the package suite. Four things were
  tried before accepting it: `--exclude` after the globs, `--exclude` before them, a negated glob
  (`'!test/fixture/**'`), and dropping the globs entirely (which works, but tap's default `include`
  then also picks up Playwright specs and layer files that merely live under `test/`). Fixing it
  properly means `blong-dev test` honouring a package-level tap config instead of hard-coding globs
  — a shared-tool change with repo-wide blast radius.
- **A generator bug that only running the artifact can find.** The `schema`/`table` template emitted
  `constraints: {primaryKey: ['xId'], index: [['xName']]}` — array shapes the framework does not
  accept. It does not fail at generation, at typecheck, or at import: it fails at _table creation_
  with `alter table \`shop_gadget\` add index
  \`shop_gadget_idx_0\`(\`0\`)`, i.e. an index over a column named `0`. The canonical shape is object-keyed (`unique:
  {name: {}}`, `index: {column: {}}`), as `blong-kopi`'s own `meta/type/schema.ts` shows.
- **`realm add` is not idempotent over a realm it has already extended.** `planTemplate` rewrites
  every template file, so regenerating the fixture in place reverted the composed additions
  (`index.ts`, `browser-test.ts`, `meta/db/db.ts`, the Playwright spec) before re-applying them. The
  property worth asserting is therefore _reproducibility_ — generate into a scratch directory and
  compare with the committed fixture — not in-place idempotency. Two other gaps surfaced the same
  way: the generated test seed never granted the entity's actions in the realm's RBAC seed (so the
  browser leg was denied 403 through the gateway), and non-code files (`.yaml`, `.sql`) were treated
  as hand-written because the generated marker is a TypeScript sentinel — which meant a seed could
  never be refreshed.
- **A screenshot baseline captured live data, and it only showed up on inspection.** The generated
  Playwright spec called `browseModel` without `searchText`, so the browse screenshot showed the
  whole table — including the `ENT-TEST-<timestamp>` rows the tap suites had just created. The test
  passed when the baseline was written and would have failed on the next run, which is the worst
  shape a visual test can have. **Lesson**: a generated `browseModel` call must pin a seeded marker
  (the realm template does: `searchText: 'Sample $Object One'`); a baseline with anything
  time-dependent in it is not a baseline. The seed row name is now produced by one shared helper so
  the seed and the spec cannot drift apart.
- **A new intent's config silently lost to a later `default` block.** The `cli` intent's
  `gateway: false` / `rpcServer: false` had no effect: `blong cli` still logged
  `Server listening at http://127.0.0.1:…` and `gateway listening at random port …`. Two
  investigations went nowhere first — `grep` found no `port: 0` anywhere, `ut-function.merge`
  handles `false` correctly, and `ConfigRuntime.mergeConfigs` showed `loaded.gateway=undefined`
  (blong-config contributes nothing; `~/.blong_devrc` explains only the `watch.logLevel` that _did_
  apply). The truth came from printing the `configs` array itself: the **standalone-realm wrapper**
  declares `rpcServer: {port: 0}` / `gateway: {port: hasBrowser ? 8080 : 0}` in its `default` block,
  and that block is pushed _after_ the framework's intent blocks — so it wins. **Lesson**: when an
  intent's config does not take effect, check the order of `loadedConfigs.push(...)` calls, not just
  the merge function; `default` is not a low-precedence name, it is just whichever `default` block
  is pushed last.
- **Killing a test run mid-flight destroyed the fixture and produced three cascading failures.**
  `e2e.test.ts` regenerates `test/fixture/e2e-realm/` by deleting the tree first, so a `SIGTERM`
  part-way through leaves it empty — and because tap also collects that fixture's own
  `index.test.ts` as part of the package suite, the next run crashed with
  `Cannot find module '…/test/fixture/e2e-realm/index.test.ts'`, plus failures in `e2e.test.ts`
  itself (`time=410262ms`) and `index.test.ts`. **Lesson**: the fixture is destroyed and rebuilt
  while the runner may be reading it — a latent race, not just the redundancy noted earlier. Fix it
  before building anything else on the fixture.

## Type errors are invisible to the test runner

Adding the `cli` intent and the `exit` config key cost three extra debug cycles, all of them purely
about types. **Cause**: `tap` transpiles TypeScript without typechecking, so a suite can be fully
green (261 pass) while `blong-dev lint` reports 3–4 `tsc` errors. The intent tables in
`core/blong-gogo/src/load.ts` are TypeScript literals typed against `IBaseConfig` /
`IActivationConfig`, which had never been exercised with a _new_ intent name or an unknown key —
`IActivationConfig<T>` enumerated only the five built-in names, and `IBaseConfig` is
`additionalProperties: false`. **Lesson**: after touching anything in `load.ts` or `types.ts`, run
`blong-dev lint` in `core/blong-gogo`; a green `blong-dev test` proves nothing about compilation.
Second, smaller trap: `TOptional<T>` makes a key optional at the top level of a `TObject` shape but
**not** inside a nested `TObject` shape — keys there resolve as required, which is why
`watch: {enabled: false}` failed to typecheck no matter how the inner keys were annotated. Prefer a
permissive `TObject` for config bags like `watch`.

## A server-only expression in a shared module breaks the browser bundle

Adding `exit: Boolean(process.env.CI)` to `load.ts` cost a full debug cycle and made the whole
Playwright leg fail — every browser test timed out at 30s and the suite took **410s** instead of
21s. `load.ts` is shared by both platforms (Vite serves the very same file to the browser), and
`process` does not exist in a browser, so the realm never finished loading:
`ReferenceError: process is not defined at loadRealm`. **Lesson**: before using `process`, `fs`,
`os` or any Node built-in in `load.ts` (or anything else the browser bundle reaches), ask which
platforms import it. Route it through an optional chain (`globalThis.process?.env?.['X']`) — and put
it in a _function_, not a module constant, so tests that set `process.env.X` at runtime still work.
Grep for existing `process.env` uses first: `runServer.ts`, `loadServer.ts`, `Gateway.ts` and
`RestFs.ts` are server-only, which is why they were fine and this was not.

## A test that scans page 1 of an unbounded table fails once the table grows

The fixture's `widget find` failure chased across a whole session had nothing to do with
master-detail entities, PK types or the framework. The generated test did
`find({paging: {pageNumber: 1, pageSize: 100}})` and asserted the row it had just added was in the
result. Rows come back in ascending PK order and the table is **never cleaned up**, so once it
passed 100 rows the new row moved to page 2 and the assertion failed. `gadget` passed only because
its table still had 96 rows — it was racing the same bug. Two things made this hard to see: the
failure is data-dependent (it appears only after N runs, so it reads as flakiness), and I first
queried `e2e-realm-kalin`, which is a **stale database from an older naming scheme**; the real one
is `blong-e2e-kalin`, derived from the suite name passed to `load()`. **Lesson**: when a generated
test asserts membership in a `find` result, filter by the unique value the test just created
(`filterBy: {name}`) — never page an unbounded table. Two probes settled it in minutes once I
printed `typeof` and the id range instead of reasoning from the schema.

## A "verified (do not re-derive)" framework note was wrong

The plan carried a "Verified mechanics (do not re-derive)" section asserting that `this` inside a
`library()` function is the port, so `this.platform`/`this.registry` work "with no framework
change". It was derived from reading `layerProxy.ts:68-83` and seeing `fn.apply(port, params)` — but
that call sits behind a `??`, so it only runs in the _not-yet-attached_ fallback path. For a
normally attached library function the proxy returns the raw function and `this` is the **lib
object**. **Lesson**: an inferred mechanic labelled "verified" is still an inference — and this one
cost a throwaway probe (a temp `library()` file whose handler threw `JSON.stringify(...)` of what
`this` was, so the value surfaced through the gateway's error message). Do that probe whenever a
plan decision rests on a claim about `this`, `arguments`, proxy behaviour, or load order, because
those are exactly the places where reading the happy path gives the wrong answer. The probe also
revealed the fix was small (`platform`/`registry` onto `lib`) rather than the design change the
wrong note implied.

## kukum collapse — frictions

- `blong-dev test` runs tap in parallel, so `e2e.test.ts` (which deletes and regenerates
  `test/fixture/e2e-realm/`) races the fixture's own `index.test.ts`. One run reported
  `Cannot find module '.../browser-test.ts'` and "no tests found" while the file was present on
  disk; the next run was green. When the fixture test fails, re-run before investigating — and `ls`
  before believing the message.
- Three edit anchors failed on text I had inferred rather than read: the box-drawing `// ──` runs,
  and a doc comment I assumed was wrapped over two lines but was on one. Read the exact lines; do
  not reconstruct them from a summary.
- A structural copy of an exported type can fail where the real type compiles:
  `DiagnosticReport.diagnostics` only type-checks against `@feasibleone/blong-lint`'s `Diagnostic`,
  not a loose `{[key: string]: unknown}` shape (index-signature check).
- Moving a module changes `import.meta.url` depth: `REALM_TEMPLATE_ROOT` is `../blong-kopi` from the
  package root, but was `../../blong-kopi` from `operations/`.
- Renaming a binding to `find`/`get`/`tree` collides with local variables of the same name in tests
  (`const find = build(find)` is a self-reference). Renamed the local.

## Realm CLI extraction — frictions

- `Cannot find module './package.json'` from a realm's `server.ts`: the loader imports a
  `package.json` beside the realm entry, so every realm folder needs one. The error names the
  consumer, not the missing convention — `blong-eip` has `eip/package.json` for exactly this reason.
- `this` inside a `library()` function: `const {textInput} = lib; textInput(params)` throws
  `Cannot read properties of undefined (reading 'platform')`. The function reads the platform off
  `this`, and destructuring strips the receiver. Call it as a member. Same trap as the earlier kukum
  handler-map bug, and it is now called out in `patterns/cli.md`.
- A per-intent activation block whose shape differs from `default` fails to type-check unless the
  orchestrator is given a generic (`orchestrator<Record<string, unknown>>(…)`). kukum had this for
  the same reason; it is not obvious from the error.
- `tap`/spawn tests: `--output` defaults on `process.stdout.isTTY`, so a piped child gets JSON where
  a terminal gets text. Tests must name the format. Cost one debugging cycle.
- Component logs go to **fd 1 directly** (pino), not through `process.stdout.write`, so the CLI's
  stdout redirect does not catch them and they land in the result. Config, not redirection, is what
  quietens them.

## blong-lint / blong-dev cycle

- The cycle was invisible until `rush update` re-resolved the graph with pnpm 10.33.2 (the version
  rush.json pins); the old dependency set predates the check. Worth remembering that a pnpm WARN of
  this kind reports a _structural_ problem, not a new one.
- The dependency existed only for two `npm run` scripts (`blong-dev lint`, `blong-dev test`), so
  `grep` for the package name in `*.ts` finds nothing — a package-level cycle can hide entirely in
  `package.json` scripts.
- `core/blong-lint` has no test files at all, yet declares `ci-test`. Both the old and the new
  script exit 1 for it; the "no valid test files found" message comes from tap, and it is easy to
  mistake for a regression introduced by changing the script.
- `tools/blong-dev` has no `ci-test` script (`npm run ci-test` errors) and no eslint config (so
  `blong-dev lint` there prints two ✓ lines, not three) — both are normal, neither is a failure.

## Playwright "text/css" MIME error (2026-09-12)

- The browser error alone is misleading: the fix lives on the server side. In Vite 8, a
  `?inline`/`?url`/`?raw` request is only transformed when the resolved file passes the dev fs
  access check (`checkLoadingAccess` on both the clean URL and the query-bearing URL). A file that
  is reachable only through the module graph (e.g. `primereact` theme CSS under the pnpm store)
  falls through to the raw static handler and is served with its real MIME type, which the browser
  rejects for a module script.
- Finding this required unpacking the Playwright `trace.zip` and parsing `0-trace.network` to get
  the exact failing URL — the test's HTML/diff output only shows the visual consequence.
- The menubar-height half of the failure was invisible in the screenshot diff (it looked like a
  global 1px shift). Measuring the pixel rows and, finally, the live DOM (`.p-menubar-end` computed
  `display: block`) was the only way to identify the stacked `menubarEnd` widgets.
