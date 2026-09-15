/**
 * The `<pkg>/.ci-report/` contract shared by every test runner in the monorepo.
 *
 * Each runner (tap, Playwright, vitest) writes `report.json` + `summary.md`
 * into the package's `.ci-report/` directory. `blong-dev ci-report` later
 * aggregates those files into the single CI report, the metrics snapshot, the
 * history updates and the failures bundle, so the CI workflow never has to
 * understand runner-specific output.
 */

/** Status of a single test, suite or package. `broken` mirrors Allure's wording. */
export type TestStatus = 'passed' | 'failed' | 'broken' | 'flaky' | 'skipped' | 'todo' | 'unknown';

export interface ITestCounts {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
    todo: number;
}

export interface ITestAttachment {
    name: string;
    file: string;
}

export interface ITestEntry {
    name: string;
    status: TestStatus;
    durationMs?: number;
    message?: string;
    stack?: string;
    file?: string;
    line?: number;
    retries?: number;
    attachments?: ITestAttachment[];
    trace?: string;
    logTraceId?: string;
}

export interface ISuiteEntry {
    name: string;
    file?: string;
    status: TestStatus;
    counts: ITestCounts;
    tests: ITestEntry[];
}

export interface IReport {
    schema: 1;
    /** Package folder name, e.g. `blong-access`. */
    package: string;
    /** Repository-relative package folder, e.g. `realm/blong-access`. */
    path: string;
    /** Runner that produced the report: `tap`, `playwright`, `vitest`. */
    runner: string;
    status: TestStatus;
    counts: ITestCounts;
    durationMs?: number;
    generatedAt: string;
    suites: ISuiteEntry[];
}

export const REPORT_SCHEMA = 1;

export function emptyCounts(): ITestCounts {
    return {total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, todo: 0};
}

/** Sum the counts of the given test entries (also folding suite-level counts). */
export function countTests(tests: readonly ITestEntry[]): ITestCounts {
    const counts = emptyCounts();
    for (const test of tests) {
        counts.total += 1;
        switch (test.status) {
            case 'passed':
                counts.passed += 1;
                break;
            case 'failed':
            case 'broken':
                counts.failed += 1;
                break;
            case 'flaky':
                counts.flaky += 1;
                break;
            case 'skipped':
                counts.skipped += 1;
                break;
            case 'todo':
                counts.todo += 1;
                break;
            default:
                break;
        }
    }
    return counts;
}

/** Collapse a set of counts into the single status used for a suite or package. */
export function statusOf(counts: ITestCounts): TestStatus {
    if (counts.failed > 0) return 'failed';
    if (counts.flaky > 0) return 'flaky';
    if (counts.total > 0) return 'passed';
    return 'unknown';
}

/** Status icon shared by every markdown renderer in the report pipeline. */
export function statusIcon(status: TestStatus): string {
    if (status === 'failed' || status === 'broken') return '❌';
    if (status === 'flaky') return '⚠️';
    if (status === 'passed') return '✅';
    return '⚪';
}

/** True when the status should show up in a failures-only view. */
export function isProblem(status: TestStatus): boolean {
    return status === 'failed' || status === 'broken' || status === 'flaky';
}

/** `1 passed, 2 failed, 1 flaky` — the human summary fragment used in headings. */
export function describeCounts(counts: ITestCounts): string {
    const parts = [`${counts.passed} passed`, `${counts.failed} failed`];
    if (counts.flaky > 0) parts.push(`${counts.flaky} flaky`);
    if (counts.skipped > 0) parts.push(`${counts.skipped} skipped`);
    if (counts.todo > 0) parts.push(`${counts.todo} todo`);
    return parts.join(', ');
}
