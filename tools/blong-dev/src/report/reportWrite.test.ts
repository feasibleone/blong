/**
 * Unit tests for the per-runner write path of the package report
 * (report/reportWrite.ts).
 *
 * `report.json` describes a *package*, and a package can run more than one runner
 * in a cycle — a realm's handler tests under tap, then its browser tests under
 * Playwright. Each runner writes its own slice, so the invariant under test is that
 * the second writer adds a slice instead of replacing the file, and that clearing a
 * slice (what a runner does before it starts) leaves the other runners' slices alone.
 * Before that, the last writer won and the aggregate report described one runner.
 */

import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {test} from 'tap';

import {reportPath} from './reportPaths.ts';
import type {IRunReport} from './reportTypes.ts';
import {clearRun, readReport, writeRun} from './reportWrite.ts';

/** A package directory inside a fake repository, so `packageRelPath` resolves. */
function fakePackage(): string {
    const root = mkdtempSync(join(tmpdir(), 'blong-dev-run-'));
    writeFileSync(join(root, 'rush.json'), '{"projects": []}');
    const pkg = join(root, 'realm', 'fake-both');
    mkdirSync(pkg, {recursive: true});
    return pkg;
}

function run(runner: string, passed: number, failed = 0, durationMs?: number): IRunReport {
    return {
        runner,
        status: failed > 0 ? 'failed' : 'passed',
        counts: {total: passed + failed, passed, failed, flaky: 0, skipped: 0, todo: 0},
        ...(durationMs === undefined ? {} : {durationMs}),
        generatedAt: '2026-01-01T00:00:00.000Z',
        suites: [
            {
                name: `${runner}.test.ts`,
                file: `${runner}.test.ts`,
                status: failed > 0 ? 'failed' : 'passed',
                counts: {total: passed + failed, passed, failed, flaky: 0, skipped: 0, todo: 0},
                tests:
                    failed > 0
                        ? [{name: `${runner} broke`, status: 'failed' as const}]
                        : [{name: `${runner} passed`, status: 'passed' as const}],
            },
        ],
    };
}

test('writeRun adds a runner without erasing the one already reported', t => {
    const pkg = fakePackage();
    try {
        writeRun(run('tap', 3), pkg);
        writeRun(run('playwright', 1, 1), pkg);

        const report = readReport(pkg);
        t.equal(report?.package, 'fake-both', 'filed under the package folder name');
        t.equal(report?.path, 'realm/fake-both', 'filed under the repository-relative path');
        t.same(
            report?.runs.map(entry => entry.runner),
            ['tap', 'playwright'],
            'both runners are described, in the order they ran',
        );
        t.same(
            report?.counts,
            {total: 5, passed: 4, failed: 1, flaky: 0, skipped: 0, todo: 0},
            'the package counts are the sum of every run',
        );
        t.equal(report?.status, 'failed', 'the worst run decides the package status');
        t.end();
    } finally {
        rmSync(pkg, {recursive: true, force: true});
    }
});

test('the summary of a two-runner package says which runner each result came from', t => {
    const pkg = fakePackage();
    try {
        writeRun(run('tap', 3, 0, 9000), pkg);
        writeRun(run('playwright', 1, 1, 45_000), pkg);
        const summary = readFileSync(reportPath(pkg, 'summary.md'), 'utf8');

        t.match(
            summary,
            /^### ❌ fake-both — 4 passed, 1 failed \(5 total\) · 54s$/m,
            'the heading is the summed counts, which the aggregate row re-uses, and the cost',
        );
        t.match(
            summary,
            /\| Runner \| Result \| Passed \| Failed \| Flaky \| Total \| Duration \|/,
            'a package with two runs gets a table of them',
        );
        t.match(summary, /\| tap \| ✅ \| 3 \| 0 \| 0 \| 3 \| 9\.0s \|/, 'tap is one row');
        t.match(
            summary,
            /\| playwright \| ❌ \| 1 \| 1 \| 0 \| 2 \| 45s \|/,
            'playwright the other, with what it cost',
        );
        t.match(
            summary,
            /\| playwright \| 🔴 failed \| playwright broke \|/,
            'the problem row names the runner the failing test came from',
        );
        t.match(summary, /playwright: playwright\.test\.ts/, 'suites are named after their runner');
        t.end();
    } finally {
        rmSync(pkg, {recursive: true, force: true});
    }
});

test('a single-runner package keeps the heading and a runnerless problem table', t => {
    const pkg = fakePackage();
    try {
        writeRun(run('tap', 2, 1), pkg);
        const summary = readFileSync(reportPath(pkg, 'summary.md'), 'utf8');

        t.notMatch(summary, /\| Runner \|/, 'no runner table for one runner');
        t.notMatch(summary, / · 0ms/, 'and no duration invented for a runner that timed nothing');
        t.match(
            summary,
            /^### ❌ fake-both — 2 passed, 1 failed \(3 total\)$/m,
            'the heading stays as it was',
        );
        t.match(
            summary,
            /\| Status \| Test \| Location \| Trace \|/,
            'the problem table as before',
        );
        t.match(summary, /\| 🔴 failed \| tap broke \|/, 'and a problem row without a runner');
        t.end();
    } finally {
        rmSync(pkg, {recursive: true, force: true});
    }
});

test('a repeated run of the same runner replaces only its own slice', t => {
    const pkg = fakePackage();
    try {
        writeRun(run('tap', 3), pkg);
        writeRun(run('playwright', 2), pkg);
        // The next cycle's tap leg: its predecessor's slice must go, because the
        // tests tap reported last time are not this run's results.
        writeRun(run('tap', 1), pkg);

        const report = readReport(pkg);
        t.equal(report?.runs.length, 2, 'still two runners');
        t.same(
            report?.runs[0]?.counts,
            {
                total: 1,
                passed: 1,
                failed: 0,
                flaky: 0,
                skipped: 0,
                todo: 0,
            },
            'the tap slice is the run that just finished',
        );
        t.equal(report?.counts.total, 3, 'totals follow');
        t.end();
    } finally {
        rmSync(pkg, {recursive: true, force: true});
    }
});

test('clearRun drops one slice and keeps the rest of the package report', t => {
    const pkg = fakePackage();
    try {
        writeRun(run('tap', 3), pkg);
        writeRun(run('playwright', 2), pkg);

        clearRun('tap', pkg);

        const report = readReport(pkg);
        t.same(
            report?.runs.map(entry => entry.runner),
            ['playwright'],
            'tap is gone',
        );
        t.equal(report?.counts.total, 2, 'the totals are the remaining runner only');
        t.end();
    } finally {
        rmSync(pkg, {recursive: true, force: true});
    }
});

test('clearRun removes the report when the last slice goes', t => {
    const pkg = fakePackage();
    try {
        writeRun(run('tap', 3), pkg);
        t.ok(existsSync(reportPath(pkg, 'report.json')), 'the run wrote the report');

        clearRun('tap', pkg);

        t.notOk(existsSync(reportPath(pkg, 'report.json')), 'no runner is described');
        t.notOk(
            existsSync(reportPath(pkg, 'summary.md')),
            'and no summary is left claiming otherwise',
        );
        t.equal(readReport(pkg), null, 'a cleared package reads as having no report');
        t.end();
    } finally {
        rmSync(pkg, {recursive: true, force: true});
    }
});

test('clearRun tolerates a report that is not this schema', t => {
    const pkg = fakePackage();
    try {
        mkdirSync(join(pkg, '.ci-report'), {recursive: true});
        writeFileSync(join(pkg, '.ci-report', 'report.json'), '{"package": "old"}');

        clearRun('tap', pkg);

        t.equal(existsSync(reportPath(pkg, 'report.json')), false, 'the old file is discarded');
        t.end();
    } finally {
        rmSync(pkg, {recursive: true, force: true});
    }
});
