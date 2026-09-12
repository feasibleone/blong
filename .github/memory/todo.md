# Todo

Potential unfinished, deferred or future tasks spotted during implementation.

## List of incomplete tasks

- sort metrics.json
- lib unit tests - allow easy testing of library() functions
- skills as tools
- flow diagram for method calls
- component diagram for a suite
- https://github.com/tt-a1i/archify
- https://github.com/trailhq/Graft
- time bound debug tokens
- match and mask
- markdown lint
- transient form fields
- table widget dual role / no singleton
- stable keys
- remove axios
- playwright test runner for backend tests
- telemetry
- blong-kustomize
- same queries are repeated in multiple places, they should be refactored into a single function
- avatar photo upload (initials-only for now — per user decision)
- allow multi statement in blong-dev sql
- create db admin ui
- create k8s admin ui
- tests are doing too many assertions instead of snapshotting
- compile queries to procedures
- combined storybook
- backend for the storybook
- translations from the DB
- generic blong-browser model CRUD Playwright tests (`model.ts`) are flaky on first attempt
  (screenshot/timing — pass on retry); observed in blong-access ("create access role/capability",
  "cleanup access user") and blong-party. Worth a retry/stability pass.
- MySQL CI settings follow-up (pending diagnostics from the `ci-diagnostics` artifact): bump
  `test/integration/mysql-deployment.yaml` memory limits if OOMKilled, add `--max_connections` if
  `ER_CON_COUNT_ERROR` (1040) shows up, tweak `wait_timeout` only if idle-close is confirmed.
  Currently left at MySQL defaults.
- Whole-transaction retry for transient connection errors (v1 retries only builder/raw queries;
  transactions surface the error). Consider re-invoking the transaction callback on retryable errors
  (knex rolls back on throw) — needs care re: external side effects.
- Enable `knex.retry` for `blong-int-sql`'s own `extends: 'adapter.knex'` adapter
  (`core/blong-int-sql/mysql/adapter/sql.ts`) — currently only the shared `srv.db` adapter enables
  it.
- wanples CI (max parallelism → higher contention) — intentionally out of scope for the retry
  workaround; revisit if it starts hitting the same connection drops.
- coverage seems to miss the server tests
- RBAC + object level permissions (ACL)
- report hanging handlers after tests
- blong-commander: pod log viewer is no longer wired for k8s items (they use the generic `document`
  viewer after the categories restructure). Re-wiring per-resource-type viewers (pods → podLog)
  would be a follow-up.
- **Test runs skipped after the folder restructure** (backends not running this session):
  `test/framework` (`@feasibleone/test`), `test/blong-int-sql`, `test/blong-int-adapter`,
  `realm/blong-access`, `realm/blong-party`, `realm/blong-gateway`, `realm/blong-commander`,
  `realm/blong-test`, `demo/blong-marine`, `suite/blong-suite`, `tools/blong-ttk` — all need MySQL
  (3306) and/or browser backends. Verified in their place: `core/blong-gogo` (incl. the
  graceful-shutdown spawn test against `demo/blong-hello`), `demo/blong-eip` (23/23), `rush build`,
  `rush ci-lint`; scaffolder + `copy-template.mjs` template resolution smoke-tested.
- `rush ci-coverage` was not run end-to-end (it needs `ci-test` artifacts first), so
  `run-coverage.sh`'s new `pkg_path` category map was validated by path existence only.
- **`rush.json` `tags` still say `core`** for packages now under `realm/`, `suite/`, `demo/`,
  `test/` and `tools/`. Left unchanged deliberately (nothing filters on `tag:*` today), but worth
  aligning with the new categories.
- Consider moving `ext/rest-fs` → `tools/rest-fs` once the widened `infitx-org/actions` CI globs are
  merged to `main` and other consumers no longer rely on `ext/`.
- **Backend state is ephemeral for `minio`, `redis`, `kafka`, `vault`** (no `volumeMounts`/
  `persistentVolumeClaim` in their `test/integration/*.yaml` manifests, unlike
  mysql/mongodb/keycloak which have PVCs). Any cluster restart silently wipes their data while the
  corresponding one-shot init Jobs stay `Complete`, so they never re-seed. **Mitigated**: the local
  `~/.local/bin/k3d-up` now deletes all init Jobs, re-applies `test/integration/`, waits for them,
  and ensures the `blong-<suite>-<user>` MySQL databases — so a host restart self-heals. Every init
  Job is idempotent as of that change (see the Kafka note in `friction.md`). CI is unaffected
  because it always starts a fresh k3d cluster. Remaining candidates, not implemented: (a) add a PVC
  to `minio-deployment.yaml`/`kafka-deployment .yaml` so restarts preserve the data outright; (b)
  make the s3 test create its own bucket — rejected for now because the `commander/hello.txt` object
  is intentionally provisioned by k8s so Playwright screenshots stay deterministic.
- `test/blong-int-adapter/s3/test/fixtures/object.ts` is a plain data module sitting inside the
  `test/` layer, so the loader logs
  `Error loading ... probably a generic source code was put in a handler group folder`. Benign (it
  is imported directly by the CRUD test) and pre-dates the restructure, but it could be moved out of
  the layer to silence the warning.

## Deferred — wood theme design-match (blong-browser, 2026-09-11 / updated 2026-09-12)

- **Design-matched**: §W2 (cards), §W3 (inputs), §W8 (toolbar buttons **and** the in-card Links
  `+ Add` / `Delete`, which the reference shows as the same key), §W5 (habitat checkboxes), §W6
  (Links datatable + toolbar) and §W7 (Form Inspector) — all measured against `wood-card.png` /
  `wood-buttons-2.png` / `wood.png`. §W4 (bracket HUD) was **deleted** rather than restyled; see
  `decision.md` §"Fifth pass".
- **Deferred inside this work (not requested, chosen for scope):**
    - The Habitat grid stays `repeat(4, 1fr)` sized by its container, so its column pitch (165.6 CSS
      px in `editor--wood`) is wider than the reference's ~122 px. That is a _card width_ difference
      (reference cards ≈532 px, the story's ≈578–662), not a styling one — do not "fix" it by
      switching to content-sized columns without re-measuring.
    - `.blong-inspector__body` keeps a `max-height` + scroll (raised to 420px, thin warm scrollbar)
      although the reference shows no scroll container at all. Removing it would make very large
      JSON dumps push the plate arbitrarily tall.
    - The inspector's wood margin is `0.7rem/0.8rem` (≈11.2 px) vs the reference's ≈11 px — fine,
      but if the plate padding is ever changed, `:last-child`'s `flex: 1` means the change is
      invisible except in that margin.
    - Row/table hover + `p-highlight` colours are interpolated from the design's _static_ pixels;
      the reference has no hover state to measure.
- **The hint caret is deliberately NOT a copy of the reference.** `wood.png` shows the notch as a
  brass rim around an interior that continues the panel's texture; two attempts to build that
  (border triangles, then a bell-shaped brass rim over a matching rust bell) stayed patchy and the
  rim never quite matched the frame's width. **Product decision: the caret is a solid brass
  triangle** matching the frame. Do not "restore" the rim + interior without asking — see
  `decision.md` §"Eighth pass".
- **RESOLVED — theme texture delivery.** The user chose **(A)**: de-inline the two large textures,
  WebP lossless for `wood-edge` only, grain stays PNG, tile stays 512². Implemented and verified in
  all four environments (Storybook dev, suite build, `storybook build`, package lib build) — see
  `decision.md` §"Investigation — emitting the theme textures as files / WebP". If a future pass
  adds or resizes textures, re-check the format per asset rather than assuming WebP: lossless WebP
  is _larger_ on pure entropy (the grain), and lossy WebP seams a tiled texture.
- **Typography is metrics-matched, not face-matched** (unchanged). The design's geometric sans is
  neither bundled in the repo nor installed in the container; `document.fonts` shows only Nunito
  Sans + primeicons load, and the browser falls through to a wider host face. `--wood-font` is a
  preference list. A truly exact match needs a self-hosted `@font-face` — an architectural decision
  (network dependency / font licensing) deliberately **not** taken.

## Open issue — PrimeReact v10 theme/structural cascade ordering (affects ALL variants)

- `primereact/resources/primereact.min.css` is now an **explicitly empty stub** ("has been
  deprecated… included in the build as an empty file"), and the real structural CSS is injected by
  each component inside **`@layer primereact`**. `themeRegistry` injects `theme.css` separately, and
  some of its rules use _shorthands that reset geometry the structural sheet set_ — the ActionHint
  caret (`.p-overlaypanel:before { border: solid transparent }` wiping `border-width: 10px`) is the
  one found so far.
- **Worked around for the wood variant only** (`.blong-theme-wood .p-overlaypanel::before/::after`
  restated unlayered with `!important`). The **glass** variant and every stock PrimeReact theme
  still render a nub instead of a caret. The proper fix is either to inject `theme.css` into
  `@layer primereact` _before_ the structural sheet, or to raise the structural layer's priority —
  worth doing centrally rather than per-variant. Audit other components for the same pattern (any
  theme rule that sets a `border`/`margin`/`padding` shorthand over a structural rule).
- Also worth noting: `p-overlaypanel::before/after` is the only caret in this app today, but
  Tooltip/ConfirmPopup/etc. may have equivalents.
- **Typography is metrics-matched, not face-matched.** The design uses a geometric sans that is
  neither bundled in the repo nor installed in the container (only DejaVu is available, and
  Storybook's `preview.tsx` asks for Roboto, which is also absent). `--wood-font` is a preference
  list; a truly exact match needs the font to be self-hosted or loaded — an architectural decision
  (network dependency / font-file licensing) that was deliberately **not** taken. If it is wanted,
  add a `@font-face` for Poppins/Montserrat and keep the current metrics.
- **Button state wiring is minimal.** `ActionButton` sets `blong-action-error` for a hard-coded 2000
  ms (mirroring `ActionHint`'s auto-dismiss) rather than tracking the hint's actual lifecycle. Fine
  today, but if the hint duration ever becomes configurable the two will drift.
- **Fixed corner arcs.** The bevel art hard-codes a 12-unit corner arc (⇒ 6px CSS) and the inputs
  use `border-radius: 4px`. Changing either radius in CSS **requires** regenerating
  `wood-assets.css` with a matching `EDGE.radius` (arc ÷ 2 = CSS radius). Do not re-add a rim to
  `makeEdge()` or the edge doubles up again.
- **Grain tile is 512×512 at 5-bit, drawn at 256px** (whole generated sheet ≈49 KB gzip). It repeats
  every 256 CSS px; not visible in the tested layouts, but a much larger card could show the repeat.
  The payload is dominated by this asset — a 384 tile would cut ~45% but narrow the repeat to 192
  px.
- **The grain's macro tone lives entirely in CSS** (`background-color: #4e3124` + the 168° gradient)
  because the tile's mean is pinned to 128. Re-tone by editing those two values; re-tuning the
  _texture_ means editing the amplitude block in `woodAssets.mjs` and re-checking the three
  calibration numbers (tone / sdev / hf).
- **The mesh, button dots and frame shading are approximations of the reference's sub-pixel detail**
  (the frame is a single `border-box` gradient, so it cannot vary per side the way a real bullnose
  does; the eye accepts it because the top/bottom picks up the bright stops).
- `plans/theme/wood.md` (the original blueprint) is now historically inaccurate — it still documents
  the gradient-only card + hex screws. Left untouched as a design-input record.
- The soft blur applied to the grain uses `-virtual-pixel tile`; if the generator is ever switched
  to a non-wrapping filter, re-verify the tile seams (view a 2×2 tiling).
- **`blong-kukum` (phases 0–6 landed).** Implemented: shared layer/template tables, `mkdirSync` on
  the platform API, `@feasibleone/blong-lint`, the realm, the pure engine, the 14-primitive
  catalogue with templates, catalogue-driven routes/handlers, in-file agent instructions, registry
  introspection (`Registry.describe()` + `Watch.describe()` + `IGateway.describe()`), the meta
  endpoints (`primitive.find`, `method.find`, `tree.find`, `activation.find`, `instruction.find`,
  `source.get`, `source.check`), the `kukum` CLI (`core/blong-kukum/bin/kukum.ts`), the MCP item
  (`blong-gogo/src/Mcp.ts`, `/mcp`, off by default), full `realm` delegation to the `blong-kopi`
  template, overwrite warnings on `add`/`edit`, and 427 assertions across `engine` / `operations` /
  `index` (real gateway + meta endpoints) / `scaffold` (scaffolds a realm, runs its own suite green,
  then adds every primitive/kind). The skills rewrite is done: `[KUKUM_API]` is the canonical
  section in `_shared/conventions.md` and all 17 skills reference it; `blong-realm`'s hand-written
  file tree and `blong-validation`'s "hand-write `~.schema.ts`" instruction (which contradicted the
  framework's own generation) were replaced. **Remaining**: (a) ~~whole-file generators (`schema`,
  `model`, `seed`, and the subject-named `*.play.ts`) REPLACE the file rather than merging~~ —
  **DONE**: `add` now composes when the target carries the generated marker (sibling
  `meta/type/<object>.ts` for tables, spliced `tables` map for `register`, appended `test.describe`
  for playwright, auto-registered test groups), with `--replace` for a deliberate reset. See
  `decision.md`. Note `seed` turned out to be a per-entity file (`<subject><Object>Merge.yaml`), so
  it never needed merging. (b) — **DONE (code)**: `orchestrator/graph.ts` now declares the `graph`
  namespace (`imports: [/\.graph$/]`), the handler moved to `orchestrator/graph/graphGraphGet.ts`
  and reads `this.registry.describe()`, `adapter/` is gone, `server.ts` no longer declares phantom
  children or an unconsumed `graphDispatch` config, and `browser.ts` imports the component source
  instead of a gitignored build artifact. `ci-test` was added (12 tap tests, lint clean).
  **Remaining for blong-graph**: its Playwright spec cannot run as committed — `tests/fixtures`
  serves `.tsx` from a plain `http-server` with no transpiler, the three baselines
  (`graph-initial-state`, `graph-with-details`, `graph-node-types`) were never committed, and the
  `_ci-ui` script is not invoked by blong's `rush.yaml`, so the visual test still never runs in CI.
  Fixing it needs a real build step for the fixture plus committed baselines, or dropping the spec
  in favour of the tap test. Also unverified end-to-end: the realm-level round trip (load a suite
  and read `/rpc/graph/graph/get`). (c) The skills' verbatim skeleton blocks were kept deliberately
  as "what the API emits" references; deleting them is a separate editorial pass. (d) — **DONE**:
  the E2E now lives in `e2e.test.ts` against a generated fixture at
  `core/blong-kukum/test/fixture/e2e-realm/`, adds a second entity, runs all three legs and asserts
  an artifact → test matrix. The generated files are gitignored and regenerated on every run; only
  the Playwright baselines are committed, and they are now the drift lock. **Lost with that
  change**: the byte-for-byte "committed fixture equals generated output" assertion, so a template
  change that alters non-UI output (a handler body, a seed, a config) is no longer detected by this
  package. (e) Coverage is now 93.1% statements / 93.5% functions; the `kukum` CLI and
  `bin/fixture.ts` are the main gaps. (f) MCP `/mcp`, the `kukum` CLI and `@feasibleone/blong-lint`
  still have no tests. (g) **The committed fixture's own runner still executes as part of
  `node --run test` in `core/blong-kukum`.** tap's positional file globs —
  `'*.test.ts' '**/*.test.ts'`, hard-coded in `blong-dev test` — bypass tap's `exclude` rules
  entirely, so neither `--exclude` nor the `fixture/` folder convention applies. Consequences:
  `KUKUM_SKIP_E2E=1` does not skip it, it runs twice, and it requires the dev database where the
  rest of the package may not. The clean fix is for `blong-dev test` to stop hard-coding globs and
  honour a package-level tap `include`/`exclude` config — a shared-tool change needing a repo-wide
  check.
- **Stage 1 DONE (exit flag + `cli` intent)**, verified: `blong cli` exits 0 with nothing bound and
  a default run still opens its listeners; `blong-gogo` green (261 pass) with 9 new tests in
  `src/exit.intent.test.ts`.
- **BLOCKER before Stage 2 (split `catalog.ts`) — the fixture is destroyed while tap may be reading
  it.** `e2e.test.ts` rebuilds `core/blong-kukum/test/fixture/e2e-realm/` from scratch on every run,
  and tap also collects that fixture's own `index.test.ts` as part of the package suite (issue (g)
  above). A kill mid-regeneration left the tree empty and produced three cascading failures. Two
  candidate fixes were proposed: (a) generate into a sibling temp directory and swap it into place,
  so a reader only ever sees a complete tree; (b) stop tap collecting the fixture at all.
  **RE-VERIFIED, verdict unchanged — leave it alone.** Option (b) was tested directly with
  `tap list '*.test.ts' '**/*.test.ts' --exclude='**/fixture/**'`: the fixture test is _still
  listed_, confirming that positional globs ignore `--exclude`. It matches the four approaches
  already tried and recorded in `friction.md`, whose conclusion stands: the real fix is for
  `blong-dev test` to honour a package-level tap `include`/`exclude` config instead of hard-coding
  globs — a shared-tool change with repo-wide blast radius. Option (a) does not fully fix it either:
  any delete-and-replace swap still leaves a window where the path does not exist. Do not
  re-litigate without deciding to change `blong-dev test`.
- **RESOLVED — the e2e-realm fixture's `widget find` failure was a test-generator bug, not a
  framework bug.** The generated tests scanned page 1 of an unbounded table
  (`find({paging: {pageNumber: 1, pageSize: 100}})`) and asserted the row they had just added was in
  the result; rows return in ascending PK order and the table is never cleaned, so past 100 rows the
  new row moved to page 2. `gadget` passed only because its table still had 96 rows. Fixed by
  filtering on the unique name the test just created (`filterBy: {<object>Name}`) in **both**
  generators — `core/blong-kukum/primitives/catalog.ts` (`testServerSource`, `testBrowserSource`)
  and `core/blong-kopi` (`server/test/test/test$Object.ts`,
  `browser/test/test/test$Object.flow.ts`). Verified: `blong-kukum` 481/481 (was 466/471 with 3
  files failing) and `e2e.test.ts` 410s → 39.7s; the browser leg also proves `filterBy` survives
  HTTP gateway validation. **Note the real fixture database is `blong-e2e-kalin`** (derived from the
  suite name passed to `load()`, _not_ the `e2e-realm` directory name) — `e2e-realm-kalin` is a
  stale database from an older naming scheme and misleading. Rows still accumulate there forever
  (124 widgets and rising); harmless now that the queries filter, but a fixture DB reset in
  `regenerateFixture` would be tidier.
- **`cli` + a suite containing `blong-login` crashes on load — a real sharp edge, not yet fixed.**
  `realm/blong-login/orchestrator/login/token.ts:27` destructures `gateway` from the layer api and
  calls `gateway.config()` **during handler creation** to get the public signing keys. The `cli`
  intent sets `gateway: false`, so the infra item is never built and the load dies with
  `TypeError: Cannot read properties of undefined (reading 'config')`. Reproduced with
  `node core/blong-gogo/bin/blong.ts cli` in `demo/handler-test-poc` (two-platform, includes login).
  Consequences: the plan's Decision "_`cli` is framework-level, so any realm or suite is drivable
  from a terminal_" is **only true for suites without `blong-login`** (blong-access, blong-suite,
  blong-marine and handler-test-poc all fail). It does **not** block Stage 4: the planned
  `core/blong-kukum/cli.ts` is a kukum-realm-only server suite and `blong cli` there exits 0. Two
  candidate fixes, neither done: (a) make the `gateway.config()` read lazy in `blong-login` (move it
  inside `jwks()`), which is the better design since the keys are only needed per call; (b) keep a
  config-only gateway under `cli` (an infra item that answers `config()` but never `listen()`s).
  Prefer (a) — (b) re-opens "which components does `cli` switch off".
- **Stage 1 verification gaps now closed.** The three process-lifetime outcomes were checked
  empirically in `demo/blong-hello` (server-only) with `timeout 12`: defaults + CI unset → exit
  **124** (still alive); defaults + `CI=1` → exit **0** (exited on its own);
  `integration playwright`
    - `CI=1` → exit **124** (the `playwright` block's `exit: false` correctly beats `integration`'s
      CI exit). `blong cli` in `core/blong-kukum` → exit 0 with nothing bound. **Still not verified
      empirically: the two-platform branch of `autoRun` (`platforms[0].exit`)**, because every
      two-platform suite tried needs a database (`realm/blong-core` → "Unknown database
      'blong-core'") or includes `blong-login` (which crashes under `cli`, above) — it is covered
      only by the flag unit tests and code review. Note `core/blong-kukum` is **server-only** (no
      `browser.ts`), so the earlier `blong cli` check there did not exercise that branch either.
- **Same latent bug class, not yet fixed:
  `realm/blong-access/server/test/test/testAccessModelFlow.ts` `findUsers`** (around line 186) does
  the identical unfiltered `accessUserFind({paging: {pageNumber: 1, pageSize: 100}})` +
  `result.some(item => item.userId === created.userId)`. `access_user` grows with every run, so this
  breaks once it passes 100 rows. The fix is the same — the `addUser` step already mints
  `model-test-${Date.now()}@example.com`, so thread that email through the chain and
  `filterBy: {emailAddress}`. Left undone deliberately: it needs a `blong-access` run (and therefore
  backends) to verify, and it is in a hand-written realm test rather than a shipped template.
  `demo/blong-marine/meta/model/*.ts` also uses `pageSize: 100`, but for `listParams` feeding a
  dropdown, which is a different (and legitimate) use.
- **PRE-EXISTING failure, NOT caused by the exit/`cli` work — needs root-causing: the e2e-realm
  fixture's template `widget` entity fails `find`.** Proven by stashing all four framework files
  (`load.ts`, `runServer.ts`, `types.ts`, `ConfigRuntime.ts`) and re-running the fixture suite
  alone: byte-identical failure. Facts: `addWidget` succeeds but `findWidget` does not return the
  just-added row (server _and_ browser legs); the kukum-generated `gadget` entity passes both legs;
  `e2e-realm-kalin.e2e_widget` holds 28 rows (max `widgetId` 144, so not a page-size effect) and the
  rows are persisted (`ENT-TEST-*` names present). The only structural difference is that `widget`
  is the master-detail template entity (has `line`). Suspects: the result row shape for
  master-detail entities, or a `item.widgetId === widget.widgetId` strict-equality/type mismatch on
  the way back.
- **`blong-gogo` / `blong-kukum` type gaps closed while wiring the intent tables** (all three were
  latent because `tap` transpiles without typechecking, so only `blong-dev lint` sees them):
  `IBaseConfig` had no `exit` key and an `additionalProperties: false` schema,
  `IActivationConfig<T>` enumerated only the five built-in intent names, and `IBaseConfig.watch` was
  a shaped `TObject` that rejected `enabled`/`logLevel`. Fixed by adding
  `exit: TOptional<TBoolean>`, widening `IActivationConfig<T>` with
  `[intent: string]: T | undefined`, and making `watch: TObject` permissive. Note for future edits:
  `TOptional` works at the top level of a `TObject` shape, but keys inside a _nested_ `TObject`
  shape resolve as required regardless — shape nested objects or leave them permissive.

- The file-name rule ("the file name must match the API endpoint path; skip the segment that differs
  when one file serves several paths; never double-book a name") is applied in
  `core/blong-kukum/orchestrator/kukum/` but is not written down in
  `.github/skills/_shared/conventions.md` or the `blong-handler` skill. Left out on purpose — shared
  framework docs affect other realms. Confirm before documenting it as a general convention.

- (kukum docs) The file-name rule is now documented for kukum users in
  `docs/blong/docs/patterns/kukum.md`. It is still not stated in
  `.github/skills/_shared/conventions.md` or the `blong-handler` skill as a repo-wide convention —
  that promotion is still open.
- (kukum docs) The full `docusaurus build` in `docs/blong` was not run (see decision.md).

- (realm CLI) A component's `cli: {logLevel: 'warn'}` is still per-component boilerplate. Moving it
  would mean the framework injecting a default log level into every loaded component under the `cli`
  intent — there is no hook for that today (`AdapterBase` falls back to `'info'` when the
  component's own `config.logLevel` is unset). Worth doing if a third command-driven realm appears.
- (realm CLI) `bin/fixture.ts`-style maintenance commands and `tools/blong-dev` still hand-roll
  their own argv handling; `runCli` may fit them too.
- (docs) `patterns/cli.md` is new and unlinked from the intent docs beyond the note in
  `concepts/intents.md`; the `blong-intent` skill's layer-activation table still omits `cli`.

- (blong-lint) `ci-test` exits 1 because the package has no test files (pre-existing; the old
  `blong-dev test` did the same). Either add tests or drop the script and let rush's
  `ignoreMissingScript: true` skip it.
