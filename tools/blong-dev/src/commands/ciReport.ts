/**
 * `blong-dev ci-report` — the single source of truth for the CI test report.
 *
 * Replaces the workflow-side assembly and rendering: it collects every
 * package's `.ci-report/`, renders `ci-report.md` (action summary + PR comment),
 * writes the metrics snapshot, rebuilds the committed metrics/history files from
 * the base branch, and builds the failures bundle published for a red run.
 *
 * Usage:
 *   blong-dev ci-report [--out <dir>] [--baseline <file>] [--base-history <file>]
 *
 * Environment (all set by the workflow in CI, optional locally):
 *   CI_BASE_METRICS / CI_BASE_HISTORY — base-branch copies of the committed files
 *   GITHUB_SHA / GITHUB_RUN_NUMBER / GITHUB_RUN_ID / GITHUB_REPOSITORY / GITHUB_WORKFLOW
 */

import {appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

import {
    buildAggregateSummary,
    collectFailures,
    collectReports,
    readRushProjects,
    writeReportData,
} from '../report/aggregate.ts';
import {readLcov} from '../report/coverage.ts';
import {buildFailuresBundle} from '../report/failuresBundle.ts';
import {
    HISTORY_SLICE,
    historyFile,
    readHistory,
    rebuildHistory,
    type HistoryRecord,
} from '../report/history.ts';
import {buildMetricsSnapshot, readMetrics, rebuildMetrics} from '../report/metrics.ts';
import {REPORT_DIR, repoRoot} from '../report/reportPaths.ts';
import {renderCiReport} from '../report/renderReport.ts';
import {runTool, type RunOptions} from '../utils/runTool.ts';
import {toolEnv} from '../utils/toolPath.ts';

/** How many history entries the committed metrics baseline keeps. */
const HISTORY_LIMIT = 10;

/** Read `--flag value` or `--flag=value` from a positional argument list. */
function readFlag(args: readonly string[], flag: string): string | undefined {
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]!;
        if (arg === flag) return args[index + 1];
        if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
    }
    return undefined;
}

function envNumber(name: string): number | undefined {
    const raw = process.env[name];
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
}

/** Append the report to the job summary so the action run page shows it. */
function appendToStepSummary(markdown: string, outDir: string): void {
    const target = process.env['GITHUB_STEP_SUMMARY'];
    if (target) {
        appendFileSync(target, markdown + '\n');
        return;
    }
    // Local runs get the same file so `dev/ci-report/` mirrors the CI output.
    process.stdout.write(markdown + '\n');
    writeFileSync(join(outDir, 'ci-report.md'), markdown + '\n');
}

/** History slices produced by the runners, keyed by package folder name. */
function collectHistorySlices(root: string, packages: readonly string[]): Map<string, HistoryRecord[]> {
    const slices = new Map<string, HistoryRecord[]>();
    const projects = readRushProjects(root);
    for (const project of projects) {
        const pkg = project.projectFolder.split('/').pop() ?? project.projectFolder;
        if (!packages.includes(pkg)) continue;
        const file = join(root, project.projectFolder, REPORT_DIR, HISTORY_SLICE);
        if (!existsSync(file)) continue;
        slices.set(pkg, readHistory(file));
    }
    return slices;
}

export async function ciReport(args: string[]): Promise<void> {
    const cwd = process.cwd();
    const root = repoRoot(cwd);
    const outDir = resolve(root, readFlag(args, '--out') ?? '.');
    const runAllure = (allureArgs: string[], allureCwd: string) =>
        runTool('allure', allureArgs, {cwd: allureCwd, env: toolEnv(allureCwd)} satisfies RunOptions);

    const baseMetricsFile =
        readFlag(args, '--baseline') ?? process.env['CI_BASE_METRICS'] ?? join(outDir, 'baseline.json');
    const baseHistoryFile = readFlag(args, '--base-history') ?? process.env['CI_BASE_HISTORY'] ?? '';

    const run = envNumber('GITHUB_RUN_NUMBER');
    const projects = readRushProjects(root);
    const reports = collectReports(root);
    const failures = collectFailures(reports);
    const coverage = readLcov(join(root, 'coverage', 'lcov.info'));

    // 1. Per-package data for the workflow artifacts and any downstream tool.
    const summary = buildAggregateSummary(reports, failures, projects.length);
    writeReportData(outDir, reports, summary);

    // A stale bundle from an earlier red run must never be republished as current.
    rmSync(join(outDir, 'ci-failures'), {recursive: true, force: true});

    // 2. This run's metrics snapshot (artifact; also the input of step 5).
    const snapshot = buildMetricsSnapshot(reports, coverage, {
        commit: process.env['GITHUB_SHA'] ?? '',
        run: run ?? 0,
    });
    writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(snapshot, null, 2) + '\n');

    // 3. Failures bundle — skipped entirely when the run is green.
    const bundle = await buildFailuresBundle({
        root,
        outDir: join(outDir, 'ci-failures'),
        reports,
        failures,
        meta: {
            repository: process.env['GITHUB_REPOSITORY'] ?? '',
            workflow: process.env['GITHUB_WORKFLOW'] ?? '',
            run: run ?? 0,
            commit: process.env['GITHUB_SHA'] ?? '',
            runUrl: run
                ? `${process.env['GITHUB_SERVER_URL'] ?? 'https://github.com'}/${process.env['GITHUB_REPOSITORY'] ?? ''}/actions/runs/${process.env['GITHUB_RUN_ID'] ?? ''}`
                : '',
        },
        runAllure,
    });

    // 4. The consolidated report (deltas need the base-branch baseline).
    const baseline = readMetrics(baseMetricsFile);
    const markdown = renderCiReport({
        reports,
        failures,
        coverage,
        baseline,
        run,
        totalPackages: projects.length,
    });
    appendToStepSummary(markdown, outDir);

    // 5. Rebuild the committed baseline + history as "base branch + this run".
    if (baseline || baseHistoryFile) {
        const gitDir = join(outDir, '.github');
        mkdirSync(gitDir, {recursive: true});
        if (baseline) {
            const rebuilt = rebuildMetrics(baseline, snapshot, HISTORY_LIMIT);
            writeFileSync(join(gitDir, 'metrics.json'), JSON.stringify(rebuilt, null, 2) + '\n');
        }
        const baseHistory = baseHistoryFile ? readHistory(baseHistoryFile) : readHistory(historyFile(root));
        const slices = collectHistorySlices(root, reports.map(report => report.package));
        const rebuiltHistory = rebuildHistory(baseHistory, {slices});
        if (rebuiltHistory !== '') writeFileSync(join(gitDir, 'history.jsonl'), rebuiltHistory);
    }

    const totals = summary.totals;
    process.stdout.write(
        `# ci-report: ${reports.length}/${projects.length} package(s), ${totals.passed} passed, ` +
            `${totals.failed} failed${totals.flaky > 0 ? `, ${totals.flaky} flaky` : ''} (${totals.tests} total)\n`,
    );
    if (bundle) {
        process.stdout.write(
            `# failures bundle: ci-failures/publish/failures.json (${bundle.count} failing test(s))\n`,
        );
    }
    process.stdout.write(`# report: report-data/ci-summary.json, coverage: ${coverage ? 'yes' : 'no'}\n`);
}
