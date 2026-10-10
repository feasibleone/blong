/**
 * Tests for the page a package publishes when it has no Allure report.
 *
 * What matters about the page is that it answers two questions a reader of the CI
 * summary asks after clicking the link — how many tests failed, and which ones — for a
 * package whose report never reached Allure (T-155). It is rendered from the same
 * `report.json` the aggregate report reads, so these tests pin the rendering, not the
 * data: the counts line, the failing tests, the runner split of a two-run package, and
 * the escaping of a test name or file that carries HTML.
 */

import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {renderPackagePage, writePackagePage} from './packagePage.ts';
import type {IReport} from './reportTypes.ts';

/** A tap-only report with one failing and one passing test, plus an HTML-heavy name. */
function reportOf(overrides: Partial<IReport> = {}): IReport {
    return {
        schema: 1,
        package: 'blong-lib',
        path: 'core/blong-lib',
        status: 'failed',
        counts: {total: 2, passed: 1, failed: 1, flaky: 0, skipped: 0, todo: 0},
        generatedAt: '2026-10-01T10:00:00.000Z',
        runs: [
            {
                runner: 'tap',
                status: 'failed',
                counts: {total: 2, passed: 1, failed: 1, flaky: 0, skipped: 0, todo: 0},
                durationMs: 1200,
                generatedAt: '2026-10-01T10:00:00.000Z',
                suites: [
                    {
                        name: 'sum',
                        status: 'failed',
                        counts: {total: 2, passed: 1, failed: 1, flaky: 0, skipped: 0, todo: 0},
                        tests: [
                            {name: 'adds two numbers', status: 'passed', durationMs: 5},
                            {
                                name: '<sum & co>',
                                status: 'failed',
                                durationMs: 1195,
                                file: 'src/sum.test.ts',
                                line: 42,
                                message: 'not ok',
                            },
                        ],
                    },
                ],
            },
        ],
        ...overrides,
    };
}

test('renderPackagePage carries the package, its counts and its failures', async t => {
    const html = renderPackagePage(reportOf());

    t.match(html, /^<!doctype html>/, 'a whole document, not a fragment');
    t.match(html, /<title>blong-lib — test report<\/title>/, 'the title names the package');
    t.match(
        html,
        /blong-lib ❌ 1 passed, 1 failed \(2 total\) · 1\.2s/,
        'the heading is the result',
    );
    t.match(html, /Failing tests \(1\)/, 'the failing tests are their own table');
    t.match(html, /<code>src\/sum\.test\.ts:42<\/code>/, 'a failure points at its file and line');
    t.notMatch(html, /Runners \(/, 'a single-run package says it in the heading');
    t.match(html, /All suites \(1\)/, 'every suite is folded away below');
    t.end();
});

test('renderPackagePage escapes what a test name or path may hold', async t => {
    const html = renderPackagePage(reportOf());

    t.match(html, /&lt;sum &amp; co&gt;/, 'the test name is escaped');
    t.notMatch(html, /<sum & co>/, 'and does not reach the document as markup');
    t.end();
});

test('renderPackagePage names each runner of a two-run package', async t => {
    const report = reportOf();
    const playwright = structuredClone(report.runs[0]!);
    playwright.runner = 'playwright';
    playwright.counts = {total: 3, passed: 3, failed: 0, flaky: 0, skipped: 0, todo: 0};
    playwright.status = 'passed';
    report.runs = [report.runs[0]!, playwright];
    report.counts = {total: 5, passed: 4, failed: 1, flaky: 0, skipped: 0, todo: 0};

    const html = renderPackagePage(report);

    t.match(html, /Runners \(2\)/, 'both runners are listed');
    t.match(html, /<td>playwright<\/td><td>✅<\/td>/, 'each run carries its own result');
    t.match(html, /<th>Runner<\/th><th>Status<\/th><th>Test<\/th>/, 'failures name their runner');
    t.end();
});

test('writePackagePage renders the report.json the runner left', async t => {
    const cwd = mkdtempSync(join(tmpdir(), 'blong-package-page-'));
    mkdirSync(join(cwd, '.ci-report'), {recursive: true});
    writeFileSync(join(cwd, '.ci-report', 'report.json'), JSON.stringify(reportOf()));

    const result = writePackagePage(cwd);

    t.equal(result.written, true, 'the page was written');
    t.equal(result.path, '.ci-report/publish/index.html', 'at the published path');
    const page = readFileSync(join(cwd, '.ci-report', 'publish', 'index.html'), 'utf8');
    t.match(page, /blong-lib ❌/, 'and carries the package result');

    rmSync(cwd, {recursive: true, force: true});
    t.end();
});

test('renderPackagePage reports the tests, and what the run waited for', async t => {
    const timed = reportOf();
    const html = renderPackagePage(reportOf({runs: [{...timed.runs[0], durationMs: 522_559}]}));

    t.match(html, /of tests/, 'the heading says whose time the figure is');
    t.match(
        html,
        /8m 41s outside them/,
        'and names what the run waited for beside it, rather than adding it to the tests',
    );
    t.end();
});

test('writePackagePage writes nothing for a package with no report', async t => {
    const cwd = mkdtempSync(join(tmpdir(), 'blong-package-page-'));

    const result = writePackagePage(cwd);

    t.equal(result.written, false, 'nothing to render');
    t.equal(existsSync(join(cwd, '.ci-report')), false, 'and no directory is created');

    rmSync(cwd, {recursive: true, force: true});
    t.end();
});
