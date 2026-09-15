/**
 * Renders the single consolidated CI report (`ci-report.md`).
 *
 * The same markdown is posted as the pull-request comment *and* appended to the
 * run's action summary, so it has to be self-contained: one row per package
 * carrying its test counts, coverage, delta and published report link, with the
 * failing tests listed underneath. Nothing is appended later by the workflow —
 * a reader sees the same report in both places.
 *
 * The published links are derived from the reports repository's base URL plus
 * this run's number, which is what makes that possible: the report is rendered
 * before the upload and publishing jobs run, but the paths are already known.
 */

import type {IFailure} from './aggregate.ts';
import type {ICoverage} from './coverage.ts';
import {lineCoveragePct} from './coverage.ts';
import {metricsCoveragePct, type IMetrics} from './metrics.ts';
import {statusIcon, type IReport, type TestStatus} from './reportTypes.ts';

/** Maximum number of failing tests listed individually before truncating. */
const MAX_FAILURE_ROWS = 50;

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

const fmtInt = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const fmtPoints = (value: number) =>
    value > 0 ? `+${value.toFixed(1)}pp` : `${value.toFixed(1)}pp`;

function resultIcon(status: TestStatus): string {
    return statusIcon(status);
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
    lines.push(
        `**${reports.length} package(s) · ${passed} passed, ${failed} failed${flakyText} (${tests} total)**${runText}`,
    );

    // Aggregate trend against the base branch, beside the per-package deltas below.
    const baselineTests = baseline?.tests.total;
    const coveragePct = coverage ? lineCoveragePct(coverage.lines) : null;
    const baselineCoveragePct = metricsCoveragePct(baseline ?? null);
    const trend: string[] = [];
    if (typeof baselineTests === 'number')
        trend.push(`tests ${tests} (${fmtInt(tests - baselineTests)})`);
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
    lines.push('');

    const rows = packageRows(reports, coverage);
    const showDelta = typeof baselineTests === 'number' || baseline?.packages !== undefined;
    const showCoverage = coveragePct !== null || rows.some(row => row.lines);
    const showLinks = links?.packages !== undefined;
    lines.push(
        `| Package | Result | Passed | Failed | Flaky | Total${showDelta ? ' | Δ Tests' : ''}` +
            `${showCoverage ? ' | Coverage' : ''}${showLinks ? ' | Report' : ''} |`,
        `| --- | --- | ---: | ---: | ---: | ---:${showDelta ? ' | ---:' : ''}${showCoverage ? ' | ---:' : ''}` +
            `${showLinks ? ' | ---' : ''} |`,
    );
    for (const row of rows) {
        const cells = [row.package, row.report ? resultIcon(row.report.status) : '—'];
        const counts = row.report?.counts;
        cells.push(
            counts ? `${counts.passed}` : '—',
            counts ? `${counts.failed}` : '—',
            counts ? `${counts.flaky}` : '—',
            counts ? `${counts.total}` : '—',
        );
        if (showDelta) {
            const before = baseline?.packages?.[row.package]?.tests?.total;
            cells.push(counts && typeof before === 'number' ? fmtInt(counts.total - before) : '—');
        }
        if (showCoverage) {
            if (!row.lines) cells.push('—');
            else {
                const pct = lineCoveragePct(row.lines);
                const before = baseline?.packages?.[row.package]?.coverage;
                const delta =
                    before && before.linesTotal > 0
                        ? ` (${fmtPoints(pct - Math.round((before.linesHit / before.linesTotal) * 1000) / 10)})`
                        : '';
                cells.push(`${pct}%${delta}`);
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
        lines.push(`### Failed suites (${failures.length} test(s))`, '');
        lines.push(
            '| Package | Suite | Test | Status | Location |',
            '| --- | --- | --- | --- | --- |',
        );
        for (const failure of failures.slice(0, MAX_FAILURE_ROWS)) {
            const icon = failure.status === 'flaky' ? '🟡' : '🔴';
            const location = failure.file
                ? `${failure.file}${failure.line ? `:${failure.line}` : ''}`
                : '—';
            lines.push(
                `| ${failure.package} | ${failure.suite} | ${failure.name} | ${icon} ${failure.status} | \`${location}\` |`,
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
