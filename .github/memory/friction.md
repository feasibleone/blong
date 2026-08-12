# Frictions

This document is a list of frictions that have been identified during the work on the project.
Update it when something requires unexpected effort to implement or fix.

## List of frictions

- No established pattern for dev-only gateway validations + orchestrator namespaces
  Making the demo metered APIs (`vision.compute`, `customer.get`) exist only in `dev` requires gating the **gateway
  validation** (`gateway/vision/visionCompute.ts`), the **orchestrator namespace** (`orchestrator/vision/init.ts`),
  AND the handler. Only the handler part has a mechanism today:
  - `adapter/dbTest/` works ONLY because the shared `db` adapter (`blong-server/adapter/db.ts`) has
    `imports: [/\.db$/, /\.dbTest$/...]` under `dev` — adapter-level import regex, not a general gating mechanism.
  - Placing the validation in `gateway/test/` does NOT make it dev-only: `test` there is a **handler-group folder
    inside the `gateway` layer**, not a layer — it loads whenever `gateway/` loads. The hint file
    `core/test/demo/gateway/test/test.demo.add.ts` was misleading for this.
  - There is NO existing per-handler-group or per-validation intent gating for the `gateway`/`orchestrator` layers.
  - Docs/code discrepancy: the skill and `docs/blong/docs/concepts/layer.md` say `adapter`/`orchestrator`/`gateway`/
    `error` are active in `default` (always), but `core/blong-gogo/src/load.ts` `WELL_KNOWN_LAYERS` declares them
    `{server: {integration: true}}` — needs reconciliation before deciding how dev-only gating should work.
  Plan for a fix (e.g. a `dev`-intent handler-group convention analogous to `dbTest`, or a framework gate on
  validations/namespaces) before implementing.
- The core.resource architecture is not well highlighted and results in complicated code, that could be avoided.
- Sometimes there is a need to execute MySQL queries. Consider adding this ability to blong-dev, it should be
  able to connect to the DB reusing the dev config from .blong_devrc
- Sometimes async operations take unusually long time to complete. They should log something
  (report progress every few seconds) in such cases, specifically the ones that happen during start-up,
  like schema sync, seed data, etc. This will help to understand if  the process is stuck or just slow.
- The agent tries to use the log server and seems to fail. Investigate this.
- The knex adapter should try to report deadlock details in dev mode, to help understand what is going on.
  It should also report the query that caused the deadlock.
- Orphaned connections should be addressed - possibly the adapters can utilize <https://www.npmjs.com/package/async-exit-hook>
