/**
 * The `.github/metrics.json` baseline: a per-run snapshot plus a bounded history
 * of previous runs, used by the CI report to show deltas.
 *
 * The schema is unchanged from the version the workflow used to generate, so
 * existing baselines keep working.
 */

import type {ICoverage} from './coverage.ts';
import {lineCoveragePct} from './coverage.ts';
import {readJson} from './jsonFile.ts';
import {reportDurationMs, type IReport} from './reportTypes.ts';

export interface ITestTotals {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    /**
     * Test time of the run, when any runner measured one. Optional because a baseline
     * committed before durations were collected has no such field, and a report is
     * expected to render without one rather than invent a delta.
     */
    durationMs?: number;
}

export interface IHistoryEntry {
    commit: string;
    run: number;
    date: string;
    tests: ITestTotals;
    coverage: {lines: {hit: number; found: number}};
}

export interface IPackageMetrics {
    tests?: {
        passed: number;
        failed: number;
        flaky: number;
        total: number;
        /** Test time of every runner of the package, when one was measured. */
        durationMs?: number;
    };
    coverage?: {linesHit: number; linesTotal: number};
}

export interface IMetrics {
    schema: 1;
    commit: string;
    run: number;
    updatedAt: string;
    tests: ITestTotals;
    coverage: {lines: {hit: number; found: number}};
    packages: Record<string, IPackageMetrics>;
    history?: IHistoryEntry[];
}

/** Environment the workflow passes in; all fields are optional locally. */
export interface IMetricsEnv {
    commit?: string;
    run?: number;
    now?: string;
}

/**
 * Re-insert the per-package metrics in package-name order.
 *
 * Two runs of the same set of packages must produce the same file, or every
 * added, removed or moved package rewrites unrelated lines and the committed
 * diff becomes hard to review. Ordering by name (rather than by the order the
 * reports happened to be collected in, which is the folder order in rush.json)
 * survives a package moving between category folders.
 */
function sortPackages(packages: Record<string, IPackageMetrics>): Record<string, IPackageMetrics> {
    const sorted: Record<string, IPackageMetrics> = {};
    for (const name of Object.keys(packages).sort()) sorted[name] = packages[name]!;
    return sorted;
}

/** Build this run's snapshot from the collected package reports. */
export function buildMetricsSnapshot(
    reports: readonly IReport[],
    coverage: ICoverage | null,
    env: IMetricsEnv = {},
): IMetrics {
    const totals: ITestTotals = {total: 0, passed: 0, failed: 0, flaky: 0, durationMs: 0};
    const packages: Record<string, IPackageMetrics> = {};

    for (const report of reports) {
        const durationMs = reportDurationMs(report);
        totals.total += report.counts.total;
        totals.passed += report.counts.passed;
        totals.failed += report.counts.failed;
        totals.flaky += report.counts.flaky;
        totals.durationMs = (totals.durationMs ?? 0) + durationMs;
        packages[report.package] = {
            ...packages[report.package],
            tests: {
                passed: report.counts.passed,
                failed: report.counts.failed,
                flaky: report.counts.flaky,
                total: report.counts.total,
                ...(durationMs > 0 ? {durationMs} : {}),
            },
        };
    }

    for (const [pkg, lines] of coverage?.packages ?? []) {
        if (lines.found === 0) continue;
        packages[pkg] = {
            ...packages[pkg],
            coverage: {linesHit: lines.hit, linesTotal: lines.found},
        };
    }

    return {
        schema: 1,
        commit: env.commit ?? '',
        run: env.run ?? 0,
        updatedAt: env.now ?? new Date().toISOString(),
        tests: totals,
        coverage: {lines: {hit: coverage?.lines.hit ?? 0, found: coverage?.lines.found ?? 0}},
        packages: sortPackages(packages),
    };
}

/** Read a committed metrics baseline, returning `null` when unusable. */
export function readMetrics(file: string): IMetrics | null {
    const parsed = readJson<IMetrics>(file);
    return parsed && typeof parsed === 'object' && parsed.packages ? parsed : null;
}

/**
 * Rebuild the committed baseline as "this run on top of the base branch".
 *
 * Anchoring to the base branch (rather than to whatever the pull request branch
 * currently holds) is what keeps repeated runs of one pull request from
 * accumulating history: the same run always produces the same file.
 */
export function rebuildMetrics(base: IMetrics | null, snapshot: IMetrics, limit = 10): IMetrics {
    const entry: IHistoryEntry = {
        commit: snapshot.commit,
        run: snapshot.run,
        date: snapshot.updatedAt,
        tests: snapshot.tests,
        coverage: snapshot.coverage,
    };
    const previous = (base?.history ?? []).filter(item => item.run !== entry.run);
    return {...snapshot, history: [entry, ...previous].slice(0, limit)};
}

/** Percentage of covered lines for a metrics entry. */
export function metricsCoveragePct(metrics: IMetrics | null): number | null {
    const lines = metrics?.coverage?.lines;
    if (!lines || lines.found === 0) return null;
    return Math.round((lines.hit / lines.found) * 1000) / 10;
}

/** One package's coverage now, beside what it was on the base branch. */
export interface ICoverageMover {
    package: string;
    /** Line coverage now, in percent. */
    pct: number;
    /** Percentage-point change against the baseline; positive is better. */
    deltaPp: number;
    /** Lines covered now minus then. */
    deltaLines: number;
    hit: number;
    found: number;
}

/**
 * The packages whose line coverage moved the most against the baseline.
 *
 * A per-package row already carries this delta, but a reader has to scan the whole
 * table to find it, and the table is ordered by name. This is the same number ranked
 * by how much it moved, so the two or three packages a branch actually touched are
 * visible without reading 30 identical rows.
 *
 * Only packages the baseline also measured are eligible (a new package has nothing to
 * compare against), and a move smaller than `minPoints` is rounding noise rather than
 * news, so it is left out entirely.
 */
export function coverageMovers(
    coverage: ICoverage | null | undefined,
    baseline: IMetrics | null | undefined,
    options: {limit?: number; minPoints?: number} = {},
): ICoverageMover[] {
    const {limit = 5, minPoints = 0.1} = options;
    const movers: ICoverageMover[] = [];

    for (const [pkg, lines] of coverage?.packages ?? []) {
        if (lines.found === 0) continue;
        const before = baseline?.packages?.[pkg]?.coverage;
        if (!before || before.linesTotal === 0) continue;
        const pct = lineCoveragePct(lines);
        const beforePct = lineCoveragePct({hit: before.linesHit, found: before.linesTotal});
        const deltaPp = Math.round((pct - beforePct) * 10) / 10;
        if (Math.abs(deltaPp) < minPoints) continue;
        movers.push({
            package: pkg,
            pct,
            deltaPp,
            deltaLines: lines.hit - before.linesHit,
            hit: lines.hit,
            found: lines.found,
        });
    }

    return movers
        .sort(
            (left, right) =>
                Math.abs(right.deltaPp) - Math.abs(left.deltaPp) ||
                left.package.localeCompare(right.package),
        )
        .slice(0, limit);
}

export {lineCoveragePct};
