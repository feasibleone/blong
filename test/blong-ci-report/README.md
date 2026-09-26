# blong-ci-report

Verifies the CI test-report pipeline locally, so a change to the report contract, the aggregation,
the rendered comment or the published failures bundle can be checked without pushing a pull request.

It is a normal Rush package: `ci-test` runs its own tap suite (covering the conversions, the
aggregation, the markdown and the base-branch rebuild rules) and `ci-report` implements the hook the
CI workflow calls.

`ci-report` renders **one** document, `ci-report.md`, which is both the action run summary and the
sticky pull-request comment — so it carries everything a reader needs in one table: per-package test
counts, coverage, deltas and a link to the package's published report. The links are derived from
`CI_REPORTS_BASE` (resolved by the workflow from the reports repository's Pages URL) plus the
workflow slug and run number, which is what allows the report to be complete before anything is
published.

Around that table it prints only what the data proves, and nothing when it proves nothing. A
measurement and the comparison against the base branch live in the same cell — the delta in
parentheses after the number it compares — so nothing needs a column, or a table, of its own:

| Cell     | Shows                                                                                                                                                | Comes from                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Result   | the worst status of the package's runs                                                                                                               | `IReport.runs`                                                                                               |
| Total    | tests now, and the change against the baseline                                                                                                       | `IReport.counts`, `metrics.json`                                                                             |
| Duration | test time, its change, and the slow test behind it when it is one of the run's five slowest (marked ⏱️)                                              | `IRunReport.durationMs` — tap's wall clock, Playwright's Allure span, or the sum of the leg's test durations |
| Coverage | percentage, the percentage-point change, and a direction mark: 🟢 up, 🔴 down by more than a point, 🟡 a smaller loss, and none when it did not move | `coverage/lcov.info` against the baseline's `packages[*].coverage`                                           |
| Not run  | skipped and todo tests                                                                                                                               | `ITestCounts`, named per package because no other count can reveal a suite that stopped running              |
| History  | where each failure stands on the base branch                                                                                                         | `.github/history.jsonl`, the base branch's copy                                                              |

Above the table it states what no single row can: how many packages reported, what the whole run
cost in test time (with its own delta), how the suite divides between runners, and how the run
compares with the last merged main.

## What the pipeline looks like in CI

```text
rush ci-test            →  <pkg>/.ci-report/{report.json,summary.md}   ← one slice per runner
rush ci-coverage        →  coverage/lcov.info
rush ci-report          →  report-data/, ci-report.md, metrics.json,
                           .github/metrics.json + .github/history.jsonl (rebuilt),
                           ci-failures/publish/ (only when something failed)
commit-metrics          →  stacks the two .github files on `metrics/<branch>`
                           and opens a pull request onto the branch under test
deploy-report           →  publishes the per-package reports and the failures bundle
```

## Local runs

### 1. This package's own suite

```bash
npm run ci-test          # unit tests for the report pipeline
npm run ci-report        # aggregate whatever .ci-report/ exists in the repo
```

`npm run ci-report` reads the repository's `rush.json`, so it picks up every package that has run
tests — including the ones you just ran from other packages.

### 2. A deliberately failing run

```bash
CI_REPORT_FORCE_FAIL=1 npm run ci-test   # exits non-zero on purpose
npm run ci-report                        # builds the failures bundle
cat ci-report.md                         # the package now shows as ❌ with its failed suite
cat ci-failures/publish/failures.json    # the machine readable index agents read
```

### 3. A whole fixture monorepo, end to end

```bash
npm run report:local          # writes into the gitignored dev/ci-report-fixture/
npm run report:local -- --clean
npx --yes serve dev/ci-report-fixture/out
```

`fixtureWorkspace.ts` builds a fake monorepo (a passing tap package, a failing Playwright package
with real Allure results and a trace, a flaky package, a package that runs both tap and Playwright,
a package with no report, a package with coverage but no report, plus an lcov file) and
`report:local` runs the real `blong-dev ci-report` against it, with
`CI_REPORTS_BASE`/`GITHUB_WORKFLOW`/`GITHUB_RUN_NUMBER` set so the rendered report matches a CI one.
The printed paths mirror exactly what CI produces, including the rebuilt `.github/metrics.json` /
`.github/history.jsonl` and the published failures bundle layout (`index.html`, `failures.json`,
`failures.md`, `traces/`).

## Notes for changing the pipeline

- What a run of `blong-dev test` produces depends on whether its output is watched or captured. A
  run has one reporter, so this is a choice rather than a layer. A watched run — `blong-dev test`
  outside CI — is driven by tap's own reporter and relayed as it arrives, which is what makes a long
  step visible while it runs; its output is kept as `tap.raw.tap`, the artifact a tool reads there,
  and no `report.json` is written. A captured run — CI, or `--report` in dev — asks tap for the
  structured report instead (`--reporter-file`, so this tool never holds it), keeps the raw stream
  too (`--output-file`), and prints only the failure view.
- `report.json` is the contract of a captured run; `summary.md` is derived from it. Add a field to
  `IRunReport` or `IReport` in `tools/blong-dev/src/report/reportTypes.ts` and every runner plus the
  aggregator picks it up.
- `report.json` describes a **package**, not a runner, and is therefore written one runner's slice
  at a time: `IRunReport` is one runner's results, `IReport.runs` holds every runner that reported
  in the cycle, and `IReport.counts` is their sum. A runner drops its own slice before it starts
  (`clearRun`, so a run that dies mid-way cannot be aggregated as the previous report of that
  runner) and writes it when it finishes (`writeRun`, which replaces that runner's slice and leaves
  the others alone). Clearing is runner-scoped: a package's directory also holds the published
  Allure report and its history slice, so no runner may wipe `.ci-report/` as a whole. A package
  whose second runner ran only tests of an unrelated kind would otherwise report one producer's
  counts, because the last writer wins.
- A package with more than one run gets a per-runner table in `summary.md`, a Runner column in its
  problems table, and its runner named beside the package in the aggregate failure list — the counts
  are a sum, so a reader needs to know which leg a failing test came from. The same rule applies to
  the machine-readable views: `ci-summary.json` and `failures.json` list a package's `runners`, each
  failure carries its own `runner`, and neither carries a single package `runner`, because that
  field could only ever describe one of the legs.
- **Failure provenance** (`report/provenance.ts`) answers the question a red pull request actually
  raises: was main already red here? It reads the base branch's `.github/history.jsonl` and calls a
  failure `new` (green in every recent base run), `recurring` (red the last time base ran it) or
  `intermittent` (red earlier, green since). It is a **hint matched by name**, not a join by id, and
  it says `unknown` rather than guessing: Allure's result `id` is not stable across runs, so
  `fullName` is the only stable identity, and the two producers do not even share a separator — the
  browser leg writes `file › suite › title`, the handler leg `realm.collection.group.step`. The
  index therefore normalises both into a segment list and matches suffixes, exact full names first,
  and a name that two tests of one package claim in one run is dropped as ambiguous. `ITestEntry`
  carries the producer's `fullName` for exactly this; a runner that does not record one still
  matches when its test name is unique.
- Durations are **summed**, not overlapped: a package's runners run one after the other
  (`blong-dev test && blong-dev playwright`), so the total is test time, not the wall clock of a CI
  job — how packages are spread over job runners is the workflow's business. A runner that reports
  no duration at all (a watched run, a suite that timed nothing) contributes zero and is left out of
  the slow-test marks rather than being credited with time it did not measure. The time is also
  written into `metrics.json` — `tests.durationMs` and `packages[*].tests.durationMs` — because a
  duration delta needs a baseline to compare against; a baseline committed before that field existed
  simply has none, and the report then states the time without a delta instead of inventing one.
- A package can have more than one Allure producer: its browser tests write `allure-results`, its
  handler tests write `allure-results-tap`. `publishAllureReport` merges whatever producers left
  results into the one report a package publishes, with that package's history slice — so a second
  producer adds a results directory rather than a second report link and a second trend line.
- Keep history writes **idempotent**: the committed files are always rebuilt as "base branch + this
  run", never appended to (see `rebuildHistory` and `rebuildMetrics`), otherwise repeated runs of
  one pull request accumulate data.
- The failures bundle must keep `failures.json` self-sufficient: an agent is expected to read it
  instead of the CI log or the Allure HTML.
- The baseline reaches the base branch through a **stacked pull request** (`metrics/<branch>` → the
  branch under test, opened by `commit-metrics`), never as a commit on the branch itself: a metrics
  commit is skipped, so committing it would leave the branch tip with checks that never run and hide
  the checks of the commit that was actually tested. Merging the stacked pull request is what
  carries it on to `main`; leaving it unmerged is harmless, because the next run rebuilds the
  baseline as "base branch + this run" and refreshes the same pull request.
- Do not add a second rendering step in the workflow. The report is complete when `ci-report`
  finishes, which is what keeps the action summary and the pull-request comment identical; the
  published URLs are _predicted_ there (base URL + workflow slug + run number) rather than collected
  from the publish jobs.
