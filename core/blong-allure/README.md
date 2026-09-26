# blong-allure

Allure 3 test reporting integration for the Blong framework.

## Overview

`blong-allure` bridges `blong-chain`'s `TestExecutor` event system to Allure 3's file-based result
format. Each test step produces a `{uuid}-result.json` file that the `allure generate` CLI
transforms into an interactive HTML report.

This is a framework-level capability available to all blong test suites, not just blong-ttk.

## Features

- **Streaming result writing**: Test results are written as they complete, so partial results
  survive crashes
- **Native Allure 3 format**: Direct JSON file writing without dependency on `allure-js-commons`
- **Progress as steps**: The points a step announced are written as nested steps, and a branch the
  step took is written as the group of the points taken inside it (see below)
- **Trace link integration**: Automatic trace links to blong-log via `$meta.traceId`
- **History tracking**: Trend analysis across runs via `allurerc.yaml` + `history.jsonl`
- **Flexible lifecycle**: Hooks for session start/end with optional report generation

## Usage

The framework wires this up for handler tests, so a suite does not call it: `blong-gogo`'s chain
runner starts one session per process (the first group that runs starts it, because starting a
session clears the results directory) and writes one result per test group when that group finishes.
The group is the test case — a scenario's steps are nested inside it, and so are the points and
branches those steps announced.

```typescript
// What the runner does, through this package's API:
await allureSessionStart({outputDir, historyPath, logUrl});

for (const group of groups) {
    const steps = await run(group); // blong-chain
    await allureGroupResultWrite(outputDir, {name: group.name, steps}, context, meta);
}

await allureSessionEnd({...config, generateOnEnd});
```

Both writers are available to a suite that runs tests its own way: `allureGroupResultWrite` for a
group (steps and their progress, nested), `allureResultWrite` for a single step.

## Configuration

Configured under the framework's `watch` key, which is the component that runs handler test groups:

| Key                    | Default                 | Meaning                                     |
| ---------------------- | ----------------------- | ------------------------------------------- |
| `allure.enabled`       | `false`                 | Write results at all                        |
| `allure.outputDir`     | `allure-results-tap`    | Where the result files go                   |
| `allure.historyPath`   | `.allure/history.jsonl` | Trend history across runs                   |
| `allure.generateOnEnd` | `false`                 | Run `allure generate` when the session ends |
| `allure.logUrl`        | —                       | Pattern with `{traceId}`, linked per result |

A captured (CI) run turns all of it on and generates the HTML report:

```yaml
ci:
    watch:
        allure: {enabled: true, generateOnEnd: true}
```

A dev run is asked for it, which is the same config key through the blong CLI:

```bash
blong integration dev --watch.allure.enabled=true
```

`allure generate` is invoked from this package's own `allure` dependency, so the reported CLI is the
one the results were written for rather than whatever the runner happens to have on its PATH.

## Several producers, one report

A package can report to Allure from more than one producer: a realm's browser tests write results,
and so do its handler tests. Each producer gets a directory of its own — `allure-results` is the
browser reporter's, `allure-results-tap` is this one's — because a session clears the directory it
writes to before a run, so two producers sharing one would erase each other depending on the order
they ran in.

The merge happens once, in `blong-dev`, after the producers have run: it stages every results
directory that holds anything, hands Allure the package's slice of the committed history, and writes
the single-file report into `.ci-report/publish/`. That is the report the CI report links and the
report the history belongs to, so a second producer adds a directory rather than a second link and a
second trend line. Each result says which producer wrote it (`source: handler-test` here), which is
what a reader filters on when one document holds both.

## Where the runner cannot report, and says so

These results are files, and a **browser platform has nowhere to write them**: it has no `node:fs`,
so the chain runner's import of this package there can only fail. The runner therefore checks the
platform _before_ it tries, and reports the one line that explains a run with no results:

```text
warn  Allure reporting is enabled for this run but the browser platform cannot write its files, so a
      report will not be produced
```

It is a warning and not an error, because nothing has gone wrong: the tests still run and are still
judged on their own outcome. And it is reported once for the run rather than once per test group,
which is what the same failure used to look like — an error per group, over a report that was never
going to exist. A browser run's results come from its own producer (the browser tests of a realm
write `allure-results` through Allure's Playwright integration), so what this withholds is what was
never this package's to write.

The package is kept out of a browser **build** as well as out of a browser run. The chain runner
imports it — lazily, and only on a platform that can write files — through a specifier it assembles
at runtime, because a specifier written as a literal is resolved by the bundler however dynamic the
import looks: written that way, this package and its `node:fs`, `node:crypto`, `node:url` and
`node:child_process` imports were landing in every browser bundle, and
`core/blong-browser/src/browserBundle.test.ts` fails on it (`blong-allure` is on that test's
server-only list, so a literal import coming back is caught by name).

## Result File Format

Each test step is written as an Allure 3 result file:

```json
{
    "uuid": "9d95e6e7-9cf6-4ca5-91b4-9b69ce0971f8",
    "historyId": "2b35e31882061875031701ba05a3cd67",
    "fullName": "realm/collection/test.stepName",
    "name": "stepName",
    "labels": [
        {"name": "parentSuite", "value": "realm"},
        {"name": "suite", "value": "collection"},
        {"name": "subSuite", "value": "group"},
        {"name": "framework", "value": "blong"},
        {"name": "language", "value": "typescript"}
    ],
    "links": [{"type": "trace", "name": "Trace", "url": "http://log.example/trace/abc123"}],
    "status": "passed",
    "start": 1682358426014,
    "stop": 1682358426892,
    "steps": []
}
```

## Progress as steps

A step reports progress while it runs — `$meta.checkpoint?.(name, data)` for a milestone and
`$meta.decide(...)` for a branch — and `blong-chain` collects what each step announced into
`IStepProgress.progress`. `allureResultWrite` maps that with `allureProgressMap` and writes it as
the result's `steps`:

- a **point** becomes a leaf step named after the point (`total-calculated`);
- a **branch** becomes a step named `<discriminator> = <chosen>` (`discount-tier = standard`) with
  the points taken inside it nested under it;
- a branch that announced nothing is still written, because it was taken.

The points carry no outcome of their own — they report what happened, not whether it was right — so
they are written `passed` and the verdict stays on the step that announced them. The nesting is
built by `progressTree` in `@feasibleone/blong-chain`, which the tap report draws from as well, so a
run's tap output and its Allure report cannot describe different shapes.

```typescript
import {allureProgressMap} from '@feasibleone/blong-allure';

allureProgressMap(step.progress);
// [{name: 'total-calculated', status: 'passed'},
//  {name: 'discount-tier = standard', status: 'passed',
//   steps: [{name: 'discount-applied', status: 'passed'}]}]
```

## Architecture

- `writer/` - Result file writing and mapping
- `lifecycle/` - Session management and event subscription
- `config/` - Configuration file generation
