/**
 * Renders the single consolidated CI report (`ci-report.md`) that is posted as
 * the action run summary and as the sticky pull-request comment.
 *
 * The report covers every package that produced a `.ci-report/`, lists the
 * failing suites (not just the totals the old coverage-centric report showed)
 * and, when a base-branch baseline is available, adds delta columns.
 */

import type {ICoverage} from './coverage.ts';
import {lineCoveragePct} from './coverage.ts';
import type {IFailure} from './aggregate.ts';
import {metricsCoveragePct, type IMetrics} from './metrics.ts';
import {statusIcon, type IReport, type TestStatus} from './reportTypes.ts';

/** Maximum number of failing tests listed individually before truncating. */
const MAX_FAILURE_ROWS = 50;

export interface IRenderOptions {
    reports: readonly IReport[];
    failures: readonly IFailure[];
    coverage?: ICoverage | null;
    baseline?: IMetrics | null;
    run?: number;
    /** Package count from rush.json, used to report packages without results. */
    totalPackages?: number;
    /** URL of the machine readable failure report, when one was published. */
    failuresUrl?: string;
}

const fmtInt = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const fmtPoints = (value: number) => (value > 0 ? `+${value.toFixed(1)}pp` : `${value.toFixed(1)}pp`);

function resultIcon(status: TestStatus): string {
    return statusIcon(status);
}

export function renderCiReport(options: IRenderOptions): string {
    const {reports, failures, coverage, baseline} = options;
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
    if (missing > 0) {
        lines.push('', `> ${missing} package(s) produced no test report.`);
    }

    const baselineTests = baseline?.tests.total;
    const coveragePct = coverage ? lineCoveragePct(coverage.lines) : null;
    const baselineCoveragePct = metricsCoveragePct(baseline ?? null);
    if (typeof baselineTests === 'number' || baselineCoveragePct !== null) {
        const parts: string[] = [];
        if (typeof baselineTests === 'number') parts.push(`tests ${tests} (${fmtInt(tests - baselineTests)})`);
        if (coveragePct !== null && baselineCoveragePct !== null) {
            parts.push(`coverage ${coveragePct}% (${fmtPoints(coveragePct - baselineCoveragePct)})`);
        }
        if (parts.length > 0) lines.push('', `*vs last merged main: ${parts.join(', ')}*`);
    }
    lines.push('');

    const showDelta = typeof baselineTests === 'number' || baseline?.packages !== undefined;
    lines.push(
        `| Package | Result | Passed | Failed | Flaky | Total${showDelta ? ' | Δ Tests' : ''} |`,
        `| --- | --- | ---: | ---: | ---: | ---:${showDelta ? ' | ---:' : ''} |`,
    );
    for (const report of reports) {
        const icon = resultIcon(report.status);
        let delta = '';
        if (showDelta) {
            const before = baseline?.packages?.[report.package]?.tests?.total;
            delta = typeof before === 'number' ? fmtInt(report.counts.total - before) : '—';
        }
        lines.push(
            `| ${report.package} | ${icon} | ${report.counts.passed} | ${report.counts.failed} | ` +
                `${report.counts.flaky} | ${report.counts.total}${showDelta ? ` | ${delta}` : ''} |`,
        );
    }
    lines.push('');

    if (failures.length > 0) {
        lines.push(`### Failed suites (${failures.length} test(s))`, '');
        lines.push('| Package | Suite | Test | Status | Location |', '| --- | --- | --- | --- | --- |');
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
        if (options.failuresUrl) {
            lines.push(
                `🤖 **Machine readable failure report**: ${options.failuresUrl}failures.json ` +
                    `([Allure report](${options.failuresUrl}))`,
                '',
            );
        }
    }

    if (coverage && coverage.packages.size > 0) {
        const rows = [...coverage.packages.entries()]
            .filter(([, value]) => value.found > 0)
            .map(([pkg, value]) => ({pkg, ...value, pct: lineCoveragePct(value)}))
            .sort((left, right) => right.pct - left.pct);
        if (rows.length > 0) {
            lines.push('### Coverage', '');
            lines.push(
                `| Package | Lines hit / total | Coverage${baselineCoveragePct !== null ? ' | Δ' : ''} |`,
                `| --- | ---: | ---:${baselineCoveragePct !== null ? ' | ---:' : ''} |`,
            );
            for (const row of rows) {
                let delta = '';
                if (baselineCoveragePct !== null) {
                    const before = baseline?.packages?.[row.pkg]?.coverage;
                    delta =
                        before && before.linesTotal > 0
                            ? fmtPoints(row.pct - Math.round((before.linesHit / before.linesTotal) * 1000) / 10)
                            : '—';
                }
                lines.push(
                    `| ${row.pkg} | ${row.hit} / ${row.found} | ${row.pct}%${baselineCoveragePct !== null ? ` | ${delta}` : ''} |`,
                );
            }
            lines.push('');
        }
    }

    return lines.join('\n');
}
