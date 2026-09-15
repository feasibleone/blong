/**
 * Writes the files the CI report is built from: `report.json` and `summary.md`
 * per package, and the aggregated `ci-report.md`.
 */

import {appendFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import {reportDir} from './reportPaths.ts';
import {
    describeCounts,
    isProblem,
    statusIcon,
    statusOf,
    type IReport,
    type ITestCounts,
    type ITestEntry,
} from './reportTypes.ts';

const traceHint =
    '> **Traces**: open the links under `traces/` in the published report, or download the ' +
    '`reports` artifact and drop the `.zip` files on [trace.playwright.dev](https://trace.playwright.dev/).';

function countsLine(counts: ITestCounts, pkg: string): string {
    return `### ${statusIcon(statusOf(counts))} ${pkg} — ${describeCounts(counts)} (${counts.total} total)`;
}

function problemRow(test: ITestEntry): string {
    const icon = test.status === 'flaky' ? '🟡' : '🔴';
    const location = test.file ? `${test.file}${test.line ? `:${test.line}` : ''}` : '—';
    const trace = test.trace ? `\`traces/${test.trace}\`` : '—';
    return `| ${icon} ${test.status} | ${test.name} | ${location} | ${trace} |`;
}

/**
 * Write the aggregated report as `<outDir>/ci-report.md` and, in a CI run, append
 * the same text to the job's step summary.
 *
 * The file is written *unconditionally*, including when a step summary exists.
 * It is the artifact the workflow downloads to post the pull-request comment, so
 * treating the step summary as an alternative destination silently produced a run
 * with a summary and no artifact — and therefore no comment at all. Both readers
 * get the same bytes, which is what keeps the two views identical.
 *
 * `stepSummary` is only a parameter so the behaviour can be tested; callers use
 * the environment, which is where GitHub puts the path.
 */
export function writeCiReport(
    markdown: string,
    outDir: string,
    stepSummary: string | undefined = process.env['GITHUB_STEP_SUMMARY'],
): string {
    const file = join(outDir, 'ci-report.md');
    const body = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
    writeFileSync(file, body);
    if (stepSummary) appendFileSync(stepSummary, body);
    return file;
}

/**
 * Render the per-package markdown summary. The first `### ` line always has the
 * shape `<icon> <package> — N passed, M failed[, K flaky] (T total)`, which the
 * aggregate report re-uses as its per-package row.
 */
export function renderSummaryMarkdown(report: IReport): string {
    const lines: string[] = [countsLine(report.counts, report.package), ''];

    const problems: ITestEntry[] = [];
    for (const suite of report.suites) {
        for (const test of suite.tests) {
            if (isProblem(test.status)) problems.push({...test, file: test.file ?? suite.file});
        }
    }

    if (problems.length > 0) {
        lines.push('| Status | Test | Location | Trace |', '| --- | --- | --- | --- |');
        for (const test of problems) lines.push(problemRow(test));
        lines.push('');
        if (problems.some(test => test.trace)) lines.push(traceHint, '');
    }

    lines.push(
        `<details><summary>All suites (${report.suites.length})</summary>`,
        '',
        '| Status | Suite | Tests | Failed |',
        '| --- | --- | ---: | ---: |',
    );
    for (const suite of report.suites) {
        lines.push(
            `| ${statusIcon(suite.status)} | ${suite.name} | ${suite.counts.total} | ${suite.counts.failed} |`,
        );
    }
    lines.push('', '</details>', '');

    return lines.join('\n');
}

export interface IWrittenReport {
    jsonPath: string;
    markdownPath: string;
}

/** Write `report.json` + `summary.md` into `<cwd>/.ci-report/`. */
export function writeReport(report: IReport, cwd: string): IWrittenReport {
    const dir = reportDir(cwd, true);
    const jsonPath = join(dir, 'report.json');
    const markdownPath = join(dir, 'summary.md');
    writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
    writeFileSync(markdownPath, renderSummaryMarkdown(report));
    return {jsonPath, markdownPath};
}
