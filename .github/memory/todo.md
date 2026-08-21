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
- Per-suite Playwright webServer backend ports (8080 collision) — separate flake with the same
  "webServer was not able to start" symptom; fix only if the diagnostic dump shows port collisions.
- Whole-transaction retry for transient connection errors (v1 retries only builder/raw queries;
  transactions surface the error). Consider re-invoking the transaction callback on retryable errors
  (knex rolls back on throw) — needs care re: external side effects.
- Enable `knex.retry` for `blong-int-sql`'s own `extends: 'adapter.knex'` adapter
  (`core/blong-int-sql/mysql/adapter/sql.ts`) — currently only the shared `srv.db` adapter enables it.
- wanples CI (max parallelism → higher contention) — intentionally out of scope for the retry
  workaround; revisit if it starts hitting the same connection drops.

## List of completed tasks

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
