# Todo

Potential unfinished, deferred or future tasks spotted during implementation.

## List of incomplete tasks

- skills as tools
- flow diagram for method calls
- component diagram for a suite
- https://github.com/tt-a1i/archify
- https://github.com/trailhq/Graft
- theme switcher
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
