/**
 * Tests for the CI report pipeline.
 *
 * Covers the pure conversions (tap json, vitest json, lcov), the aggregation,
 * the rendered markdown and the base-branch rebuild rules. The end-to-end
 * variant — fixture monorepo plus the real `ci-report` command — is
 * `npm run report:local`.
 */

import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {
    buildAggregateSummary,
    buildTapReport,
    buildVitestReport,
    collectFailures,
    collectReports,
    parseLcov,
    parseTapJson,
    readRushProjects,
    rebuildHistory,
    rebuildMetrics,
    renderCiReport,
    sliceForPackage,
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
    const report = buildTapReport(parseTapJson(readFileSync(join(fixtures, 'tap.json'), 'utf8')), 'example', 'core/example', 123);

    t.same(report.counts, {total: 3, passed: 2, failed: 1, flaky: 0, skipped: 0, todo: 0}, 'counts');
    t.equal(report.status, 'failed', 'package status');
    t.equal(report.runner, 'tap', 'runner');
    t.equal(report.suites.length, 1, 'one suite per test file');
    t.equal(report.suites[0]?.file, 'src/example.test.ts', 'suite file');

    const failure = report.suites[0]?.tests.find(entry => entry.status === 'failed');
    t.equal(failure?.name, 'adds numbers › adds 2 and 2', 'suite name is not repeated in the test name');
    t.equal(failure?.file, 'src/example.test.ts', 'failure file comes from diag.at');
    t.equal(failure?.line, 14, 'failure line comes from diag.at');
    t.match(failure?.message ?? '', /-4\n\+5/, 'failure message keeps the diff');
    t.match(failure?.stack ?? '', /src\/example\.test\.ts:14/, 'failure stack is preserved');
    t.end();
});

test('buildTapReport never reports green when tap counted failures', async t => {
    const report = buildTapReport({failures: 2, suites: []}, 'example', 'core/example');
    t.equal(report.counts.failed, 1, 'a synthetic failure is recorded');
    t.equal(report.status, 'failed', 'status is failed');
    t.match(report.suites[0]?.name ?? '', /unparsed/, 'flagged as unparsed');
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
                    diag: {stdio: 'pipe', exitCode: 1, at: {fileName: 'examples/error-demo.test.ts'}},
                },
            ],
        },
        'example',
        'core/example',
    );

    const [failure] = report.suites[0]!.tests;
    t.equal(failure?.name, 'examples/error-demo.test.ts', 'named after the file, not "(suite)"');
    t.equal(failure?.status, 'failed', 'reported as failed');
    t.equal(failure?.file, 'examples/error-demo.test.ts', 'keeps the location');
    t.match(failure?.message ?? '', /exited with code 1/, 'explains the crash');
    t.end();
});

test('parseTapJson tolerates surrounding noise', async t => {
    t.equal(parseTapJson('') , null, 'empty output yields null');
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

test('renderCiReport lists packages, failed suites and the machine readable link', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-ci-report-'));
    try {
        createFixtureWorkspace(dir);
        const reports = collectReports(dir);
        const failures = collectFailures(reports);
        const coverage = parseLcov(readFileSync(join(dir, 'coverage', 'lcov.info'), 'utf8'));
        const baseline: IMetrics = {
            schema: 1,
            commit: '',
            run: 1,
            updatedAt: '',
            tests: {total: 20, passed: 20, failed: 0, flaky: 0},
            coverage: {lines: {hit: 100, found: 300}},
            packages: {'fake-pass': {tests: {passed: 10, failed: 0, flaky: 0, total: 10}}},
        };

        const markdown = renderCiReport({
            reports,
            failures,
            coverage,
            baseline,
            run: 551,
            totalPackages: 4,
            failuresUrl: 'https://example.test/blong-ci/failures/Build/551/',
        });

        t.match(markdown, /^## CI Summary/, 'headline');
        t.match(markdown, /22 passed, 2 failed, 1 flaky \(25 total\)/, 'totals line');
        t.match(markdown, /1 package\(s\) produced no test report/, 'missing package warning');
        t.match(markdown, /vs last merged main: tests 25 \(\+5\), coverage 43\.3% \(\+10\.0pp\)/, 'deltas');
        t.match(markdown, /\| fake-pass \| ✅ \| 12 \| 0 \| 0 \| 12 \| \+2 \|/, 'passing package row with delta');
        t.match(markdown, /\| fake-fail \| ❌ \| 8 \| 2 \| 0 \| 10 \| — \|/, 'failing package row');
        t.match(markdown, /### Failed suites \(3 test\(s\)\)/, 'failed suites section');
        t.match(markdown, /logs in as the seeded user/, 'failing test listed');
        t.match(
            markdown,
            /Machine readable failure report\*\*: https:\/\/example\.test\/blong-ci\/failures\/Build\/551\/failures\.json/,
            'agent entry point',
        );
        t.match(markdown, /### Coverage/, 'coverage section');
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
                        {name: 'breaks', status: 'failed', message: 'boom', file: 'a.test.ts', line: 7},
                    ],
                },
            ],
        };
        writeReport(report, dir);

        const summary = readFileSync(join(dir, '.ci-report', 'summary.md'), 'utf8');
        t.match(summary, /^### ❌ fake — 1 passed, 1 failed \(2 total\)/, 'heading contract');
        t.match(summary, /\| 🔴 failed \| breaks/, 'failure row');
        const roundTrip = JSON.parse(readFileSync(join(dir, '.ci-report', 'report.json'), 'utf8')) as IReport;
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
    const base: IMetrics = {...snapshot, run: 99, history: [{commit: 'old', run: 99, date: '', tests: snapshot.tests, coverage: snapshot.coverage}]};

    const first = rebuildMetrics(base, snapshot, 5);
    const second = rebuildMetrics(base, snapshot, 5);
    t.same(first.history?.map(entry => entry.run), [100, 99], 'this run first, then the base branch');
    t.same(second.history, first.history, 'repeated runs are idempotent');
    t.equal(rebuildMetrics({...base, history: [first.history![0]!]}, snapshot, 5).history?.length, 1, 'the same run is not duplicated');

    const trimmed = rebuildMetrics(
        {...base, history: Array.from({length: 8}, (_, index) => ({commit: '', run: index, date: '', tests: snapshot.tests, coverage: snapshot.coverage}))},
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
    const records = rebuilt.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);

    t.equal(records.length, 2, 'other packages survive, the rebuilt slice replaces the old one');
    t.match(records[0]?.name as string, /other package result/, 'unrelated record preserved');
    t.same(records[1], {name: 'fresh result', package: 'fake-fail'}, 'new record is tagged');
    t.same(rebuildHistory(base, {slices}), rebuilt, 'idempotent');
    t.equal(rebuildHistory([], {slices: new Map()}), '', 'no records yields no file');
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
