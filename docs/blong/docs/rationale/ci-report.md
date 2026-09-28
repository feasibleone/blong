# Why the CI report is one document

A monorepo of forty packages that each report their own test results produces the failure mode every
CI system eventually reaches: a green check nobody trusts, a wall of per-package logs, and a
question at the end of it — "is this failure new?" — that no single artefact can answer. The build
is slow because it is thorough, and the thoroughness is invisible because nobody reads four
gigabytes of logs.

The decision this page records is that **the run summary and the pull-request comment are the same
document**. `ci-report.md` is written once per run, published as an artefact and used verbatim as
the comment. There is no summary that summarises the summary, nothing to reconcile when the two
disagree, and nothing a reviewer has to read twice.

## One row per package, and the delta in the same cell

The report's core is a table with one row per test package. Its shape follows from a rule that
sounds like a detail and is not: **the change against the base branch lives in the same cell as the
value it changed.** A count is `10 (+2)`; a duration is `1m 05s (+5.0s)`; coverage is
`🔴 25% (-5.0pp)`. No column is needed for "what changed", so the reader compares nothing: a
regression is the number with a minus sign beside it, in the place the number already is.

| Package   | Result | Passed | Failed | Flaky | Not run | Total   | Duration                              | Coverage        | Report     |
| --------- | ------ | ------ | ------ | ----- | ------- | ------- | ------------------------------------- | --------------- | ---------- |
| fake-fail | ❌     | 8      | 2      | 0     | —       | 10 (+2) | 1m 05s (+5.0s) ⏱️ logs in as the… 11s | 🔴 25% (-5.0pp) | `[report]` |

(That row is the fixture's output — `npm run report:local` in `test/blong-ci-report` — shortened
only in the width of the slowest test's name and the report link.)

The columns that carry decisions rather than counts:

- **Result** — one icon per package, worst-status wins, and `⚠️` for a package that passed _with_
  flaky tests, so a suite that survives by retrying is not reported as healthy.
- **Coverage** — against the committed baseline, with a mark for a regression beyond one percentage
  point, and nothing when a package did not measure coverage this run.
- **Not run** — `skipped + todo`, emitted only when some package has one, because a suite that
  silently skipped half its tests is a green that must not look like the others.
- **Duration** — the run's total, the change, and the slowest single test's name, which is the one
  piece of information that makes "the build got slower" actionable.
- **Report** — a link to the published detail, predicted from the reporting base rather than patched
  in afterwards, so the document is complete before anything is published.

## Three runners, one contract

The monorepo does not agree on a test runner, and that is deliberate: tap for the framework
packages, Playwright with Allure for the browser suites, vitest for `blong-browser`. What they agree
on is the **contract** — a per-package slice in `.ci-report/` — which each adapter writes:

| Runner              | Adapter                                    | Who writes it          |
| ------------------- | ------------------------------------------ | ---------------------- |
| tap                 | `report/tapReport.ts`                      | `blong-dev test`       |
| Playwright + Allure | `report/allurePublish.ts`                  | `blong-dev playwright` |
| vitest              | `report/vitestReport.ts` (`report vitest`) | the package itself     |

Aggregation is then a sum over slices, not a runner-specific reader, which is the property that
keeps a new package cheap: choose a runner, wire its adapter, and the report learns nothing new. The
coverage half of this story — how the three runners' line data is merged — belongs to
[code coverage](../concepts/code-coverage.md).

## History, provenance, and the question "is this new?"

A failure is only useful if the reader can tell whether it predates the branch, so each failing test
is characterised against the base branch's history:

| Provenance     | Meaning                                                    |
| -------------- | ---------------------------------------------------------- |
| `new`          | green on the base branch, red here — the branch broke it   |
| `recurring`    | already failing on the base — not this branch's doing      |
| `intermittent` | it has passed and failed before — flaky, and now it counts |

The history comes from `.github/history.jsonl`, which is _rebuilt_ per run from the per-package
slices rather than appended to, so a rebase cannot leave two histories interleaved. The baseline
numbers — totals, duration, coverage — live in `.github/metrics.json`, which is what the deltas are
computed against.

When a run is red, a **failure bundle** is published beside the report: an HTML index, the failing
tests as JSON and markdown, and the traces. It is built only for a red run and the previous bundle
is removed first, so a green build cannot leave a stale bundle behind for someone to debug months
later.

Flaky tests are surfaced rather than averaged away. They are counted in their own column, marked in
the result icon, listed as `🟡 flaky` in the failures table, and separated inside the bundle —
because the alternative, one passing count with the retries hidden inside it, is a build whose
health nobody can measure. The rerun and selective-failure diagnostics that would make them cheaper
to triage are described in [test rerun diagnostics](./test-rerun-diagnostics.md) and are **not
implemented** — that page is a design, and this one is a description of something that runs.

## What this repository can and cannot prove

The aggregation, the rendering, the metrics and the history are in this repository, with their tests
(`tools/blong-dev/src/report/*.test.ts`) and a local fixture that builds a complete report without
CI (`npm run report:local` in `test/blong-ci-report`, which is the invocation to use when changing
the contract). The workflow that **posts** the document as a pull-request comment lives in the
shared reusable workflow this repository calls, so the posting itself is out of sight from here: the
contract it consumes is `ci-report.md`, and that is the part this repository owns.
