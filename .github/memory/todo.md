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
