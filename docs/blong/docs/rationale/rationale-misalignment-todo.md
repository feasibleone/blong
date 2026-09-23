# Rationale Misalignment TODO

This file tracks mismatches between rationale documents and the current implementation. Each item is
intentionally actionable and includes a short recommendation to help decide whether to update the
docs, the code, or both.

---

## snapshot-testing.md

**6. Automatic snapshots at `[]` checkpoint barriers are not implemented.**

- Misalignment: Strategy 2 in the rationale describes automatic context snapshots at `[]` checkpoint
  barriers; the `blong-chain` executor does not have that feature.
- Status: **Partially implemented** — the executor's `autoSnapshot` option snapshots each step's
  result without an explicit `assert.snapshot()` call. Still missing is the _barrier_ form: a `[]`
  entry in the steps array taking a snapshot of the whole accumulated context. The Strategy 2
  section in `snapshot-testing.md` carries a "Not yet implemented" label for that part only.

---

## test-rerun-diagnostics.md

**~~7. `TestExecutor` `rerun` configuration option is not implemented.~~ ✅ Phase 1 implemented**

- Misalignment: the rationale shows a `rerun: {enabled, maxRetries, logLevel, ...}` config block for
  `TestExecutor`. No such option exists in the current `blong-chain` executor.
- Status: **Phase 1 implemented** — `rerun: {enabled, maxRetries}` is accepted by
  `ITestExecutorConfig` and the retry loop is in place (`core/blong-chain/index.ts`,
  `DEFAULT_MAX_RETRIES`). When a step fails and `rerun.enabled` is true, it is retried up to
  `maxRetries` times before being marked as failed. `logLevel` is still not consumed, so the config
  block in the rationale is not yet fully implemented.

**8. Diagnostic attachment pipeline (logs/traces/payloads in report) is not implemented.**

- Misalignment: the rationale expects richer failure artifacts attached to test reports; current
  reports contain TAP output and Allure annotations but no structured rerun diagnostics.
- Task: define a `DiagnosticArtifact` type and add a report renderer that embeds it in the HTML/JSON
  report for failing tests.
- Recommendation: ship JSON artifact output first (a file per test run), then enrich HTML reports in
  a second iteration.

---

## metadata-driven-ui.md

**~~9. Advanced UI patterns (cascaded dropdowns, polymorphic layout, master-detail) have no
executable demos.~~ ✅ Resolved**

- `core/blong-browser` now has Storybook stories covering all major advanced UI patterns
  (CascadedDropdowns, MasterDetail, PolymorphicLayout, and more). The implementation exceeds the
  original expectation.

**10. `x-blong-*` extension fields are documented as a specification but not validated at startup.**

- Misalignment: the rationale lists `x-widget`, `x-filter`, `x-hidden`, etc. as defined extension
  fields; unknown or misspelled extensions were silently ignored in the UI.
- Status: **Implemented** — `core/blong-browser/src/schema/registry.ts` now emits a `console.warn`
  for any unknown `x-*` extension key during field enrichment. Known keys: `x-filter`,
  `x-filterable`, `x-sort`, `x-cards`, `x-widget`.

**11. The design editor is documented as a feature but is not yet in `core/blong-browser`.**

- Misalignment: the rationale describes a drag-and-drop design editor with persistence. No such
  component exists in the current `blong-browser` source.
- Status: **Documented** — the Interactive Design Editor section in `metadata-driven-ui.md` now
  carries a "Not yet implemented" note and defers implementation until the base form/table
  generation is stable.

---

## goals.md

**14. Goals have no measurable acceptance criteria.**

- Misalignment: the rationale states goals ("faster build cycles", "100% test coverage") but does
  not define thresholds that can be measured in CI.
- Task: add a measurable target for each goal (e.g., handler hot-reload latency < 200 ms measured in
  a benchmark test, test cycle < 30 s for the `blong-chain` demo suite).
- Recommendation: tie each goal to one CI-visible metric that fails the build when regressed.
