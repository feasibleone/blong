/**
 * Renders the single consolidated CI report (`ci-report.md`).
 *
 * The same markdown is posted as the pull-request comment *and* appended to the
 * run's action summary, so it has to be self-contained: one row per package
 * carrying its test counts, its test time, its coverage, every delta against the
 * base branch, and a link to the package's published report, with the failing tests
 * listed underneath. Nothing is appended later by the workflow — a reader sees the
 * same report in both places.
 *
 * The published links are derived from the reports repository's base URL plus
 * this run's number, which is what makes that possible: the report is rendered
 * before the upload and publishing jobs run, but the paths are already known.
 *
 * Everything it prints is either a count the runners reported or a comparison the
 * baseline makes possible, and it is printed in the cell it belongs to — a delta sits
 * in parentheses after the measurement it compares, a slow package carries the test
 * that made it slow, and a coverage move is marked in the coverage cell. Nothing gets
 * a table of its own, because a second table is a second place to look for a number
 * that is already in the row. A column appears only when some package needs it, and a
 * section with nothing to say is left out rather than shown empty.
 */

import type {IFailure} from './aggregate.ts';
import type {ICoverage} from './coverage.ts';
import {lineCoveragePct} from './coverage.ts';
import {metricsCoveragePct, type IMetrics} from './metrics.ts';
import {
    formatDurationDeltaMs,
    formatDurationMs,
    reportDurationMs,
    slowestTests,
    statusIcon,
    type IReport,
    type ITestEntry,
    type TestStatus,
} from './reportTypes.ts';

/** Maximum number of failing tests listed individually before truncating. */
const MAX_FAILURE_ROWS = 50;

/** How many entries the ranked marks (slow tests, packages that did not run) show. */
const MAX_RANKED_ROWS = 5;

/**
 * Percentage points of coverage loss that count as a regression rather than a drift.
 *
 * A smaller loss still gets a mark — yellow — because a reader wants the direction
 * either way, and what the red is reserved for is the drop big enough to be worth
 * acting on in this run.
 */
const COVERAGE_REGRESSION_POINTS = 1;

/** How long a test name may get inside a table cell before it is cut short. */
const MAX_CELL_TEST_NAME = 48;

/**
 * Where this run's reports are published.
 *
 * `base` is the reports repository's Pages URL (custom domain included) and
 * `workflow`/`run` are the path segments `deploy-report` uses, so the links here
 * and the URLs the publish step reports are the same by construction.
 */
export interface IReportLinks {
    base: string;
    workflow: string;
    run: number;
    /** Packages whose own report (`tool=<package>`) is being published. */
    packages: readonly string[];
    /** The aggregate coverage report is being published. */
    coverage: boolean;
    /** A failures bundle is being published, i.e. the run was not green. */
    failures: boolean;
}

export interface IRenderOptions {
    reports: readonly IReport[];
    failures: readonly IFailure[];
    coverage?: ICoverage | null;
    baseline?: IMetrics | null;
    run?: number;
    /** Package count from rush.json, used to report packages without results. */
    totalPackages?: number;
    /** Omitted when publishing is not configured; the links column is then dropped. */
    links?: IReportLinks | null;
}

/** `5676` reads as `5,676`: counts here are large enough to need the separator. */
function group(value: number): string {
    return String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const fmtCount = (value: number) => group(value);
const fmtInt = (value: number) => (value === 0 ? '0' : `${value > 0 ? '+' : '-'}${group(value)}`);
const fmtPoints = (value: number) =>
    value > 0 ? `+${value.toFixed(1)}pp` : `${value.toFixed(1)}pp`;

function resultIcon(status: TestStatus): string {
    return statusIcon(status);
}

/**
 * The runner split of a package, for the packages that have one.
 *
 * Written beside the package name rather than in a column of its own: only the few
 * packages that run two legs have anything to say here, and the column would be
 * empty for every other row. The counts are each leg's own test count, so a red row
 * says at a glance which leg produced the failure.
 */
function runnerSplit(report: IReport | undefined): string {
    if (!report || report.runs.length < 2) return '';
    const parts = report.runs.map(run => {
        const failed = run.counts.failed > 0 ? ' ❌' : '';
        return `${run.runner} ${fmtCount(run.counts.total)}${failed}`;
    });
    return ` (${parts.join(' · ')})`;
}

/** One runner's test total across every package, for the per-runner line. */
interface IRunnerTotal {
    tests: number;
    failed: number;
}

function runnerTotals(reports: readonly IReport[]): Map<string, IRunnerTotal> {
    const totals = new Map<string, IRunnerTotal>();
    for (const report of reports) {
        for (const run of report.runs) {
            const entry = totals.get(run.runner) ?? {tests: 0, failed: 0};
            entry.tests += run.counts.total;
            entry.failed += run.counts.failed;
            totals.set(run.runner, entry);
        }
    }
    return totals;
}

/** `1m 02s` per package, the five most expensive first. */
function slowestPackages(reports: readonly IReport[]): Array<{pkg: string; ms: number}> {
    return reports
        .map(report => ({pkg: report.package, ms: reportDurationMs(report)}))
        .filter(entry => entry.ms > 0)
        .sort((left, right) => right.ms - left.ms || left.pkg.localeCompare(right.pkg))
        .slice(0, MAX_RANKED_ROWS);
}

/** One test that made its package slow, for the mark in the duration cell. */
interface ISlowTest {
    package: string;
    test: ITestEntry;
}

/**
 * The slowest tests of the run, at most one per package.
 *
 * A package's duration is in its own cell, but a *test* that approaches a timeout is
 * what a reader has to act on, and the timeout is per test (`--timeout` on tap). So the
 * slowest few are marked in the duration cell of the package they belong to, beside the
 * time they contributed — which is where a reader looking at a slow package is already
 * looking, and needs no table of its own.
 */
function slowestTestsOfRun(reports: readonly IReport[], limit: number): Map<string, ITestEntry> {
    const candidates = reports.flatMap(report =>
        report.runs.flatMap(run =>
            slowestTests(run, limit).map(test => ({package: report.package, test})),
        ),
    );
    const marked = new Map<string, ITestEntry>();
    candidates
        .sort((left, right) => (right.test.durationMs ?? 0) - (left.test.durationMs ?? 0))
        .slice(0, limit)
        .forEach(entry => {
            if (!marked.has(entry.package)) marked.set(entry.package, entry.test);
        });
    return marked;
}

/**
 * `🟢` any gain, `🔴` a loss worth acting on, `🟡` a smaller one, nothing when it did not
 * move — or when there is nothing to compare against, which is not the same thing.
 */
function coverageMark(deltaPp: number | null): string {
    if (deltaPp === null || deltaPp === 0) return '';
    if (deltaPp > 0) return '🟢 ';
    return deltaPp < -COVERAGE_REGRESSION_POINTS ? '🔴 ' : '🟡 ';
}

/** Cut a test name down to what fits a table cell without losing its start. */
function shorten(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** The word a reader needs for a failure's history, `—` when nothing is known. */
function historyCell(failure: IFailure): string {
    switch (failure.history?.kind) {
        case 'new':
            return 'new';
        case 'recurring':
            return 'recurring';
        case 'intermittent':
            return 'intermittent';
        default:
            return '—';
    }
}

/** URL of one published report, i.e. `<base>/<tool>/<workflow>/<run>/`. */
function toolUrl(links: IRenderOptions['links'], tool: string): string | null {
    if (!links?.base || !links.workflow || !links.run) return null;
    return `${links.base}/${tool}/${links.workflow}/${links.run}/`;
}

/** One table row: a package's tests, coverage and published report. */
interface IPackageRow {
    package: string;
    report?: IReport;
    lines?: {hit: number; found: number};
}

/**
 * Build the rows of the single per-package table.
 *
 * Reports and coverage do not cover the same set of packages — a package can
 * have coverage without a `.ci-report/` (a runner that does not write one) — so
 * the table is the union of both, ordered by name so it lines up with the
 * committed `metrics.json`.
 */
function packageRows(
    reports: readonly IReport[],
    coverage: ICoverage | null | undefined,
): IPackageRow[] {
    const rows = new Map<string, IPackageRow>();
    for (const report of reports) {
        rows.set(report.package, {...rows.get(report.package), package: report.package, report});
    }
    for (const [pkg, lines] of coverage?.packages ?? []) {
        if (lines.found === 0) continue;
        rows.set(pkg, {...rows.get(pkg), package: pkg, lines});
    }
    return [...rows.values()].sort((left, right) => left.package.localeCompare(right.package));
}

export function renderCiReport(options: IRenderOptions): string {
    const {reports, failures, coverage, baseline, links} = options;
    const lines: string[] = [];

    const tests = reports.reduce((sum, report) => sum + report.counts.total, 0);
    const passed = reports.reduce((sum, report) => sum + report.counts.passed, 0);
    const failed = reports.reduce((sum, report) => sum + report.counts.failed, 0);
    const flaky = reports.reduce((sum, report) => sum + report.counts.flaky, 0);
    const missing = (options.totalPackages ?? reports.length) - reports.length;

    if (reports.length === 0) {
        lines.push('## CI Summary', '');
        lines.push('No package produced a `.ci-report/` report — did the test step run?', '');
        return lines.join('\n');
    }

    lines.push('## CI Summary', '');
    const flakyText = flaky > 0 ? `, ${flaky} flaky` : '';
    const runText = options.run ? ` — build #${options.run}` : '';
    // Wall clock is the sum of every package's test time, not the job's: how the
    // packages are spread over job runners is the workflow's business, and this
    // number is the one that moves when a package gets slower.
    const testTime = reports.reduce((sum, report) => sum + reportDurationMs(report), 0);
    const baselineDuration = baseline?.tests.durationMs;
    const durationDelta =
        testTime > 0 && typeof baselineDuration === 'number'
            ? ` (${formatDurationDeltaMs(testTime - baselineDuration)})`
            : '';
    lines.push(
        `**${reports.length} package(s) · ${fmtCount(passed)} passed, ${fmtCount(failed)} failed` +
            `${flakyText} (${fmtCount(tests)} total)` +
            `${testTime > 0 ? ` · ${formatDurationMs(testTime)}${durationDelta} of test time` : ''}**${runText}`,
    );

    // How the suite divides between the runners. Only worth a line when a package
    // actually ran more than one, which is what the per-row split cannot say.
    const totalsByRunner = runnerTotals(reports);
    if (totalsByRunner.size > 1) {
        const parts = [...totalsByRunner.entries()]
            .sort((left, right) => right[1].tests - left[1].tests)
            .map(
                ([name, total]) =>
                    `${name} ${fmtCount(total.tests)}` +
                    `${total.failed > 0 ? ` (${fmtCount(total.failed)} failed)` : ''}`,
            );
        lines.push('', `*by runner: ${parts.join(' · ')}*`);
    }

    // Aggregate trend against the base branch, beside the per-package deltas below.
    const baselineTests = baseline?.tests.total;
    const coveragePct = coverage ? lineCoveragePct(coverage.lines) : null;
    const baselineCoveragePct = metricsCoveragePct(baseline ?? null);
    const trend: string[] = [];
    if (typeof baselineTests === 'number')
        trend.push(`tests ${fmtCount(tests)} (${fmtInt(tests - baselineTests)})`);
    if (coveragePct !== null && baselineCoveragePct !== null) {
        trend.push(`coverage ${coveragePct}% (${fmtPoints(coveragePct - baselineCoveragePct)})`);
    }
    if (trend.length > 0) lines.push('', `*vs last merged main: ${trend.join(', ')}*`);

    // Every published report of this run, in one line: the failure report is what
    // an agent is pointed at, so it carries both the run and the stable URL.
    const reportLinks: string[] = [];
    const coverageUrl = coverage ? toolUrl(links, 'coverage') : null;
    if (coverageUrl) reportLinks.push(`📊 [Coverage report](${coverageUrl})`);
    const failuresUrl = links?.failures ? toolUrl(links, 'failures') : null;
    if (failuresUrl) {
        const stable = `${links!.base}/failures/${links!.workflow}/latest/`;
        reportLinks.push(
            `🤖 Failure report: [this run](${failuresUrl}failures.json) · [latest](${stable}failures.json)`,
        );
    }
    if (reportLinks.length > 0) lines.push('', reportLinks.join(' · '));

    if (missing > 0) lines.push('', `> ${missing} package(s) produced no test report.`);

    // Tests that did not run are the quietest failure mode there is: they are absent
    // from every count above, so the only way to notice a suite that stopped running
    // is to say it out loud.
    const skipped = reports.reduce((sum, report) => sum + report.counts.skipped, 0);
    const todo = reports.reduce((sum, report) => sum + report.counts.todo, 0);
    if (skipped + todo > 0) {
        const where = reports.filter(report => report.counts.skipped + report.counts.todo > 0);
        const parts: string[] = [];
        if (skipped > 0) parts.push(`${skipped} skipped`);
        if (todo > 0) parts.push(`${todo} todo`);
        lines.push(
            '',
            `> ${parts.join(', ')} in ${where.length} package(s): ` +
                where
                    .slice(0, MAX_RANKED_ROWS)
                    .map(
                        report => `${report.package} ${report.counts.skipped + report.counts.todo}`,
                    )
                    .join(', ') +
                `${where.length > MAX_RANKED_ROWS ? ', …' : ''}.`,
        );
    }

    // Which failures this branch introduced, which is the first thing a reader of a red
    // pull request wants to know. Counted from the history of the base branch, so
    // "main is already red here" does not read as this branch's fault.
    const newFailures = failures.filter(failure => failure.history?.kind === 'new');
    const recurring = failures.filter(failure => failure.history?.kind === 'recurring');
    const intermittent = failures.filter(failure => failure.history?.kind === 'intermittent');
    if (newFailures.length + recurring.length + intermittent.length > 0) {
        const parts: string[] = [];
        if (newFailures.length > 0) parts.push(`${newFailures.length} new (green on main)`);
        if (recurring.length > 0) parts.push(`${recurring.length} already failing there`);
        if (intermittent.length > 0) parts.push(`${intermittent.length} intermittent there`);
        lines.push('', `> Failures: ${parts.join(' · ')}.`);
    }
    lines.push('');

    const rows = packageRows(reports, coverage);
    const showDuration = reports.some(report => reportDurationMs(report) > 0);
    const showCoverage = coveragePct !== null || rows.some(row => row.lines);
    const showLinks = links?.packages !== undefined;
    const showNotRun = reports.some(report => report.counts.skipped + report.counts.todo > 0);
    const slowest = slowestTestsOfRun(reports, MAX_RANKED_ROWS);
    lines.push(
        `| Package | Result | Passed | Failed | Flaky${showNotRun ? ' | Not run' : ''} | Total` +
            `${showDuration ? ' | Duration' : ''}${showCoverage ? ' | Coverage' : ''}` +
            `${showLinks ? ' | Report' : ''} |`,
        `| --- | --- | ---: | ---: | ---:${showNotRun ? ' | ---:' : ''} | ---:` +
            `${showDuration ? ' | ---:' : ''}${showCoverage ? ' | ---:' : ''}` +
            `${showLinks ? ' | ---' : ''} |`,
    );
    for (const row of rows) {
        const cells = [
            `${row.package}${runnerSplit(row.report)}`,
            row.report ? resultIcon(row.report.status) : '—',
        ];
        const counts = row.report?.counts;
        cells.push(
            counts ? `${fmtCount(counts.passed)}` : '—',
            counts ? `${fmtCount(counts.failed)}` : '—',
            counts ? `${fmtCount(counts.flaky)}` : '—',
        );
        if (showNotRun) {
            const notRun = counts ? counts.skipped + counts.todo : 0;
            cells.push(notRun > 0 ? `${fmtCount(notRun)}` : '—');
        }
        // The delta of a measurement belongs in the cell that shows it, so a reader
        // never has to line up two columns to learn one thing.
        const before = baseline?.packages?.[row.package];
        if (counts) {
            const beforeTotal = before?.tests?.total;
            cells.push(
                `${fmtCount(counts.total)}` +
                    `${typeof beforeTotal === 'number' ? ` (${fmtInt(counts.total - beforeTotal)})` : ''}`,
            );
        } else {
            cells.push('—');
        }
        if (showDuration) {
            const ms = row.report ? reportDurationMs(row.report) : 0;
            if (ms === 0) cells.push('—');
            else {
                const beforeMs = before?.tests?.durationMs;
                const slow = slowest.get(row.package);
                cells.push(
                    `${formatDurationMs(ms)}` +
                        `${typeof beforeMs === 'number' ? ` (${formatDurationDeltaMs(ms - beforeMs)})` : ''}` +
                        `${slow ? ` ⏱️ ${shorten(slow.name, MAX_CELL_TEST_NAME)} ${formatDurationMs(slow.durationMs ?? 0)}` : ''}`,
                );
            }
        }
        if (showCoverage) {
            if (!row.lines) cells.push('—');
            else {
                const pct = lineCoveragePct(row.lines);
                const beforeCoverage = before?.coverage;
                const deltaPp =
                    beforeCoverage && beforeCoverage.linesTotal > 0
                        ? Math.round(
                              (pct -
                                  lineCoveragePct({
                                      hit: beforeCoverage.linesHit,
                                      found: beforeCoverage.linesTotal,
                                  })) *
                                  10,
                          ) / 10
                        : null;
                cells.push(
                    `${coverageMark(deltaPp)}${pct}%` +
                        `${deltaPp === null ? '' : ` (${fmtPoints(deltaPp)})`}`,
                );
            }
        }
        if (showLinks) {
            const url = toolUrl(links, row.package);
            cells.push(url && links!.packages.includes(row.package) ? `[report](${url})` : '—');
        }
        lines.push(`| ${cells.join(' | ')} |`);
    }
    lines.push('');

    if (failures.length > 0) {
        // A package that ran several runners needs its problems attributed. The row
        // names the package, and in a two-runner package the test file does not always
        // say which leg produced the test — a handler test and a browser test of the
        // same realm can be named alike. A single-runner package needs no mark: there
        // is only one place its failures can come from.
        const multiRunner = new Set(
            reports.filter(report => report.runs.length > 1).map(report => report.package),
        );
        const showHistory = failures.some(failure => failure.history);
        lines.push(`### Failed suites (${failures.length} test(s))`, '');
        lines.push(
            `| Package | Suite | Test | Status${showHistory ? ' | History' : ''} | Location |`,
            `| --- | --- | --- | ---${showHistory ? ' | ---' : ''} | --- |`,
        );
        for (const failure of failures.slice(0, MAX_FAILURE_ROWS)) {
            const icon = failure.status === 'flaky' ? '🟡' : '🔴';
            const location = failure.file
                ? `${failure.file}${failure.line ? `:${failure.line}` : ''}`
                : '—';
            const owner = multiRunner.has(failure.package)
                ? `${failure.package} (${failure.runner})`
                : failure.package;
            lines.push(
                `| ${owner} | ${failure.suite} | ${failure.name} | ${icon} ${failure.status}` +
                    `${showHistory ? ` | ${historyCell(failure)}` : ''} | \`${location}\` |`,
            );
        }
        if (failures.length > MAX_FAILURE_ROWS) {
            lines.push(
                `| … | | ${failures.length - MAX_FAILURE_ROWS} more failing test(s) | | see the failure report |`,
            );
        }
        lines.push('');
    }

    return lines.join('\n');
}
