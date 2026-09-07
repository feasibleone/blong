# Todo

Potential unfinished, deferred or future tasks spotted during implementation.

## List of incomplete tasks

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

## List of completed tasks

- ~~Per-suite Playwright webServer ports (8080 collision in parallel `rush ci-test`)~~ **RESOLVED**
  systematically: `defineBlongConfig` auto-derives a unique port pair from the package's index in
  `rush.json` (backend 9000+index, frontend +100) when `CI` is set; locally it defaults to
  8080/5173. Explicit options / `PLAYWRIGHT_BACKEND_PORT` / `PLAYWRIGHT_FRONTEND_PORT` still
  override. Hand-written ports removed from all 7 realm configs (kopi 9014/9114, commander
  9015/9115, marine 9033/9133, access 9035/9135, gateway 9037/9137, party 9038/9138, suite 9040/9140
  — ALL UNIQUE). Local and CI-mode commander runs verified (10 pass each).

- ~~blong-commander redis Playwright baseline is sensitive to `blong-int-adapter` test pollution~~
  **RESOLVED**: the redis key drill filters the commander table to the seeded `commander:*` keys
  (built-in Filter), so `blong-test:*` pollution never reaches the screenshot; seeds are provisioned
  by the `redis-seed-init` job in `test/integration/redis-deployment.yaml` (CI + local).

- **blong-commander P5 — universal backend explorer drill-down + per-adapter Playwright screenshots
  (all 9 tests green).**
    - Fixed the "screenshots all show the adapter list" bug (root causes: Navigator Tree missing
      `selectionMode="single"` so tree clicks never selected; level `permission` strings used dashed
      subjects whose methodId (`kafka-devtopiclist`) never matched the granted camelCase actions
      (`kafkaDevTopicList` → `kafkadevtopiclist`) so all levels were pruned; `defaultListChildren`
      returned `[]` at the source root; columns derived from the first row crashed on later object
      cells).
    - k8s nested-data fix: generic one-level `flattenItem()` in `commander.branch.list` promotes
      scalar leaves of nested objects to literal dot-path keys (`metadata.name`, `status.phase`);
      descriptor uses `metadata.name` label/key/params.
    - kafka two-mode adapter (per user direction): `adapter.kafka` gained
      `mode?: 'stream' | 'admin'` — admin mode routes triples to `exec` (topic.list/find) via
      `super.connect()` (no stream, no codec); `topic.find` now reads from earliest with a 10s
      consume timeout (fresh-group rebalance). Commander `kafkaDev` uses `mode: 'admin'`.
    - Vault `secret.list` returns `{keys, items}` (backward-compatible; integration tests assert
      `keys`); seeded demo secrets.
    - Deferred: the commander suite TAP test still logs a `timeout!` on process exit (pre-existing
      harness issue — a Socket lingers after all 15 adapters stop cleanly; kafka closes in 82ms).
      Functional subtests pass 3/3. **RESOLVED (2026-09-07)**: the lingering socket was the redis
      adapter client — `quit()` on a lazy/connecting ioredis client left the 6379 socket open.
      `core/blong-gogo/src/adapter/server/redis.ts` stop now calls `disconnect()` after `quit()`, so
      the tap test exits cleanly (no `timeout!`).
- profile UI menu (top-right avatar) and profile page implemented (blong-access + blong-browser):
  `access.profile.get/edit/password.change`, AccountMenu, profile page, Playwright tests +
  screenshots
- preferred language returned during login (`login.token.create`/`restore`/`refresh` resolve the
  profile → `profile.language`) and applied to the UI (`setLanguage` + `translationsByLanguage` +
  `bgLocale` PrimeReact locale) — blong-access Playwright test screenshots the profile page in
  Bulgarian (`profile-bg.png`); tap assertions cover login/refresh
- menubar language switcher (`LanguageSwitcher`, left of the profile menu) for ad-hoc UI language
  switching — config-driven via `portal.languages`, falls back to `portal.translations` keys;
  blong-access Playwright test + screenshots (`language-switch-*.png`)
