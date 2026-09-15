# blong-ci-report

Verifies the CI test-report pipeline locally, so a change to the report contract, the aggregation,
the rendered comment or the published failures bundle can be checked without pushing a pull request.

It is a normal Rush package: `ci-test` runs its own tap suite (63 assertions covering the
conversions, the aggregation, the markdown and the base-branch rebuild rules) and `ci-report`
implements the hook the CI workflow calls.

## What the pipeline looks like in CI

```text
rush ci-test            →  <pkg>/.ci-report/{report.json,summary.md}
rush ci-coverage        →  coverage/lcov.info
rush ci-report          →  report-data/, ci-report.md, metrics.json,
                           .github/metrics.json + .github/history.jsonl (rebuilt),
                           ci-failures/publish/ (only when something failed)
commit-metrics          →  commits the two .github files onto the PR branch
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
with real Allure results and a trace, a flaky package, a package with no report, plus an lcov file)
and `report:local` runs the real `blong-dev ci-report` against it. The printed paths mirror exactly
what CI produces, including the rebuilt `.github/metrics.json` / `.github/history.jsonl` and the
published failures bundle layout (`index.html`, `failures.json`, `failures.md`, `traces/`).

## Notes for changing the pipeline

- `report.json` is the contract; `summary.md` is derived. Add a field to `IReport` in
  `tools/blong-dev/src/report/reportTypes.ts` and every runner plus the aggregator picks it up.
- Keep history writes **idempotent**: the committed files are always rebuilt as "base branch + this
  run", never appended to (see `rebuildHistory` and `rebuildMetrics`), otherwise repeated runs of
  one pull request accumulate data.
- The failures bundle must keep `failures.json` self-sufficient: an agent is expected to read it
  instead of the CI log or the Allure HTML.
