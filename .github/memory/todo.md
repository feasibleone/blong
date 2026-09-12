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
  `+ Add` / `Delete`, which the reference shows as the same key), §W5 (habitat checkboxes),
  §W6 (Links datatable + toolbar) and §W7 (Form Inspector) — all measured against
  `wood-card.png` / `wood-buttons-2.png` / `wood.png`. §W4 (bracket HUD) was **deleted** rather
  than restyled; see `decision.md` §"Fifth pass".
- **Deferred inside this work (not requested, chosen for scope):**
  - The Habitat grid stays `repeat(4, 1fr)` sized by its container, so its column pitch (165.6 CSS
    px in `editor--wood`) is wider than the reference's ~122 px. That is a *card width* difference
    (reference cards ≈532 px, the story's ≈578–662), not a styling one — do not "fix" it by
    switching to content-sized columns without re-measuring.
  - `.blong-inspector__body` keeps a `max-height` + scroll (raised to 420px, thin warm scrollbar)
    although the reference shows no scroll container at all. Removing it would make very large
    JSON dumps push the plate arbitrarily tall.
  - The inspector's wood margin is `0.7rem/0.8rem` (≈11.2 px) vs the reference's ≈11 px — fine, but
    if the plate padding is ever changed, `:last-child`'s `flex: 1` means the change is invisible
    except in that margin.
  - Row/table hover + `p-highlight` colours are interpolated from the design's *static* pixels;
    the reference has no hover state to measure.
- **The hint caret is deliberately NOT a copy of the reference.** `wood.png` shows the notch as a
  brass rim around an interior that continues the panel's texture; two attempts to build that (border
  triangles, then a bell-shaped brass rim over a matching rust bell) stayed patchy and the rim never
  quite matched the frame's width. **Product decision: the caret is a solid brass triangle** matching
  the frame. Do not "restore" the rim + interior without asking — see `decision.md` §"Eighth pass".
- **RESOLVED — theme texture delivery.** The user chose **(A)**: de-inline the two large textures,
  WebP lossless for `wood-edge` only, grain stays PNG, tile stays 512². Implemented and verified in
  all four environments (Storybook dev, suite build, `storybook build`, package lib build) — see
  `decision.md` §"Investigation — emitting the theme textures as files / WebP". If a future pass adds
  or resizes textures, re-check the format per asset rather than assuming WebP: lossless WebP is
  *larger* on pure entropy (the grain), and lossy WebP seams a tiled texture.
- **Typography is metrics-matched, not face-matched** (unchanged). The design's geometric sans is
  neither bundled in the repo nor installed in the container; `document.fonts` shows only
  Nunito Sans + primeicons load, and the browser falls through to a wider host face. `--wood-font`
  is a preference list. A truly exact match needs a self-hosted `@font-face` — an architectural
  decision (network dependency / font licensing) deliberately **not** taken.

## Open issue — PrimeReact v10 theme/structural cascade ordering (affects ALL variants)

- `primereact/resources/primereact.min.css` is now an **explicitly empty stub** ("has been deprecated…
  included in the build as an empty file"), and the real structural CSS is injected by each
  component inside **`@layer primereact`**. `themeRegistry` injects `theme.css` separately, and some
  of its rules use *shorthands that reset geometry the structural sheet set* — the ActionHint caret
  (`.p-overlaypanel:before { border: solid transparent }` wiping `border-width: 10px`) is the one
  found so far.
- **Worked around for the wood variant only** (`.blong-theme-wood .p-overlaypanel::before/::after`
  restated unlayered with `!important`). The **glass** variant and every stock PrimeReact theme
  still render a nub instead of a caret. The proper fix is either to inject `theme.css` into
  `@layer primereact` *before* the structural sheet, or to raise the structural layer's priority —
  worth doing centrally rather than per-variant. Audit other components for the same pattern
  (any theme rule that sets a `border`/`margin`/`padding` shorthand over a structural rule).
- Also worth noting: `p-overlaypanel::before/after` is the only caret in this app today, but
  Tooltip/ConfirmPopup/etc. may have equivalents.
- **Typography is metrics-matched, not face-matched.** The design uses a geometric sans that is
  neither bundled in the repo nor installed in the container (only DejaVu is available, and
  Storybook's `preview.tsx` asks for Roboto, which is also absent). `--wood-font` is a preference
  list; a truly exact match needs the font to be self-hosted or loaded — an architectural decision
  (network dependency / font-file licensing) that was deliberately **not** taken. If it is wanted,
  add a `@font-face` for Poppins/Montserrat and keep the current metrics.
- **Button state wiring is minimal.** `ActionButton` sets `blong-action-error` for a hard-coded
  2000 ms (mirroring `ActionHint`'s auto-dismiss) rather than tracking the hint's actual lifecycle.
  Fine today, but if the hint duration ever becomes configurable the two will drift.
- **Fixed corner arcs.** The bevel art hard-codes a 12-unit corner arc (⇒ 6px CSS) and the inputs
  use `border-radius: 4px`. Changing either radius in CSS **requires** regenerating
  `wood-assets.css` with a matching `EDGE.radius` (arc ÷ 2 = CSS radius). Do not re-add a rim to
  `makeEdge()` or the edge doubles up again.
- **Grain tile is 512×512 at 5-bit, drawn at 256px** (whole generated sheet ≈49 KB gzip). It repeats
  every 256 CSS px; not visible in the tested layouts, but a much larger card could show the repeat.
  The payload is dominated by this asset — a 384 tile would cut ~45% but narrow the repeat to 192 px.
- **The grain's macro tone lives entirely in CSS** (`background-color: #4e3124` + the 168°
  gradient) because the tile's mean is pinned to 128. Re-tone by editing those two values; re-tuning
  the *texture* means editing the amplitude block in `woodAssets.mjs` and re-checking the three
  calibration numbers (tone / sdev / hf).
- **The mesh, button dots and frame shading are approximations of the reference's sub-pixel detail**
  (the frame is a single `border-box` gradient, so it cannot vary per side the way a real bullnose
  does; the eye accepts it because the top/bottom picks up the bright stops).
- `plans/theme/wood.md` (the original blueprint) is now historically inaccurate — it still
  documents the gradient-only card + hex screws. Left untouched as a design-input record.
- The soft blur applied to the grain uses `-virtual-pixel tile`; if the generator is ever switched
  to a non-wrapping filter, re-verify the tile seams (view a 2×2 tiling).
