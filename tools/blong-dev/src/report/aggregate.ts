/**
 * Collects every package's `.ci-report/report.json` into the aggregate view the
 * CI report, the metrics snapshot and the failures bundle are built from.
 *
 * The package list comes from `rush.json`, so the aggregate covers exactly the
 * projects at this commit (no directory globbing, no guessing).
 */

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import stripJsonComments from 'strip-json-comments';

import {readJson} from './jsonFile.ts';
import {REPORT_DIR} from './reportPaths.ts';
import {isProblem, type IReport, type ITestEntry, type TestStatus} from './reportTypes.ts';

export interface IRushProject {
    packageName: string;
    projectFolder: string;
}

interface IRushJson {
    projects?: IRushProject[];
}

/** Read the Rush project list; returns an empty list when rush.json is absent. */
export function readRushProjects(root: string): IRushProject[] {
    const file = join(root, 'rush.json');
    if (!existsSync(file)) return [];
    try {
        const parsed = JSON.parse(stripJsonComments(readFileSync(file, 'utf8'))) as IRushJson;
        return (parsed.projects ?? []).filter(
            project => typeof project?.projectFolder === 'string' && project.projectFolder !== '',
        );
    } catch {
        return [];
    }
}

/** Absolute path of a package's report directory. */
export function packageReportDir(root: string, projectFolder: string): string {
    return join(root, projectFolder, REPORT_DIR);
}

/** Read every package report present in the workspace, ordered by package path. */
export function collectReports(root: string): IReport[] {
    const reports: IReport[] = [];
    for (const project of readRushProjects(root)) {
        const parsed = readJson<IReport>(join(packageReportDir(root, project.projectFolder), 'report.json'));
        if (parsed && parsed.schema === 1) reports.push(parsed);
    }
    return reports.sort((left, right) => left.path.localeCompare(right.path));
}

/** A single failing (or flaky) test, flattened with its package context. */
export interface IFailure extends ITestEntry {
    package: string;
    path: string;
    runner: string;
    suite: string;
}

/** Flatten the problem tests of every report, failures first. */
export function collectFailures(reports: readonly IReport[]): IFailure[] {
    const failures: IFailure[] = [];
    for (const report of reports) {
        for (const suite of report.suites) {
            for (const test of suite.tests) {
                if (!isProblem(test.status)) continue;
                failures.push({
                    ...test,
                    file: test.file ?? suite.file,
                    package: report.package,
                    path: report.path,
                    runner: report.runner,
                    suite: suite.name,
                });
            }
        }
    }
    const rank = (status: TestStatus) => (status === 'flaky' ? 1 : 0);
    return failures.sort(
        (left, right) =>
            rank(left.status) - rank(right.status) ||
            left.package.localeCompare(right.package) ||
            left.name.localeCompare(right.name),
    );
}

export interface IAggregateTotals {
    packages: number;
    packagesWithReport: number;
    failingPackages: number;
    tests: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
}

export interface IAggregateSummary {
    schema: 1;
    generatedAt: string;
    totals: IAggregateTotals;
    packages: Array<{
        package: string;
        path: string;
        runner: string;
        status: TestStatus;
        counts: IReport['counts'];
    }>;
    failures: IFailure[];
}

/** Build the aggregate `ci-summary.json` payload. */
export function buildAggregateSummary(
    reports: readonly IReport[],
    failures: readonly IFailure[],
    totalPackages: number,
): IAggregateSummary {
    const totals: IAggregateTotals = {
        packages: totalPackages,
        packagesWithReport: reports.length,
        failingPackages: reports.filter(report => report.status === 'failed').length,
        tests: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
        skipped: 0,
    };
    for (const report of reports) {
        totals.tests += report.counts.total;
        totals.passed += report.counts.passed;
        totals.failed += report.counts.failed;
        totals.flaky += report.counts.flaky;
        totals.skipped += report.counts.skipped;
    }

    return {
        schema: 1,
        generatedAt: new Date().toISOString(),
        totals,
        packages: reports.map(report => ({
            package: report.package,
            path: report.path,
            runner: report.runner,
            status: report.status,
            counts: report.counts,
        })),
        failures: [...failures],
    };
}

/** Write `report-data/<pkg>.json`, `report-data/<pkg>.md` and the aggregate. */
export function writeReportData(
    outDir: string,
    reports: readonly IReport[],
    summary: IAggregateSummary,
): void {
    const dir = join(outDir, 'report-data');
    mkdirSync(dir, {recursive: true});
    for (const report of reports) {
        writeFileSync(join(dir, `${report.package}.json`), JSON.stringify(report, null, 2) + '\n');
    }
    writeFileSync(join(dir, 'ci-summary.json'), JSON.stringify(summary, null, 2) + '\n');
}
