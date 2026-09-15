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
    buildMetricsSnapshot,
    buildTapReport,
    buildVitestReport,
    collectFailures,
    collectPublishable,
    collectReports,
    parseLcov,
    parseTapJson,
    readRushProjects,
    rebuildHistory,
    rebuildMetrics,
    renderCiReport,
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

test('buildTapReport converts tap json into the report contract', async t => {
    const report = buildTapReport(
        parseTapJson(readFileSync(join(fixtures, 'tap.json'), 'utf8')),
        'example',
        'core/example',
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

test('buildTapReport counts a subtest with no assertions as a test', async t => {
    // How the blong runtime nests realm tests: a subtest that runs and makes no
    // assertions of its own, so tap records an empty plan (with `skipAll`) while
    // its TAP reporter still prints `ok N - <name>`. Counted as "not a test"
    // these silently disappear from the report — which is how every realm suite
    // ended up reporting zero tests.
    const report = buildTapReport(
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
        'example',
        'core/example',
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

test('buildTapReport honours an explicit skip or todo on a subtest', async t => {
    const report = buildTapReport(
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
        'example',
        'core/example',
        0,
    );

    t.same(
        report.counts,
        {total: 3, passed: 1, failed: 0, flaky: 0, skipped: 1, todo: 1},
        'skip and todo are kept apart',
    );
    t.end();
});

test('buildTapReport stays green when tap only counted skips as failures', async t => {
    // tap's JSON `failures` counts skipped tests: two skips report `failures: 2`
    // with `skipped: 2` and the process still exits 0. Reading that counter as
    // "a failure the report lost" turned a green suite (core/semantic-log) red.
    const report = buildTapReport(
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
        'example',
        'core/example',
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

test('buildTapReport never reports green when tap failed without naming a test', async t => {
    const report = buildTapReport({failures: 0, suites: []}, 'example', 'core/example', 3);
    t.equal(report.counts.failed, 1, 'a synthetic failure is recorded');
    t.equal(report.status, 'failed', 'status is failed');
    t.match(report.suites[0]?.name ?? '', /unparsed/, 'flagged as unparsed');
    t.match(report.suites[0]?.tests[0]?.name ?? '', /exited with code 3/, 'names the exit code');
    t.end();
});

test('buildTapReport names a crashed test file after the file itself', async t => {
    // What tap reports when a test file dies before producing assertions: the
    // suite is not ok with no cases and a process-exit diagnostic.
    const report = buildTapReport(
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
        'example',
        'core/example',
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

test('buildVitestReport maps statuses and failures', async t => {
    const report = buildVitestReport(readFixture('vitest.json'), '/repo/core/fake-component');

    t.equal(report.runner, 'vitest', 'runner');
    t.equal(report.counts.total, 4, 'all assertions counted');
    t.equal(report.counts.failed, 1, 'one failure');
    t.equal(report.counts.skipped, 1, 'pending maps to skipped');

    const failure = collectFailures([report])[0];
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
        t.equal(readRushProjects(dir).length, 4, 'all projects are known');
        const reports = collectReports(dir);
        t.equal(reports.length, packages.length, 'only packages with a report are collected');
        t.same(
            reports.map(report => report.package),
            ['fake-pass', 'fake-fail', 'fake-flaky'],
            'ordered by package path',
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
        const failures = collectFailures(reports);
        const summary = buildAggregateSummary(reports, failures, readRushProjects(dir).length);

        t.equal(summary.totals.packages, 4, 'packages without a report are still counted');
        t.equal(summary.totals.packagesWithReport, 3, 'packages with a report');
        t.equal(summary.totals.failingPackages, 1, 'packages with failures');
        t.equal(summary.totals.tests, 25, 'tests across every report');
        t.equal(failures.length, 3, 'two failures plus one flaky');
        t.equal(failures[0]?.status, 'failed', 'failures come first');
        t.equal(failures[2]?.status, 'flaky', 'flaky last');
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
        const failures = collectFailures(reports);
        const coverage = parseLcov(readFileSync(join(dir, 'coverage', 'lcov.info'), 'utf8'));
        // What the workflow's publish matrix would be built from: a package with
        // a `publish/` payload, which is what the Report column links to.
        t.same(
            collectPublishable(dir, reports),
            ['fake-fail'],
            'only the Playwright package is publishable',
        );
        const baseline: IMetrics = {
            schema: 1,
            commit: '',
            run: 1,
            updatedAt: '',
            tests: {total: 20, passed: 20, failed: 0, flaky: 0},
            coverage: {lines: {hit: 100, found: 300}},
            packages: {
                'fake-pass': {
                    tests: {passed: 10, failed: 0, flaky: 0, total: 10},
                    coverage: {linesHit: 70, linesTotal: 100},
                },
            },
        };

        const markdown = renderCiReport({
            reports,
            failures,
            coverage,
            baseline,
            run: 551,
            totalPackages: 4,
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
        t.match(markdown, /22 passed, 2 failed, 1 flaky \(25 total\)/, 'totals line');
        t.match(markdown, /1 package\(s\) produced no test report/, 'missing package warning');
        t.match(
            markdown,
            /vs last merged main: tests 25 \(\+5\), coverage 44\.3% \(\+11\.0pp\)/,
            'aggregate deltas',
        );
        t.match(
            markdown,
            /\| fake-pass \| ✅ \| 12 \| 0 \| 0 \| 12 \| \+2 \| 80% \(\+10\.0pp\) \| — \|/,
            'row carries the per-package test delta, coverage delta and no report link',
        );
        t.match(
            markdown,
            /\| fake-fail \| ❌ \| 8 \| 2 \| 0 \| 10 \| — \| 25% \| \[report\]\(https:\/\/example\.test\/blong-ci\/fake-fail\/Build\/551\/\) \|/,
            'failing row links its published report',
        );
        t.match(
            markdown,
            /\| fake-silent \| — \| — \| — \| — \| — \| — \| 50% \| — \|/,
            'a package with coverage but no report still gets a row',
        );
        t.match(markdown, /### Failed suites \(3 test\(s\)\)/, 'failed suites section');
        t.match(markdown, /logs in as the seeded user/, 'failing test listed');
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
        t.notMatch(markdown, /### Coverage/, 'coverage is a column, not a second table');
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
        const report: IReport = {
            schema: 1,
            package: 'fake',
            path: 'core/fake',
            runner: 'tap',
            status: 'failed',
            counts: {total: 2, passed: 1, failed: 1, flaky: 0, skipped: 0, todo: 0},
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
        };
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
    const report = (pkg: string, path: string): IReport => ({
        schema: 1,
        package: pkg,
        path,
        runner: 'tap',
        status: 'passed',
        counts: {total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, todo: 0},
        generatedAt: '2026-01-01T00:00:00.000Z',
        suites: [],
    });

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

test('sliceForPackage strips the tag it was read with', async t => {
    const records = [
        {name: 'mine', package: 'fake-fail'},
        {name: 'theirs', package: 'other'},
    ];
    t.same(sliceForPackage(records, 'fake-fail'), [{name: 'mine'}], 'tag removed for Allure');
    t.same(sliceForPackage(records, 'missing'), [], 'unknown package yields nothing');
    t.end();
});
