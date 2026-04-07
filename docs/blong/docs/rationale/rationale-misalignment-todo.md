# Rationale Misalignment TODO

This file tracks mismatches between rationale documents and the current
implementation. Each item is intentionally actionable and includes a short
recommendation to help decide whether to update the docs, the code, or both.

---

## config-hot-reload.md

**1. `configChanged` hook — real knex adapter exists but old conceptual
   example is still referenced in some contexts.**

- Misalignment: the rationale previously showed a fictional adapter skeleton
  using `diff.has('knex')`; the real implementation in
  `core/blong-gogo/src/adapter/server/knex.ts` checks
  `key.startsWith(this.config.id + '.knex.')`. The actual signature is
  `configChanged(diff, next, _prev)`, not `configChanged(diff)`.
- Task: verify that the real signature matches the declared interface in
  `core/blong/types.ts` (`diff: Map<string, {prev; next}>`) and update any
  remaining conceptual snippets that diverge.
- Recommendation: the implementation is ahead of the docs here; update docs
  to match the real call signature.

**2. Hot reload for config files is not fully wired in `Watch.ts` today.**

- Misalignment: the rationale describes a `_reloadConfig` pipeline in
  `Watch.ts`, but the current `Watch.ts` primarily acts on handler/layer file
  changes. End-to-end config-file-change → `ConfigRuntime.reload()` →
  `configChanged` on affected ports may not be fully connected.
- Task: trace the watch event path for a `.ts` config file change and confirm
  whether `ConfigRuntime.reload()` is called or whether a process restart
  still occurs.
- Recommendation: implement the missing branch first; until then, label the
  reload pipeline section in the rationale as "planned" rather than current.

**3. `createConfigProxy` partial-destructuring caveat is underdocumented in code.**

- Misalignment: the rationale warns that partial destructuring is safe only
  when the sub-object is mutated in place, not replaced. The proxy
  implementation in `ConfigRuntime.ts` should document whether it replaces
  or mutates the backing object on reload.
- Task: add a comment to `createConfigProxy` clarifying the mutation contract.
- Recommendation: documentation-only fix; low risk.

---

## snapshot-testing.md

**4. `assert.snapshot(result, name, {mask})` API does not exist.**

- Misalignment: the rationale describes a proposed `assert.snapshot` helper
  with masking support; actual tests in the repo use TAP's `t.matchSnapshot()`
  with manual normalization (e.g., port substitution in blong-log tests).
- Task: either implement a shared `snapshot(value, name, opts)` utility in
  the test layer or explicitly state in the rationale that TAP's built-in
  snapshots are the standard.
- Recommendation: implement the helper (a thin wrapper around
  `t.matchSnapshot` that applies masking before comparison) to reduce
  duplicated pre-snapshot normalization across test files.

**5. Deep path masking syntax is not implemented.**

- Misalignment: rationale describes `mask: ['*.completedTimestamp', 'createParty.partyId']`
  with glob and step-scoped paths; no such implementation exists.
- Task: design and implement the mask path resolver as part of the
  `assert.snapshot` helper (item 4 above).
- Recommendation: implement alongside the helper; keep the path syntax simple
  (flat list of dot-paths initially) before adding glob support.

**6. Checkpoint auto-snapshot at barriers is not implemented.**

- Misalignment: Strategy 2 in the rationale describes automatic context
  snapshots at `[]` checkpoint barriers; the `blong-chain` executor does not
  have this feature.
- Task: either add an `autoSnapshot` executor option or explicitly label this
  as a future direction.
- Recommendation: mark as "future" in the rationale until implementation
  is ready; do not ship incomplete feature silently.

---

## test-rerun-diagnostics.md

**7. `TestExecutor` `rerun` configuration option is not implemented.**

- Misalignment: the rationale shows a `rerun: {enabled, maxRetries, logLevel, ...}`
  config block for `TestExecutor`. No such option exists in the current
  `blong-chain` executor.
- Task: implement Phase 1 (failure detection + `maxRetries` retry loop) as an
  MVP. The rerun should respect the step dependency graph already tracked by
  `blong-chain`.
- Recommendation: deliver narrow MVP (`maxRetries: 1`, failed steps only,
  no diagnostic attachment) before building the full pipeline.

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

**9. Advanced UI patterns (cascaded dropdowns, polymorphic layout, master-detail)
   have no executable demos.**

- Misalignment: the rationale describes these patterns in detail (drawn from
  ut-prime) but `core/blong-browser` has no Storybook stories or integration tests
  exercising them.
- Task: add at minimum one Storybook story per advanced pattern with a minimal
  reproducible example.
- Recommendation: create stories before writing more rationale; executable
  examples reveal design gaps that text descriptions miss.

**10. `x-blong-*` extension fields are documented as a specification but not
    validated at startup.**

- Misalignment: the rationale lists `x-blong-widget`, `x-blong-hidden`, etc.
  as defined extension fields; it is unclear whether the framework validates
  these at schema load time or silently ignores unknown extension keys.
- Task: add a TypeBox-based validator for `x-blong-*` fields so unknown or
  misspelled extensions fail at startup rather than being silently ignored in
  the UI.
- Recommendation: implement the validator in `FieldResolver.tsx` alongside
  the field resolver; emit a warning (not an error) for unknown extensions to
  maintain forwards compatibility.

**11. The design editor is documented as a feature but is not yet in
    `core/blong-browser`.**

- Misalignment: the rationale describes a drag-and-drop design editor with
  persistence. No such component exists in the current `blong-browser` source.
- Task: create a tracking issue for the design editor; add a "Not yet
  implemented" note in the rationale.
- Recommendation: defer the editor until the base form/table generation is
  stable and covered by Storybook stories.

---

## real-time-log.md

**12. Exact Storybook story count ("22 stories") may drift as stories evolve.**

- Misalignment: the testing section claims "22 stories covering …". This
  number is hard to validate and will become incorrect as stories are added
  or removed.
- Task: replace the count with a durable description ("stories covering all
  theme, data, and search-highlighting scenarios").
- Recommendation: documentation fix only; counts belong in package-level
  `README.md` where they are easier to keep current.

**13. `POST /api/query` synchronous filter endpoint is not implemented.**

- Misalignment: the new "Future Ideas" section proposes `POST /api/query`
  for agent-triggered log queries; the current REST API only supports
  `GET /api/entries` and `GET /api/config`.
- Task: implement `POST /api/query` with filter body and synchronous response.
- Recommendation: implement alongside the existing REST API handlers in
  `core/blong-log`; low complexity and immediately useful for CI scripts.

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

**15. Paradigm references are not mapped to concrete framework features.**

- Misalignment: the prior art list is a useful set of links but does not
  explain which framework features adopt which paradigms, making it hard for
  new contributors to understand the design decisions.
- Task: complete the decision matrix table added in the rationale update;
  ensure every paradigm cluster has at least one codebase example.
- Recommendation: the table is now in the rationale; verify each example path
  still exists and update if files have moved.

---

## unified-handler-test.md

**16. The annotation syntax (`@name`, `@retry`, `@parallel`) is not implemented.**

- Misalignment: the rationale describes a proxy-based annotation syntax for
  injecting `$meta` properties and step policies; no such proxy exists in the
  handler or `blong-chain` codebase.
- Task: implement the `@name` annotation as a minimal first step (it unblocks
  the naming context problem for test handlers).
- Recommendation: implement `@name` first; defer `@retry` and `@parallel`
  until `@name` is validated in production-scale test suites.

**17. The `group(name)([...steps])` pattern is still the only naming mechanism.**

- Misalignment: the rationale positions `group()` as a legacy pattern to be
  replaced by proxy-based name injection, but the existing test handlers in
  `core/config-hot-reload` still use `group()` exclusively.
- Task: keep `group()` working; add proxy-based naming as an opt-in
  alternative and migrate example handlers incrementally.
- Recommendation: backwards-compatible addition; do not deprecate `group()`
  until the new mechanism is proven in at least one real test suite.
