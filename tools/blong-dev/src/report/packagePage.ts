/**
 * The page a package publishes when it has no Allure report to publish.
 *
 * The CI report has one row per package and one `Report` cell per row, and that cell
 * is a link to whatever the package published under `.ci-report/publish/`. Until now
 * only a package whose tests reached Allure had anything there — the browser legs, and
 * the handler legs of the realms that run the framework — so the plain unit-test
 * packages (`semantic-log`, `blong-lib`, `blong-ttk`, …) showed `—` and their report
 * was reachable only by downloading the `reports` artifact. That is the gap T-155
 * describes.
 *
 * The material for the page is already there: every runner writes the package's
 * `.ci-report/report.json` (see {@link writeRun}), which is what the aggregate report
 * and the failures bundle are built from. This module renders that same data as a
 * self-contained HTML page, so the link the summary offers always answers.
 *
 * Two deliberate limits:
 *
 * - **Only `index.html`.** The published directory stays "one report per package", which
 *   is what the summary link and Allure's per-package history assume. A second file
 *   would outlive the Allure report that later replaces the page — the tap leg of a
 *   realm package writes the page first and the browser leg then publishes Allure over
 *   it — and a stale copy of the tap-only numbers is worse than no copy.
 * - **Nothing when there is no report.** A package that produced no `.ci-report/` has
 *   nothing to render, and the aggregate already says so.
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import {PUBLISH_DIR, REPORT_DIR, reportDir} from './reportPaths.ts';
import {
    describeCounts,
    formatDurationMs,
    isProblem,
    reportDurationMs,
    runDurationMs,
    statusIcon,
    type IReport,
    type IRunReport,
    type ITestEntry,
} from './reportTypes.ts';
import {readReport} from './reportWrite.ts';

export interface IPackagePage {
    /** Package-relative path of the page, e.g. `.ci-report/publish/index.html`. */
    path: string;
    /** False when the package had no report to render, i.e. nothing was written. */
    written: boolean;
}

/** The package-relative location of the page, whether or not it exists yet. */
const PAGE = `${REPORT_DIR}/${PUBLISH_DIR}/index.html`;

/** Escape the four characters that would otherwise end a text node or an attribute. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** A test's location as `file:line`, or `—` when the runner did not report one. */
function locationOf(test: ITestEntry): string {
    const file = test.file ?? '';
    if (!file) return '—';
    return test.line ? `${file}:${test.line}` : file;
}

/** Every problem of one run, flattened with the runner that produced it. */
function problemsOf(report: IReport): Array<ITestEntry & {runner: string}> {
    const problems: Array<ITestEntry & {runner: string}> = [];
    for (const run of report.runs) {
        for (const suite of run.suites) {
            for (const test of suite.tests) {
                if (!isProblem(test.status)) continue;
                problems.push({...test, file: test.file ?? suite.file, runner: run.runner});
            }
        }
    }
    return problems;
}

/** The one-line result the page's heading carries, `🔴` when anything failed. */
function headline(report: IReport): string {
    const duration = reportDurationMs(report);
    return (
        `${escapeHtml(report.package)} ${statusIcon(report.status)} ` +
        `${describeCounts(report.counts)} (${report.counts.total} total)` +
        `${duration > 0 ? ` · ${formatDurationMs(duration)}` : ''}`
    );
}

/**
 * The runs of a package that reported more than one, with each run's own counts.
 *
 * Written out only when there is more than one: a single-run package says everything
 * the table would in its heading, and an empty second table is a place to look for
 * nothing.
 */
function runsTable(report: IReport): string {
    if (report.runs.length < 2) return '';
    const rows = report.runs
        .map((run: IRunReport) => {
            const duration = runDurationMs(run);
            return (
                `<tr><td>${escapeHtml(run.runner)}</td><td>${statusIcon(run.status)}</td>` +
                `<td class="num">${run.counts.passed}</td><td class="num">${run.counts.failed}</td>` +
                `<td class="num">${run.counts.flaky}</td><td class="num">${run.counts.total}</td>` +
                `<td class="num">${duration > 0 ? formatDurationMs(duration) : '—'}</td></tr>`
            );
        })
        .join('\n');
    return (
        `<h2>Runners (${report.runs.length})</h2>\n` +
        '<table><thead><tr><th>Runner</th><th>Result</th><th>Passed</th><th>Failed</th>' +
        '<th>Flaky</th><th>Total</th><th>Duration</th></tr></thead>\n<tbody>\n' +
        `${rows}\n</tbody></table>\n`
    );
}

/** The failures of every run in one table, marked by the runner they came from. */
function problemsTable(report: IReport): string {
    const problems = problemsOf(report);
    if (problems.length === 0) return '';
    const many = report.runs.length > 1;
    const rows = problems
        .map(test => {
            const icon = test.status === 'flaky' ? '🟡' : '🔴';
            return (
                `<tr>${many ? `<td>${escapeHtml(test.runner)}</td>` : ''}` +
                `<td>${icon} ${escapeHtml(test.status)}</td><td>${escapeHtml(test.name)}</td>` +
                `<td><code>${escapeHtml(locationOf(test))}</code></td></tr>`
            );
        })
        .join('\n');
    return (
        `<h2>Failing tests (${problems.length})</h2>\n` +
        '<table><thead><tr>' +
        `${many ? '<th>Runner</th>' : ''}<th>Status</th><th>Test</th><th>Location</th>` +
        `</tr></thead>\n<tbody>\n${rows}\n</tbody></table>\n`
    );
}

/** Every suite of every run, folded away: the failures above are what a reader wants. */
function suitesTable(report: IReport): string {
    const suites = report.runs.flatMap(run =>
        run.suites.map(suite => ({...suite, runner: run.runner})),
    );
    if (suites.length === 0) return '';
    const many = report.runs.length > 1;
    const rows = suites
        .map(
            suite =>
                `<tr><td>${statusIcon(suite.status)}</td>` +
                `<td>${escapeHtml(many ? `${suite.runner}: ${suite.name}` : suite.name)}</td>` +
                `<td class="num">${suite.counts.total}</td>` +
                `<td class="num">${suite.counts.failed}</td></tr>`,
        )
        .join('\n');
    return (
        `<details><summary>All suites (${suites.length})</summary>\n` +
        '<table><thead><tr><th>Status</th><th>Suite</th><th>Tests</th><th>Failed</th>' +
        `</tr></thead>\n<tbody>\n${rows}\n</tbody></table>\n</details>\n`
    );
}

/** The document the published page holds. Exported so its shape can be asserted. */
export function renderPackagePage(report: IReport): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(report.package)} — test report</title>
<style>
:root { color-scheme: light dark; }
body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 64rem; padding: 0 1rem; }
h1 { font-size: 1.4rem; margin-bottom: .25rem; }
h2 { font-size: 1.1rem; margin-top: 2rem; }
table { border-collapse: collapse; width: 100%; }
th, td { border-bottom: 1px solid #8884; padding: .35rem .5rem; text-align: left; vertical-align: top; }
td.num, th.num { text-align: right; }
code { font-size: .9em; }
footer { margin-top: 2rem; opacity: .7; font-size: .9rem; }
</style>
</head>
<body>
<h1>${headline(report)}</h1>
${runsTable(report)}${problemsTable(report)}${suitesTable(report)}<footer>
Rendered by <code>blong-dev</code> at ${escapeHtml(report.generatedAt)} from
<code>${escapeHtml(report.path)}/.ci-report/report.json</code>. A package whose tests
also report to Allure publishes that report in this page's place.
</footer>
</body>
</html>
`;
}

/**
 * Write the package's published page from its report.
 *
 * Called by {@link publishAllureReport} for the packages that have no Allure report to
 * publish, so that the two paths never race for the same file: the Allure report is
 * written over this page when a producer later generates one.
 */
export function writePackagePage(cwd: string): IPackagePage {
    const report = readReport(cwd);
    if (!report) return {path: PAGE, written: false};
    const dir = join(reportDir(cwd, true), PUBLISH_DIR);
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'index.html'), renderPackagePage(report));
    return {path: PAGE, written: true};
}
