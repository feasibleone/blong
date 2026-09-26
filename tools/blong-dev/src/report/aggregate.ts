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

import type {ICoverage} from './coverage.ts';
import {readJson} from './jsonFile.ts';
import {coverageMovers, type ICoverageMover, type IMetrics} from './metrics.ts';
import type {IFailureHistory, IProvenanceIndex} from './provenance.ts';
import {PUBLISH_DIR, REPORT_DIR} from './reportPaths.ts';
import {
    isProblem,
    reportDurationMs,
    type IReport,
    type ITestEntry,
    type TestStatus,
} from './reportTypes.ts';

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

/**
 * Packages whose report directory holds a publishable report.
 *
 * A package only writes `publish/` when its runner produced a standalone report
 * (the Playwright leg does), which is exactly the set the workflow's publish
 * matrix is built from — so the report can link each package's published report
 * without waiting for the upload and publish jobs.
 */
export function collectPublishable(root: string, reports: readonly IReport[]): string[] {
    return reports
        .filter(report => existsSync(join(root, report.path, REPORT_DIR, PUBLISH_DIR)))
        .map(report => report.package);
}

/** Read every package report present in the workspace, ordered by package path. */
export function collectReports(root: string): IReport[] {
    const reports: IReport[] = [];
    for (const project of readRushProjects(root)) {
        const parsed = readJson<IReport>(
            join(packageReportDir(root, project.projectFolder), 'report.json'),
        );
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
    /** Where the test stands in the base branch's recent history, when known. */
    history?: IFailureHistory;
}

/** Flatten the problem tests of every report, failures first. */
export function collectFailures(
    reports: readonly IReport[],
    provenance?: IProvenanceIndex,
): IFailure[] {
    const failures: IFailure[] = [];
    for (const report of reports) {
        for (const run of report.runs) {
            for (const suite of run.suites) {
                for (const test of suite.tests) {
                    if (!isProblem(test.status)) continue;
                    const history = provenance?.lookup(report.package, test.name, test.fullName);
                    failures.push({
                        ...test,
                        file: test.file ?? suite.file,
                        package: report.package,
                        path: report.path,
                        runner: run.runner,
                        suite: suite.name,
                        ...(history ? {history} : {}),
                    });
                }
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
    todo: number;
    /**
     * Test time across every package, added up: every runner's slice of every
     * package. It is not the wall clock of the job — packages run in parallel and
     * the split over job runners is the workflow's business — but it is the number
     * that moves when a package gets slower.
     */
    durationMs: number;
    /** Problems the base branch was green on, i.e. what this run introduced. */
    newFailures: number;
}

export interface IAggregateSummary {
    schema: 1;
    generatedAt: string;
    totals: IAggregateTotals;
    packages: Array<{
        package: string;
        path: string;
        /**
         * Every runner that reported into the package, in the order they ran. A
         * package can run more than one (a realm's handler tests and its browser
         * tests), so there is no single `runner` to point at.
         */
        runners: string[];
        status: TestStatus;
        counts: IReport['counts'];
        /** Test time of every runner that reported into this package. */
        durationMs: number;
    }>;
    /** Packages whose coverage moved most against the baseline, best and worst first. */
    coverageMovers: ICoverageMover[];
    failures: IFailure[];
}

/** What the aggregate view needs beyond the reports themselves. */
export interface IAggregateInput {
    coverage?: ICoverage | null;
    baseline?: IMetrics | null;
}

/** Build the aggregate `ci-summary.json` payload. */
export function buildAggregateSummary(
    reports: readonly IReport[],
    failures: readonly IFailure[],
    totalPackages: number,
    input: IAggregateInput = {},
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
        todo: 0,
        durationMs: 0,
        newFailures: failures.filter(failure => failure.history?.kind === 'new').length,
    };
    for (const report of reports) {
        totals.tests += report.counts.total;
        totals.passed += report.counts.passed;
        totals.failed += report.counts.failed;
        totals.flaky += report.counts.flaky;
        totals.skipped += report.counts.skipped;
        totals.todo += report.counts.todo;
        totals.durationMs += reportDurationMs(report);
    }

    return {
        schema: 1,
        generatedAt: new Date().toISOString(),
        totals,
        packages: reports.map(report => ({
            package: report.package,
            path: report.path,
            runners: report.runs.map(run => run.runner),
            status: report.status,
            counts: report.counts,
            durationMs: reportDurationMs(report),
        })),
        coverageMovers: coverageMovers(input.coverage, input.baseline),
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
