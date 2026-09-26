/**
 * Writes the files the CI report is built from: `report.json` and `summary.md`
 * per package, and the aggregated `ci-report.md`.
 *
 * `report.json` describes a *package*, so it is written one runner's slice at a time:
 * a runner clears its own slice before it starts (`clearRun`) and writes it when it
 * finishes (`writeRun`), and the file the aggregator reads at the end of a cycle
 * carries every runner that ran in it. That is what keeps the second runner of a
 * cycle — a realm's browser tests after its handler tests — from erasing the first.
 */

import {appendFileSync, existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import {packageName, packageRelPath, reportDir, reportPath} from './reportPaths.ts';
import {
    REPORT_SCHEMA,
    describeCounts,
    formatDurationMs,
    isProblem,
    reportDurationMs,
    reportOf,
    runDurationMs,
    statusIcon,
    statusOf,
    withRun,
    withoutRun,
    type IReport,
    type IRunReport,
    type ITestEntry,
} from './reportTypes.ts';

const traceHint =
    '> **Traces**: open the links under `traces/` in the published report, or download the ' +
    '`reports` artifact and drop the `.zip` files on [trace.playwright.dev](https://trace.playwright.dev/).';

function countsLine(report: IReport): string {
    const counts = report.counts;
    const duration = reportDurationMs(report);
    return (
        `### ${statusIcon(statusOf(counts))} ${report.package} — ${describeCounts(counts)} ` +
        `(${counts.total} total)${duration > 0 ? ` · ${formatDurationMs(duration)}` : ''}`
    );
}

function problemRow(test: ITestEntry): string {
    const icon = test.status === 'flaky' ? '🟡' : '🔴';
    const location = test.file ? `${test.file}${test.line ? `:${test.line}` : ''}` : '—';
    const trace = test.trace ? `\`traces/${test.trace}\`` : '—';
    return `| ${icon} ${test.status} | ${test.name} | ${location} | ${trace} |`;
}

/** A problem row with the run it came from, for a package with several runs. */
function runProblemRow(test: ITestEntry, runner: string): string {
    const icon = test.status === 'flaky' ? '🟡' : '🔴';
    const location = test.file ? `${test.file}${test.line ? `:${test.line}` : ''}` : '—';
    const trace = test.trace ? `\`traces/${test.trace}\`` : '—';
    return `| ${runner} | ${icon} ${test.status} | ${test.name} | ${location} | ${trace} |`;
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
 * aggregate report re-uses as its per-package row; the package's test time follows it
 * when any runner measured one.
 *
 * A package that ran more than one runner gets a table of them under the heading,
 * because the heading's counts are the sum: a reader looking at a package with a
 * failing test needs to know which of its runners failed before opening anything,
 * and which one the time went into. One runner (the usual case) needs no such table —
 * the heading already says it.
 */
export function renderSummaryMarkdown(report: IReport): string {
    const lines: string[] = [countsLine(report), ''];

    if (report.runs.length > 1) {
        lines.push(
            `_${report.runs.length} runners reported into this package:_`,
            '',
            '| Runner | Result | Passed | Failed | Flaky | Total | Duration |',
            '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
        );
        for (const run of report.runs) {
            const duration = runDurationMs(run);
            lines.push(
                `| ${run.runner} | ${statusIcon(run.status)} | ${run.counts.passed} | ` +
                    `${run.counts.failed} | ${run.counts.flaky} | ${run.counts.total} | ` +
                    `${duration > 0 ? formatDurationMs(duration) : '—'} |`,
            );
        }
        lines.push('');
    }

    // Every runner's problems, in run order: a failing browser test and a failing
    // handler test of the same package belong in one list, and the table below marks
    // them by the run they came from.
    const problems: Array<ITestEntry & {runner: string}> = [];
    for (const run of report.runs) {
        for (const suite of run.suites) {
            for (const test of suite.tests) {
                if (isProblem(test.status)) {
                    problems.push({
                        ...test,
                        file: test.file ?? suite.file,
                        runner: run.runner,
                    });
                }
            }
        }
    }

    if (problems.length > 0) {
        const many = report.runs.length > 1;
        lines.push(
            many
                ? '| Runner | Status | Test | Location | Trace |'
                : '| Status | Test | Location | Trace |',
            many ? '| --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- |',
        );
        for (const test of problems) {
            lines.push(many ? runProblemRow(test, test.runner) : problemRow(test));
        }
        lines.push('');
        if (problems.some(test => test.trace)) lines.push(traceHint, '');
    }

    // Suites of every run: named after their runner when there is more than one, so
    // two suites in one table can be told apart.
    const suites = report.runs.flatMap(run =>
        run.suites.map(suite => ({...suite, runner: run.runner})),
    );
    lines.push(
        `<details><summary>All suites (${suites.length})</summary>`,
        '',
        '| Status | Suite | Tests | Failed |',
        '| --- | --- | ---: | ---: |',
    );
    for (const suite of suites) {
        const name = report.runs.length > 1 ? `${suite.runner}: ${suite.name}` : suite.name;
        lines.push(
            `| ${statusIcon(suite.status)} | ${name} | ${suite.counts.total} | ${suite.counts.failed} |`,
        );
    }
    lines.push('', '</details>', '');

    return lines.join('\n');
}

export interface IWrittenReport {
    jsonPath: string;
    markdownPath: string;
}

/** Read the package's merged report, or `null` when it has none (or an old one). */
export function readReport(cwd: string): IReport | null {
    const file = reportPath(cwd, 'report.json');
    if (!existsSync(file)) return null;
    try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as IReport;
        // A file from an earlier schema is not a report this tool can merge into.
        return parsed?.schema === REPORT_SCHEMA && Array.isArray(parsed.runs) ? parsed : null;
    } catch {
        return null;
    }
}

/** The package identity the report is filed under, as the writer derives it. */
function baseOf(cwd: string): {package: string; path: string} {
    return {package: packageName(cwd), path: packageRelPath(cwd)};
}

/**
 * Drop one runner's slice and rewrite the contract, before that runner starts.
 *
 * Called at the start of a run rather than at the end, so a run that dies mid-way
 * leaves the package with no slice for that runner — which is the point: the
 * previous report of a runner must not be aggregated as this run's. The *other*
 * runners' slices are kept, because they belong to the same cycle and are the
 * whole reason the file is a package's rather than a runner's.
 */
export function clearRun(runner: string, cwd: string): void {
    const base = baseOf(cwd);
    const remaining = withoutRun(readReport(cwd), runner, base);
    if (remaining === null) {
        // Nothing left to describe: an absent file says that, and a stale
        // `summary.md` beside it would say the opposite.
        rmSync(reportPath(cwd, 'report.json'), {force: true});
        rmSync(reportPath(cwd, 'summary.md'), {force: true});
        return;
    }
    writeReport(remaining, cwd);
}

/**
 * Write one runner's slice into the package's report, replacing that runner's
 * previous slice and leaving every other runner's alone.
 */
export function writeRun(run: IRunReport, cwd: string): IWrittenReport {
    return writeReport(withRun(readReport(cwd), run, baseOf(cwd)), cwd);
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

/** Build a package report from a single run, for callers that never merge. */
export function singleRunReport(run: IRunReport, cwd: string): IReport {
    return reportOf(baseOf(cwd), [run]);
}
