/**
 * Tests for the CI report pipeline.
 *
 * Covers the pure conversions (tap json, vitest json, lcov), the aggregation,
 * the rendered markdown and the base-branch rebuild rules. The end-to-end
 * variant — fixture monorepo plus the real `ci-report` command — is
 * `npm run report:local`.
 */

import {mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {
    buildAggregateSummary,
    buildFailuresBundle,
    buildMetricsSnapshot,
    buildTapRun,
    buildVitestRun,
    collectFailures,
    collectPublishable,
    collectReports,
    indexProvenance,
    parseLcov,
    parseTapJson,
    readHistory,
    readRushProjects,
    rebuildHistory,
    rebuildMetrics,
    renderCiReport,
    reportOf,
    sliceForPackage,
    writeCiReport,
    writeReport,
    type IMetrics,
    type IReport,
} from '@feasibleone/blong-dev';
import {test} from 'tap';

import {createFixtureWorkspace} from './fixtureWorkspace.ts';

const fixtures = join(import.meta.dirname, 'fixtures');

function readFixture<T>(name: string): T {
    return JSON.parse(readFileSync(join(fixtures, name), 'utf8')) as T;
}

test('buildTapRun converts tap json into the report contract', async t => {
    const report = buildTapRun(
        parseTapJson(readFileSync(join(fixtures, 'tap.json'), 'utf8')),
        1,
        123,
    );

    t.same(
        report.counts,
        {total: 3, passed: 2, failed: 1, flaky: 0, skipped: 0, todo: 0},
        'counts',
    );
    t.equal(report.status, 'failed', 'package status');
    t.equal(report.runner, 'tap', 'runner');
    t.equal(report.suites.length, 1, 'one suite per test file');
    t.equal(report.suites[0]?.file, 'src/example.test.ts', 'suite file');

    const failure = report.suites[0]?.tests.find(entry => entry.status === 'failed');
    t.equal(
        failure?.name,
        'adds numbers › adds 2 and 2',
        'suite name is not repeated in the test name',
    );
    t.equal(failure?.file, 'src/example.test.ts', 'failure file comes from diag.at');
    t.equal(failure?.line, 14, 'failure line comes from diag.at');
    t.match(failure?.message ?? '', /-4\n\+5/, 'failure message keeps the diff');
    t.match(failure?.stack ?? '', /src\/example\.test\.ts:14/, 'failure stack is preserved');
    t.end();
});

test('buildTapRun counts a subtest with no assertions as a test', async t => {
    // How the blong runtime nests realm tests: a subtest that runs and makes no
    // assertions of its own, so tap records an empty plan (with `skipAll`) while
    // its TAP reporter still prints `ok N - <name>`. Counted as "not a test"
    // these silently disappear from the report — which is how every realm suite
    // ended up reporting zero tests.
    const report = buildTapRun(
        {
            failures: 0,
            skipped: 2,
            tests: 3,
            suites: [
                {
                    name: 'index.test.ts',
                    ok: true,
                    suites: [
                        {
                            name: 'e2e flow',
                            ok: true,
                            plan: {start: 1, end: 2},
                            suites: [
                                {
                                    name: 'addGadget',
                                    ok: true,
                                    time: 4.7,
                                    plan: {start: 1, end: 0, skipAll: true},
                                },
                                {
                                    name: 'findGadget',
                                    ok: true,
                                    time: 0.7,
                                    plan: {start: 1, end: 0, skipAll: true},
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        0,
    );

    t.same(
        report.counts,
        {total: 2, passed: 2, failed: 0, flaky: 0, skipped: 0, todo: 0},
        'both subtests are tests',
    );
    t.equal(report.status, 'passed', 'an empty plan is not a skip');
    t.same(
        report.suites[0]?.tests.map(entry => entry.name),
        ['e2e flow › addGadget', 'e2e flow › findGadget'],
        'a leaf subtest is named after its group path',
    );
    t.end();
});

test('buildTapRun honours an explicit skip or todo on a subtest', async t => {
    const report = buildTapRun(
        {
            failures: 0,
            suites: [
                {
                    name: 'index.test.ts',
                    ok: true,
                    suites: [
                        {name: 'skipped group', ok: true, skip: true},
                        {name: 'todo group', ok: true, todo: 'not yet'},
                        {name: 'ran fine', ok: true},
                    ],
                },
            ],
        },
        0,
    );

    t.same(
        report.counts,
        {total: 3, passed: 1, failed: 0, flaky: 0, skipped: 1, todo: 1},
        'skip and todo are kept apart',
    );
    t.end();
});

test('buildTapRun stays green when tap only counted skips as failures', async t => {
    // tap's JSON `failures` counts skipped tests: two skips report `failures: 2`
    // with `skipped: 2` and the process still exits 0. Reading that counter as
    // "a failure the report lost" turned a green suite (core/semantic-log) red.
    const report = buildTapRun(
        {
            failures: 2,
            skipped: 2,
            suites: [
                {
                    name: 'src/local-model.test.ts',
                    ok: true,
                    cases: [
                        {
                            ok: true,
                            name: 'the real model is the one the docs name',
                            skip: 'needs the model',
                        },
                        {ok: true, name: 'a paraphrase ranks first', skip: 'needs the model'},
                    ],
                },
            ],
        },
        0,
    );

    t.same(
        report.counts,
        {total: 2, passed: 0, failed: 0, flaky: 0, skipped: 2, todo: 0},
        'skips are skips',
    );
    t.equal(report.status, 'passed', 'exit code 0 is the verdict');
    t.end();
});

test('buildTapRun never reports green when tap failed without naming a test', async t => {
    const report = buildTapRun({failures: 0, suites: []}, 3);
    t.equal(report.counts.failed, 1, 'a synthetic failure is recorded');
    t.equal(report.status, 'failed', 'status is failed');
    t.match(report.suites[0]?.name ?? '', /unparsed/, 'flagged as unparsed');
    t.match(report.suites[0]?.tests[0]?.name ?? '', /exited with code 3/, 'names the exit code');
    t.end();
});

test('buildTapRun names a crashed test file after the file itself', async t => {
    // What tap reports when a test file dies before producing assertions: the
    // suite is not ok with no cases and a process-exit diagnostic.
    const report = buildTapRun(
        {
            failures: 1,
            suites: [
                {
                    name: 'examples/error-demo.test.ts',
                    ok: false,
                    diag: {
                        stdio: 'pipe',
                        exitCode: 1,
                        at: {fileName: 'examples/error-demo.test.ts'},
                    },
                },
            ],
        },
        1,
    );

    const [failure] = report.suites[0]!.tests;
    t.equal(failure?.name, 'examples/error-demo.test.ts', 'named after the file, not "(suite)"');
    t.equal(failure?.status, 'failed', 'reported as failed');
    t.equal(failure?.file, 'examples/error-demo.test.ts', 'keeps the location');
    t.match(failure?.message ?? '', /exited with code 1/, 'explains the crash');
    t.end();
});

test('parseTapJson tolerates surrounding noise', async t => {
    t.equal(parseTapJson(''), null, 'empty output yields null');
    t.equal(parseTapJson('not json at all'), null, 'garbage yields null');
    const wrapped = parseTapJson('# warning\n{"failures":0,"suites":[]}\n# trailing');
    t.equal(wrapped?.failures, 0, 'json surrounded by comments is still parsed');
    t.end();
});

test('buildVitestRun maps statuses and failures', async t => {
    const report = buildVitestRun(readFixture('vitest.json'), '/repo/core/fake-component');

    t.equal(report.runner, 'vitest', 'runner');
    t.equal(report.counts.total, 4, 'all assertions counted');
    t.equal(report.counts.failed, 1, 'one failure');
    t.equal(report.counts.skipped, 1, 'pending maps to skipped');

    const failure = collectFailures([
        reportOf({package: 'fake-component', path: 'core/fake-component'}, [report]),
    ])[0];
    t.equal(failure?.name, 'Widget › applies the theme', 'describe blocks prefix the test name');
    t.equal(failure?.message, "expected 'dark' to be 'light'", 'failure message');
    t.equal(failure?.line, 22, 'failure line');
    t.end();
});

test('parseLcov aggregates per package', async t => {
    const coverage = parseLcov(readFileSync(join(fixtures, 'lcov.info'), 'utf8'));

    t.same(coverage.lines, {hit: 260, found: 350}, 'totals');
    t.same(coverage.packages.get('blong-gogo'), {hit: 120, found: 200}, 'core/ package key');
    t.same(coverage.packages.get('blong-access'), {hit: 90, found: 100}, 'realm/ package key');
    t.same(coverage.packages.get('blong-ci-report'), {hit: 50, found: 50}, 'test/ package key');
    t.end();
});

test('collectReports reads every package listed in rush.json', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-report-'));
    try {
        const {packages} = createFixtureWorkspace(dir);
        t.equal(readRushProjects(dir).length, 5, 'all projects are known');
        const reports = collectReports(dir);
        t.equal(reports.length, packages.length, 'only packages with a report are collected');
        t.same(
            reports.map(report => report.package),
            ['fake-pass', 'fake-both', 'fake-fail', 'fake-flaky'],
            'ordered by package path',
        );
        t.end();
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('a package that ran two runners keeps both, not the last one', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-report-'));
    try {
        createFixtureWorkspace(dir);
        const both = collectReports(dir).find(report => report.package === 'fake-both');
        t.ok(both, 'the two-runner package produced a report');
        t.same(
            both?.runs.map(run => run.runner),
            ['tap', 'playwright'],
            'both runners survived the write',
        );
        t.same(
            both?.counts,
            {total: 6, passed: 4, failed: 1, flaky: 0, skipped: 0, todo: 1},
            'the package counts are the sum of every run',
        );
        t.equal(both?.status, 'failed', 'the worst run decides the package status');

        const failures = collectFailures(collectReports(dir));
        const failing = failures.filter(failure => failure.package === 'fake-both');
        t.equal(failing.length, 1, 'only the failing run contributes a problem');
        t.equal(failing[0]?.runner, 'playwright', 'the failure names its runner');
        t.equal(
            failures.filter(failure => failure.runner === 'playwright').length,
            3,
            'playwright failures from both packages are in one list',
        );
        t.end();
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('aggregate summary and failures keep failed tests before flaky ones', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-report-'));
    try {
        createFixtureWorkspace(dir);
        const reports = collectReports(dir);
        const coverage = parseLcov(readFileSync(join(dir, 'coverage', 'lcov.info'), 'utf8'));
        const failures = collectFailures(
            reports,
            indexProvenance(readHistory(join(dir, '.github', 'history.jsonl'))),
        );
        const summary = buildAggregateSummary(reports, failures, readRushProjects(dir).length, {
            coverage,
            baseline: baselineFixture(),
        });

        t.equal(summary.totals.packages, 5, 'packages without a report are still counted');
        t.equal(summary.totals.packagesWithReport, 4, 'packages with a report');
        t.equal(summary.totals.failingPackages, 2, 'packages with failures');
        t.equal(summary.totals.tests, 32, 'tests across every report');
        t.equal(summary.totals.skipped, 1, 'tests that were skipped');
        t.equal(summary.totals.todo, 1, 'and ones that were left as todo');
        t.equal(failures.length, 4, 'three failures plus one flaky');
        t.equal(failures[0]?.status, 'failed', 'failures come first');
        t.equal(failures[3]?.status, 'flaky', 'flaky last');

        const row = summary.packages.find(entry => entry.package === 'fake-both');
        t.same(row?.runners, ['tap', 'playwright'], 'the aggregate row names every runner');
        t.equal(row?.counts.total, 6, 'the aggregate row counts every run');
        t.equal(row?.durationMs, 54_000, 'and says what the package cost');
        t.equal(summary.totals.durationMs, 135_200, 'the run cost is the sum of the packages');

        // Provenance: the same history `ci-report` reads decides, per failure, whether
        // the base branch was already red on it.
        const kindOf = (name: string) =>
            failures.find(failure => failure.name === name)?.history?.kind;
        t.equal(kindOf('logs in as the seeded user'), 'recurring', 'main is red on this one');
        t.equal(kindOf('opens the report tab'), 'new', 'main is green on this one');
        t.equal(kindOf('retries a transient failure'), 'intermittent', 'this one flakes');
        t.equal(kindOf('opens the roles tab'), 'new', 'and this one was green');
        t.equal(summary.totals.newFailures, 2, 'two failures are this branch’s doing');

        t.same(
            summary.coverageMovers.map(mover => [mover.package, mover.deltaPp, mover.deltaLines]),
            [
                ['fake-pass', 10, 10],
                ['fake-fail', -5, -10],
                ['fake-silent', -0.4, -479],
            ],
            'coverage movers are ranked by how far they moved',
        );
        t.end();
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

/** The base-branch baseline the fixture renders against, shared by both tests. */
function baselineFixture(): IMetrics {
    return {
        schema: 1,
        commit: '',
        run: 1,
        updatedAt: '',
        tests: {total: 20, passed: 20, failed: 0, flaky: 0, durationMs: 120_000},
        coverage: {lines: {hit: 100, found: 300}},
        packages: {
            'fake-pass': {
                tests: {passed: 10, failed: 0, flaky: 0, total: 10, durationMs: 8000},
                coverage: {linesHit: 70, linesTotal: 100},
            },
            'fake-fail': {
                tests: {passed: 8, failed: 0, flaky: 0, total: 8, durationMs: 60_000},
                coverage: {linesHit: 60, linesTotal: 200},
            },
            // A loss too small to be a regression: the row that shows the third mark.
            'fake-silent': {coverage: {linesHit: 504, linesTotal: 1000}},
        },
    };
}

test('the failures bundle carries the provenance an agent reads first', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-report-'));
    const outDir = join(dir, 'out');
    try {
        createFixtureWorkspace(dir);
        const reports = collectReports(dir);
        const failures = collectFailures(
            reports,
            indexProvenance(readHistory(join(dir, '.github', 'history.jsonl'))),
        );

        const bundle = await buildFailuresBundle({
            root: dir,
            outDir,
            reports,
            failures,
            meta: {repository: 'fixture/blong', workflow: 'Build', run: 551},
            // Allure is not installed in a unit run; the bundle writes its JSON either
            // way, which is the part an agent is expected to read.
            runAllure: async () => 0,
        });

        t.ok(bundle, 'a red run produces a bundle');
        const json = JSON.parse(readFileSync(bundle!.failuresJson, 'utf8')) as {
            totals: {
                packages: number;
                tests: number;
                failed: number;
                flaky: number;
                newFailures: number;
            };
            packages: Array<{
                package: string;
                runners: string[];
                failures: Array<{test: string; runner: string; history?: {kind: string}}>;
            }>;
        };

        t.equal(json.totals.tests, 4, 'every failing test is in the bundle');
        t.equal(json.totals.flaky, 1, 'the flaky one is counted apart');
        t.equal(json.totals.newFailures, 2, 'and the new ones are counted');
        const both = json.packages.find(entry => entry.package === 'fake-both');
        t.same(both?.runners, ['tap', 'playwright'], 'a two-runner package lists both legs');
        t.same(
            both?.failures.map(failure => [failure.test, failure.runner, failure.history?.kind]),
            [['opens the roles tab', 'playwright', 'new']],
            'the failure is attributed to its leg and to main',
        );
        t.equal(
            json.packages
                .find(entry => entry.package === 'fake-fail')
                ?.failures.find(failure => failure.test === 'logs in as the seeded user')?.history
                ?.kind,
            'recurring',
            'a failure main is red on is marked as such',
        );

        const summary = readFileSync(bundle!.summaryMd, 'utf8');
        t.match(
            summary,
            /logs in as the seeded user\*\* — `realm\/fake-fail\/test\/logs-in-as-the-seeded-user\.play\.ts:42` — `recurring`/,
            'the human summary says it too',
        );
        t.end();
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('renderCiReport merges metrics, coverage, deltas and links into one table', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-report-'));
    try {
        createFixtureWorkspace(dir);
        const reports = collectReports(dir);
        const failures = collectFailures(
            reports,
            indexProvenance(readHistory(join(dir, '.github', 'history.jsonl'))),
        );
        const coverage = parseLcov(readFileSync(join(dir, 'coverage', 'lcov.info'), 'utf8'));
        // What the workflow's publish matrix would be built from: a package with
        // a `publish/` payload, which is what the Report column links to.
        t.same(
            collectPublishable(dir, reports),
            ['fake-fail'],
            'only the Playwright package is publishable',
        );

        const markdown = renderCiReport({
            reports,
            failures,
            coverage,
            baseline: baselineFixture(),
            run: 551,
            totalPackages: 5,
            links: {
                base: 'https://example.test/blong-ci',
                workflow: 'Build',
                run: 551,
                packages: ['fake-fail'],
                coverage: true,
                failures: true,
            },
        });

        t.match(markdown, /^## CI Summary/, 'headline');
        t.match(
            markdown,
            /\*\*4 package\(s\) · 26 passed, 3 failed, 1 flaky \(32 total\) · 2m 15s \(\+15s\) of test time\*\* — build #551/,
            'totals line carries the counts, what the run cost, and how that compares',
        );
        t.match(
            markdown,
            /\*by runner: tap 20 · playwright 12 \(3 failed\)\*/,
            'the suite is divided by runner',
        );
        t.match(markdown, /1 package\(s\) produced no test report/, 'missing package warning');
        t.match(
            markdown,
            /> 1 skipped, 1 todo in 2 package\(s\): fake-both 1, fake-flaky 1\./,
            'tests that did not run are called out',
        );
        t.match(
            markdown,
            /> Failures: 2 new \(green on main\) · 1 already failing there · 1 intermittent there\./,
            'failures are attributed to this branch or to main',
        );
        t.match(
            markdown,
            /vs last merged main: tests 32 \(\+12\), coverage 44\.3% \(\+11\.0pp\)/,
            'aggregate deltas',
        );
        t.match(
            markdown,
            /^\| Package \| Result \| Passed \| Failed \| Flaky \| Not run \| Total \| Duration \| Coverage \| Report \|$/m,
            'the row carries its own numbers and their deltas, with no separate delta column',
        );
        t.match(
            markdown,
            /^\| fake-pass \| ✅ \| 12 \| 0 \| 0 \| — \| 12 \(\+2\) \| 4\.2s \(-3\.8s\) \| 🟢 80% \(\+10\.0pp\) \| — \|$/m,
            'a grown package: test delta, faster than before, coverage up',
        );
        t.match(
            markdown,
            /^\| fake-both \(tap 4 · playwright 2 ❌\) \| ❌ \| 4 \| 1 \| 0 \| 1 \| 6 \| 54s ⏱️ opens the roles tab 8\.2s \| — \| — \|$/m,
            'a two-runner package names its legs, and its slowest test sits in the duration cell',
        );
        t.match(
            markdown,
            /^\| fake-fail \| ❌ \| 8 \| 2 \| 0 \| — \| 10 \(\+2\) \| 1m 05s \(\+5\.0s\) ⏱️ logs in as the seeded user 11s \| 🔴 25% \(-5\.0pp\) \| \[report\]\(https:\/\/example\.test\/blong-ci\/fake-fail\/Build\/551\/\) \|$/m,
            'a regressed package links its published report',
        );
        t.match(
            markdown,
            /^\| fake-silent \| — \| — \| — \| — \| — \| — \| — \| 🟡 50% \(-0\.4pp\) \| — \|$/m,
            'a package with coverage but no report still gets a row, marked as a small loss',
        );
        t.notMatch(markdown, /### Slowest tests/, 'the slow tests are marked in the table');
        t.notMatch(markdown, /### Coverage movers/, 'and so are the coverage moves');
        t.notMatch(markdown, /Δ Tests/, 'the separate delta column is gone');

        // Coverage that did not move gets no mark at all: the mark says which way, so
        // there is nothing to say, and the delta in the cell already reads as zero.
        const steady = renderCiReport({
            reports,
            failures,
            coverage,
            baseline: {
                ...baselineFixture(),
                packages: {
                    ...baselineFixture().packages,
                    'fake-pass': {
                        tests: {passed: 10, failed: 0, flaky: 0, total: 10, durationMs: 8000},
                        coverage: {linesHit: 80, linesTotal: 100},
                    },
                },
            },
        });
        t.match(
            steady,
            /^\| fake-pass \| ✅ \| 12 \| 0 \| 0 \| — \| 12 \(\+2\) \| 4\.2s \(-3\.8s\) \| 80% \(0\.0pp\) \|/m,
            'an unmoved coverage number carries no mark',
        );
        t.match(markdown, /### Failed suites \(4 test\(s\)\)/, 'failed suites section');
        t.match(
            markdown,
            /\| fake-both \(playwright\) \| fake-both\.playwright\.test \| opens the roles tab \| 🔴 failed \| new \|/,
            'a failure of a two-runner package is attributed to its runner, and to main',
        );
        t.match(
            markdown,
            /\| fake-fail \| fake-fail\.playwright\.test \| logs in as the seeded user \| 🔴 failed \| recurring \|/,
            'a failure main is already red on says so',
        );
        t.match(
            markdown,
            /\| fake-flaky \| fake-flaky\.tap\.test \| retries a transient failure \| 🟡 flaky \| intermittent \|/,
            'and a flaky one is not blamed on the branch',
        );
        t.match(
            markdown,
            /📊 \[Coverage report\]\(https:\/\/example\.test\/blong-ci\/coverage\/Build\/551\/\)/,
            'aggregate coverage link',
        );
        t.match(
            markdown,
            /🤖 Failure report: \[this run\]\(https:\/\/example\.test\/blong-ci\/failures\/Build\/551\/failures\.json\) · \[latest\]\(https:\/\/example\.test\/blong-ci\/failures\/Build\/latest\/failures\.json\)/,
            'agent entry points for this run and the stable alias',
        );
        t.notMatch(markdown, /Published reports/, 'links are not repeated in a separate table');
        t.end();
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('renderCiReport drops the link columns when publishing is not configured', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-report-'));
    try {
        createFixtureWorkspace(dir);
        const markdown = renderCiReport({
            reports: collectReports(dir),
            failures: [],
            coverage: parseLcov(readFileSync(join(dir, 'coverage', 'lcov.info'), 'utf8')),
            run: 1,
        });

        t.notMatch(markdown, /\| Report \|/, 'no report column without a base URL');
        t.notMatch(markdown, /Failure report/, 'no failure-report line without a bundle');
        t.match(markdown, /\| Coverage \|/, 'coverage stays where it is useful');
        t.end();
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('renderCiReport leaves the deltas out when there is no baseline', async t => {
    // The first run of a branch has nothing to compare against: every cell shows the
    // measurement alone, rather than a zero delta that reads like "nothing changed".
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-report-'));
    try {
        createFixtureWorkspace(dir);
        const markdown = renderCiReport({
            reports: collectReports(dir),
            failures: [],
            coverage: parseLcov(readFileSync(join(dir, 'coverage', 'lcov.info'), 'utf8')),
        });

        t.match(markdown, /· 2m 15s of test time\*\*/, 'the run cost is stated without a delta');
        t.notMatch(markdown, /\(\+15s\)/, 'and no duration delta is invented');
        t.match(
            markdown,
            /^\| fake-fail \| ❌ \| 8 \| 2 \| 0 \| — \| 10 \| 1m 05s ⏱️ logs in as the seeded user 11s \| 25% \|$/m,
            'counts, time and coverage stand on their own',
        );
        t.notMatch(markdown, /🟢|🔴|🟡/, 'and nothing is marked green, red or unchanged');
        t.end();
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('renderCiReport copes with a run that produced no reports', async t => {
    const markdown = renderCiReport({reports: [], failures: []});
    t.match(markdown, /No package produced a `\.ci-report\/` report/, 'explains the empty run');
    t.end();
});

test('writeCiReport writes the artifact even when a step summary is set', async t => {
    // The CI shape: `GITHUB_STEP_SUMMARY` is set, and the workflow still has to
    // find `ci-report.md` to upload and post. Writing only the summary is what
    // silently produced a run with no comment at all.
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-report-summary-'));
    try {
        const summary = join(dir, 'run-summary.md');
        const file = writeCiReport('## CI Summary\n\nbody', dir, summary);

        t.equal(file, join(dir, 'ci-report.md'), 'returns the artifact path');
        t.equal(
            readFileSync(join(dir, 'ci-report.md'), 'utf8'),
            '## CI Summary\n\nbody\n',
            'the artifact exists next to the step summary',
        );
        t.equal(
            readFileSync(summary, 'utf8'),
            '## CI Summary\n\nbody\n',
            'the run summary gets the same bytes',
        );

        const localDir = join(dir, 'local');
        mkdirSync(localDir);
        t.equal(
            readFileSync(writeCiReport('inline', localDir, ''), 'utf8'),
            'inline\n',
            'written without a step summary as well',
        );
        t.end();
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('writeReport emits both contract files', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-report-pkg-'));
    try {
        const report: IReport = reportOf({package: 'fake', path: 'core/fake'}, [
            {
                runner: 'tap',
                status: 'failed',
                counts: {total: 2, passed: 1, failed: 1, flaky: 0, skipped: 0, todo: 0},
                durationMs: 42,
                generatedAt: '2026-01-01T00:00:00.000Z',
                suites: [
                    {
                        name: 'a.test.ts',
                        file: 'a.test.ts',
                        status: 'failed',
                        counts: {total: 2, passed: 1, failed: 1, flaky: 0, skipped: 0, todo: 0},
                        tests: [
                            {name: 'works', status: 'passed'},
                            {
                                name: 'breaks',
                                status: 'failed',
                                message: 'boom',
                                file: 'a.test.ts',
                                line: 7,
                            },
                        ],
                    },
                ],
            },
        ]);
        writeReport(report, dir);

        const summary = readFileSync(join(dir, '.ci-report', 'summary.md'), 'utf8');
        t.match(summary, /^### ❌ fake — 1 passed, 1 failed \(2 total\)/, 'heading contract');
        t.match(summary, /\| 🔴 failed \| breaks/, 'failure row');
        const roundTrip = JSON.parse(
            readFileSync(join(dir, '.ci-report', 'report.json'), 'utf8'),
        ) as IReport;
        t.equal(roundTrip.counts.failed, 1, 'report.json round-trips');
        t.end();
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('rebuildMetrics always describes the base branch plus this run', async t => {
    const snapshot: IMetrics = {
        schema: 1,
        commit: 'abc',
        run: 100,
        updatedAt: '2026-01-02T00:00:00.000Z',
        tests: {total: 5, passed: 5, failed: 0, flaky: 0},
        coverage: {lines: {hit: 1, found: 2}},
        packages: {},
    };
    const base: IMetrics = {
        ...snapshot,
        run: 99,
        history: [
            {commit: 'old', run: 99, date: '', tests: snapshot.tests, coverage: snapshot.coverage},
        ],
    };

    const first = rebuildMetrics(base, snapshot, 5);
    const second = rebuildMetrics(base, snapshot, 5);
    t.same(
        first.history?.map(entry => entry.run),
        [100, 99],
        'this run first, then the base branch',
    );
    t.same(second.history, first.history, 'repeated runs are idempotent');
    t.equal(
        rebuildMetrics({...base, history: [first.history![0]!]}, snapshot, 5).history?.length,
        1,
        'the same run is not duplicated',
    );

    const trimmed = rebuildMetrics(
        {
            ...base,
            history: Array.from({length: 8}, (_, index) => ({
                commit: '',
                run: index,
                date: '',
                tests: snapshot.tests,
                coverage: snapshot.coverage,
            })),
        },
        snapshot,
        3,
    );
    t.equal(trimmed.history?.length, 3, 'history is bounded');
    t.end();
});

test('rebuildHistory replaces one package slice and tags it', async t => {
    const base = [
        {name: 'other package result', package: 'someone-else'},
        {name: 'stale result', package: 'fake-fail'},
    ];
    const slices = new Map([['fake-fail', [{name: 'fresh result'}]]]);

    const rebuilt = rebuildHistory(base, {slices});
    const records = rebuilt
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>);

    t.equal(records.length, 2, 'other packages survive, the rebuilt slice replaces the old one');
    t.same(records[0], {name: 'fresh result', package: 'fake-fail'}, 'new record is tagged');
    t.match(records[1]?.name as string, /other package result/, 'unrelated record preserved');
    t.same(rebuildHistory(base, {slices}), rebuilt, 'idempotent');
    t.equal(rebuildHistory([], {slices: new Map()}), '', 'no records yields no file');
    t.end();
});

test('rebuildHistory orders records by package tag', async t => {
    // The file is committed and merged by tag, so the line order must not depend
    // on the order the packages happened to be collected in: an added or moved
    // package would otherwise rewrite unrelated lines.
    const slices = new Map([
        ['zulu', [{name: 'z1'}, {name: 'z2'}]],
        ['alpha', [{name: 'a1'}]],
    ]);
    const records = rebuildHistory([], {slices})
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>);

    t.same(
        records.map(record => record['package']),
        ['alpha', 'zulu', 'zulu'],
        'packages sorted by tag',
    );
    t.same(
        records.map(record => record['name']),
        ['a1', 'z1', 'z2'],
        "a package's own runs keep their order",
    );
    t.end();
});

test('buildMetricsSnapshot orders packages by name', async t => {
    const report = (pkg: string, path: string): IReport =>
        reportOf({package: pkg, path}, [
            {
                runner: 'tap',
                status: 'passed',
                counts: {total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, todo: 0},
                generatedAt: '2026-01-01T00:00:00.000Z',
                suites: [],
            },
        ]);

    // Collected in folder order, which is neither name order nor stable when a
    // package moves between category folders.
    const snapshot = buildMetricsSnapshot(
        [report('zulu', 'demo/zulu'), report('alpha', 'core/alpha'), report('mike', 'realm/mike')],
        null,
        {now: '2026-01-01T00:00:00.000Z'},
    );

    t.same(
        Object.keys(snapshot.packages),
        ['alpha', 'mike', 'zulu'],
        'keys sorted by package name',
    );
    t.same(
        Object.keys(
            buildMetricsSnapshot([report('zulu', 'demo/zulu'), report('alpha', 'a/alpha')], null)
                .packages,
        ),
        ['alpha', 'zulu'],
        'a package moving folder does not move its key',
    );
    t.end();
});

test('the metrics snapshot carries the test time the next run compares against', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-report-'));
    try {
        createFixtureWorkspace(dir);
        const reports = collectReports(dir);
        const snapshot = buildMetricsSnapshot(reports, null, {now: '2026-01-01T00:00:00.000Z'});

        t.equal(snapshot.tests.durationMs, 135_200, 'the run cost is recorded in the baseline');
        t.equal(
            snapshot.packages['fake-both']?.tests?.durationMs,
            54_000,
            'and per package, so a row can show its own delta',
        );

        // The rebuilt baseline is what the next run reads, so the field has to survive
        // the rebuild into the history entry as well.
        const rebuilt = rebuildMetrics(null, snapshot, 5);
        t.equal(rebuilt.history?.[0]?.tests.durationMs, 135_200, 'kept in the history entry');
        t.end();
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('sliceForPackage strips the tag it was read with', async t => {
    const records = [
        {name: 'mine', package: 'fake-fail'},
        {name: 'theirs', package: 'other'},
    ];
    t.same(sliceForPackage(records, 'fake-fail'), [{name: 'mine'}], 'tag removed for Allure');
    t.same(sliceForPackage(records, 'missing'), [], 'unknown package yields nothing');
    t.end();
});
