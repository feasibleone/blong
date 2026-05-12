# Rationale Misalignment TODO

This file tracks mismatches between rationale documents and the current
implementation. Each item is intentionally actionable and includes a short
recommendation to help decide whether to update the docs, the code, or both.

---

## config-hot-reload.md

**~~1. `configChanged` hook — real knex adapter exists but old conceptual
   example is still referenced in some contexts.~~ ✅ Resolved**

- The real signature in `core/blong-gogo/src/adapter/server/knex.ts` matches
  the declared interface in `core/blong/types.ts`. The rationale now reflects
  the correct call signature.

**~~2. Hot reload for config files is not fully wired in `Watch.ts` today.~~ ✅ Resolved**

- `Watch.ts` includes a `_reloadConfig()` method that wires config-file-change
  → `ConfigRuntime.reload()` → `configChanged` on affected ports. The full
  pipeline is implemented and matches the rationale description.

**~~3. `createConfigProxy` partial-destructuring caveat is underdocumented in code.~~ ✅ Resolved**

- `ConfigRuntime.ts` contains comprehensive JSDoc explaining the mutation
  contract and proxy semantics. The documentation is complete.

---

## snapshot-testing.md

**4. `assert.snapshot(result, name, {mask})` API does not exist.**

- Misalignment: the rationale describes a proposed `assert.snapshot` helper
  with masking support; actual tests in the repo use TAP's `t.matchSnapshot()`
  with manual normalization (e.g., port substitution in blong-log tests).
- Status: **Implemented** — `snapshot(t, value, name, {mask?})` is exported
  from `@feasibleone/blong-chain` (`core/blong-chain/snapshot.ts`). It wraps
  `t.matchSnapshot` and applies flat dot-path masking before comparison.

**5. Deep path masking syntax is not implemented.**

- Misalignment: rationale describes `mask: ['*.completedTimestamp', 'createParty.partyId']`
  with glob and step-scoped paths; no such implementation exists.
- Status: **Partially implemented** — flat dot-path masking is available.
  Glob-style (`*.field`) wildcard masking is a remaining future item.

**6. Checkpoint auto-snapshot at barriers is not implemented.**

- Misalignment: Strategy 2 in the rationale describes automatic context
  snapshots at `[]` checkpoint barriers; the `blong-chain` executor does not
  have this feature.
- Status: **Documented as future direction** — the Strategy 2 section in
  `snapshot-testing.md` now carries a clear "Not yet implemented" label.

---

## test-rerun-diagnostics.md

**7. `TestExecutor` `rerun` configuration option is not implemented.**

- Misalignment: the rationale shows a `rerun: {enabled, maxRetries, logLevel, ...}`
  config block for `TestExecutor`. No such option exists in the current
  `blong-chain` executor.
- Status: **Phase 1 implemented** — `rerun: {enabled, maxRetries}` is accepted
  by `ITestExecutorConfig` and the `TestExecutor` retry loop is in place.
  When a step fails and `rerun.enabled` is true, it is retried up to
  `maxRetries` times before being marked as failed. See `core/blong-chain`.

**8. Diagnostic attachment pipeline (logs/traces/payloads in report) is not implemented.**

- Misalignment: the rationale expects richer failure artifacts attached to
  test reports; current reports contain TAP output and Allure annotations
  but no structured rerun diagnostics.
- Task: define a `DiagnosticArtifact` type and add a report renderer that
  embeds it in the HTML/JSON report for failing tests.
- Recommendation: ship JSON artifact output first (a file per test run),
  then enrich HTML reports in a second iteration.

---

## metadata-driven-ui.md

**~~9. Advanced UI patterns (cascaded dropdowns, polymorphic layout, master-detail)
   have no executable demos.~~ ✅ Resolved**

- `core/blong-browser` now has Storybook stories covering all major advanced
  UI patterns (CascadedDropdowns, MasterDetail, PolymorphicLayout, and more).
  The implementation exceeds the original expectation.

**10. `x-blong-*` extension fields are documented as a specification but not
     validated at startup.**

- Misalignment: the rationale lists `x-widget`, `x-filter`, `x-hidden`, etc.
  as defined extension fields; unknown or misspelled extensions were silently
  ignored in the UI.
- Status: **Implemented** — `core/blong-browser/src/schema/registry.ts` now
  emits a `console.warn` for any unknown `x-*` extension key during field
  enrichment. Known keys: `x-filter`, `x-filterable`, `x-sort`, `x-cards`,
  `x-widget`.

**11. The design editor is documented as a feature but is not yet in
     `core/blong-browser`.**

- Misalignment: the rationale describes a drag-and-drop design editor with
  persistence. No such component exists in the current `blong-browser` source.
- Status: **Documented** — the Interactive Design Editor section in
  `metadata-driven-ui.md` now carries a "Not yet implemented" note and
  defers implementation until the base form/table generation is stable.

---

## real-time-log.md

**~~12. Exact Storybook story count ("22 stories") may drift as stories evolve.~~ ✅ Fixed**

- The hardcoded count "22 stories" has been replaced with a durable
  description ("stories covering…") in `real-time-log.md`.

**~~13. `POST /api/query` synchronous filter endpoint is not implemented.~~ ✅ Implemented**

- `POST /api/query` now accepts a JSON filter body and returns matching log
  entries synchronously. See `core/blong-log/src/server.ts` and the
  corresponding tests.

---

## goals.md

**14. Goals have no measurable acceptance criteria.**

- Misalignment: the rationale states goals ("faster build cycles", "100% test
  coverage") but does not define thresholds that can be measured in CI.
- Task: add a measurable target for each goal (e.g., handler hot-reload
  latency < 200 ms measured in a benchmark test, test cycle < 30 s for the
  `blong-chain` demo suite).
- Recommendation: tie each goal to one CI-visible metric that fails the build
  when regressed.

---

## prior.md

**~~15. Paradigm references are not mapped to concrete framework features.~~ ✅ Resolved**

- `prior.md` contains a complete decision matrix table mapping every paradigm
  cluster to a concrete framework feature with a codebase example path.

---

## unified-handler-test.md

**~~16. The annotation syntax (`@name`, `@retry`, `@parallel`) is not implemented.~~ ✅ Resolved (partial)**

- `@name`, `@cache`, `@timeout`, `@priority`, and `@tag` annotations are
  implemented and validated in `blong-chain`'s `parseAnnotatedKey()` function.
  `@retry` and `@parallel` remain deferred per the phased plan.

**~~17. The `group(name)([...steps])` pattern is still the only naming mechanism.~~ ✅ Resolved**

- `group()` continues to work in 48+ test files and coexists with the new
  annotation-based naming in `blong-chain`. Backwards compatibility is fully
  maintained.
