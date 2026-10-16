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
 * - **One page and one machine summary, both rendered from the same report.** The published
 *   directory stays "one report per package", which is what the summary link and Allure's
 *   per-package history assume. `package-summary.json` beside the page is what a tool reads
 *   instead of parsing HTML — `blong-dev ci history` and the comparison a diagnosis makes — and
 *   both producers of that directory write it: this page, and the Allure report that replaces it
 *   when a producer left results, because the browser leg publishes Allure *over* the page and a
 *   summary left behind by the tap leg would describe a run the page no longer shows. The name
 *   keeps clear of Allure's own `summary.json`, which is a different document (@@D-562).
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
    OUTSIDE_TESTS_MATERIAL_MS,
    outsideTestsMs,
    reportTestDurationMs,
    runDurationMs,
    statusIcon,
    type IReport,
    type IRunReport,
    type ITestCounts,
    type ITestEntry,
    type TestStatus,
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

/**
 * File inside `.ci-report/publish/` holding the machine readable summary.
 *
 * Named apart from Allure's `summary.json`, which sits in the same directory for a package
 * whose report is an Allure one and holds Allure's own document.
 */
export const PACKAGE_SUMMARY_FILE = 'package-summary.json';

/** The package-relative location of the summary, whether or not it exists yet. */
export const PACKAGE_SUMMARY_PATH = `${REPORT_DIR}/${PUBLISH_DIR}/${PACKAGE_SUMMARY_FILE}`;

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
    // The tests' own time, with the rest of the run named beside it: a page that reported the
    // run's clock as the package's test time advertised a regression a wait had caused.
    const tests = reportTestDurationMs(report);
    const outside = outsideTestsMs(report);
    return (
        `${escapeHtml(report.package)} ${statusIcon(report.status)} ` +
        `${describeCounts(report.counts)} (${report.counts.total} total)` +
        `${tests > 0 ? ` · ${formatDurationMs(tests)} of tests` : ''}` +
        `${outside >= OUTSIDE_TESTS_MATERIAL_MS ? ` (${formatDurationMs(outside)} outside them)` : ''}`
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
<script type="application/json" id="blong-package-summary">${embed(summaryOf(report))}</script>
</body>
</html>
`;
}

/**
 * The summary of a package, as the two readers of its page need it.
 *
 * The page is read by a person through the report table and by a tool that wants the verdict
 * and the test time of a run it did not download — `blong-dev ci history` walks the published
 * runs of a package. It is rendered twice on purpose: as the heading a person reads, and as a
 * JSON block a parser should prefer. The heading stays the fallback, because the pages of the
 * runs already published carry no block.
 */
export interface IPackageSummary {
    package: string;
    status: TestStatus;
    counts: ITestCounts;
    /** The tests' own time, with the rest of the run beside it. */
    testsMs: number;
    outsideTestsMs: number;
    runs: Array<{runner: string; status: TestStatus; counts: ITestCounts; durationMs: number}>;
}

/** The summary of one report, in the shape the page embeds. */
export function summaryOf(report: IReport): IPackageSummary {
    return {
        package: report.package,
        status: report.status,
        counts: report.counts,
        testsMs: reportTestDurationMs(report),
        outsideTestsMs: outsideTestsMs(report),
        runs: report.runs.map(run => ({
            runner: run.runner,
            status: run.status,
            counts: run.counts,
            durationMs: runDurationMs(run),
        })),
    };
}

/** Serialize the summary so it cannot end the script element that holds it. */
function embed(summary: IPackageSummary): string {
    return JSON.stringify(summary).replace(/</g, '\\u003c');
}

const SUMMARY_BLOCK =
    /<script type="application\/json" id="blong-package-summary">([\s\S]*?)<\/script>/;
const HEADLINE = /<h1>([\s\S]*?)<\/h1>/;
const ICONS: Record<string, TestStatus> = {
    '❌': 'failed',
    '⚠️': 'flaky',
    '✅': 'passed',
    '⚪': 'unknown',
};

/** Turn the escaped heading text back into the plain text it was rendered from. */
function unescapeHtml(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
}

/** Milliseconds in a rendered duration (`1m 10s`, `8.2s`, `340ms`, `1h 02m`). */
export function parseDurationText(text: string): number {
    let ms = 0;
    for (const [, value, unit] of text.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)) {
        const amount = Number(value);
        ms +=
            amount * (unit === 'ms' ? 1 : unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000);
    }
    return Math.round(ms);
}

/** The counts a rendered `describeCounts` line holds, or `undefined` for anything else. */
function parseCounts(text: string): ITestCounts | undefined {
    const parsed =
        /(\d+) passed, (\d+) failed(?:, (\d+) flaky)?(?:, (\d+) skipped)?(?:, (\d+) todo)? \((\d+) total\)/.exec(
            text,
        );
    if (!parsed) return undefined;
    return {
        passed: Number(parsed[1]),
        failed: Number(parsed[2]),
        flaky: Number(parsed[3] ?? 0),
        skipped: Number(parsed[4] ?? 0),
        todo: Number(parsed[5] ?? 0),
        total: Number(parsed[6]),
    };
}

/**
 * Read the summary out of a published page.
 *
 * The JSON block first, and the heading for a page published before the block existed — the
 * report table and the run history reach back fifteen runs, most of which predate it.
 */
export function parsePackageSummary(html: string): IPackageSummary | undefined {
    const block = SUMMARY_BLOCK.exec(html)?.[1];
    if (block !== undefined) {
        try {
            return JSON.parse(block) as IPackageSummary;
        } catch {
            // A page whose block cannot be read is read from its heading instead.
        }
    }

    const heading = unescapeHtml((HEADLINE.exec(html)?.[1] ?? '').replace(/<[^>]*>/g, '')).trim();
    const head = /^(\S+)\s+(\S)\s+(.*)$/u.exec(heading);
    if (!head) return undefined;
    const counts = parseCounts(head[3]!);
    if (!counts) return undefined;
    const tests = /·\s*([^·(]+?)\s*of tests/.exec(head[3]!)?.[1];
    const outside = /\(([^)]*?) outside them\)/.exec(head[3]!)?.[1];
    return {
        package: head[1]!,
        status: ICONS[head[2]!] ?? 'unknown',
        counts,
        testsMs: tests ? parseDurationText(tests) : 0,
        outsideTestsMs: outside ? parseDurationText(outside) : 0,
        runs: [],
    };
}

/**
 * Write the machine readable summary of the package's report.
 *
 * The counterpart of {@link writePackagePage} for readers that are programs: the same document
 * the page embeds, at a path a tool can fetch without parsing HTML. Both are written from the
 * report that is current at the moment, which is what keeps the pair in step (@@D-562).
 */
export function writePackageSummary(cwd: string): IPackagePage {
    const report = readReport(cwd);
    if (!report) return {path: PACKAGE_SUMMARY_PATH, written: false};
    const dir = join(reportDir(cwd, true), PUBLISH_DIR);
    mkdirSync(dir, {recursive: true});
    writeFileSync(
        join(dir, PACKAGE_SUMMARY_FILE),
        JSON.stringify(summaryOf(report), null, 2) + '\n',
    );
    return {path: PACKAGE_SUMMARY_PATH, written: true};
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
    writePackageSummary(cwd);
    return {path: PAGE, written: true};
}
