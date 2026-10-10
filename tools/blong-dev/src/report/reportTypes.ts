/**
 * The `<pkg>/.ci-report/` contract shared by every test runner in the monorepo.
 *
 * Each runner (tap, Playwright, vitest) writes `report.json` + `summary.md`
 * into the package's `.ci-report/` directory. `blong-dev ci-report` later
 * aggregates those files into the single CI report, the metrics snapshot, the
 * history updates and the failures bundle, so the CI workflow never has to
 * understand runner-specific output.
 *
 * A **package**, not a runner, is what `report.json` describes: a package can run
 * more than one runner in a cycle (a realm's handler tests under tap and its
 * browser tests under Playwright), so the file holds one `IRunReport` per runner
 * and carries the totals derived from them. A runner replaces its own slice when
 * it runs and leaves the others alone, which is what makes the second runner of a
 * cycle merge with the first instead of erasing it (T-150).
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
    /**
     * The producer's own full name for the test, when it has one (Allure writes it
     * into every result). It is what joins a test to the history of previous runs,
     * because a bare test name repeats across the files of one package.
     */
    fullName?: string;
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

/**
 * One runner's slice of a package's report: what that runner saw, in its own words.
 *
 * Kept apart from the package's totals rather than folded into them, because the
 * two answer different questions. The totals are what a CI row shows; the slice is
 * what says *which runner* a failing test belongs to, which trace to open for it,
 * and how the package's numbers divide between a handler-test run and a browser run.
 */
export interface IRunReport {
    /** Runner that produced this slice: `tap`, `playwright`, `vitest`. */
    runner: string;
    status: TestStatus;
    counts: ITestCounts;
    durationMs?: number;
    /** When this runner wrote its slice. */
    generatedAt: string;
    suites: ISuiteEntry[];
}

export interface IReport {
    schema: 1;
    /** Package folder name, e.g. `blong-access`. */
    package: string;
    /** Repository-relative package folder, e.g. `realm/blong-access`. */
    path: string;
    /** Derived from `runs`: a package whose any runner failed reads as failed. */
    status: TestStatus;
    /** Derived from `runs`: every runner's counts added up. */
    counts: ITestCounts;
    /** When the file was last written — i.e. the newest run's own stamp. */
    generatedAt: string;
    /**
     * One slice per runner that reported, oldest first. A package that runs a
     * single runner has one entry, which is the usual case.
     */
    runs: IRunReport[];
}

/** The package identity a report is filed under. */
export interface IReportBase {
    package: string;
    path: string;
}

export const REPORT_SCHEMA = 1;

export function emptyCounts(): ITestCounts {
    return {total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, todo: 0};
}

/** Add one counts bag into another, in place. */
export function addCounts(into: ITestCounts, from: ITestCounts): ITestCounts {
    into.total += from.total;
    into.passed += from.passed;
    into.failed += from.failed;
    into.flaky += from.flaky;
    into.skipped += from.skipped;
    into.todo += from.todo;
    return into;
}

/** The runners that contributed to a report, in the order they ran. */
export function runnersOf(report: IReport): string[] {
    return report.runs.map(run => run.runner);
}

/** True when any of the report's runs came from `runner`. */
export function hasRun(report: IReport, runner: string): boolean {
    return report.runs.some(run => run.runner === runner);
}

/**
 * Build a package report from its runs, deriving the totals a CI row is read from.
 *
 * The status is the *worst* of the runs rather than the status of a merged counts
 * bag, so a package whose tap run passed and whose Playwright run was flaky reads
 * as flaky, exactly as a single-runner package with one flaky test does.
 */
export function reportOf(base: IReportBase, runs: IRunReport[]): IReport {
    const counts = emptyCounts();
    for (const run of runs) addCounts(counts, run.counts);
    const statuses = new Set(runs.map(run => run.status));
    const status: TestStatus = statuses.has('failed')
        ? 'failed'
        : statuses.has('broken')
          ? 'broken'
          : statuses.has('flaky')
            ? 'flaky'
            : statusOf(counts);
    const generatedAt = runs.reduce(
        (newest, run) => (run.generatedAt > newest ? run.generatedAt : newest),
        runs[0]?.generatedAt ?? new Date().toISOString(),
    );
    return {schema: REPORT_SCHEMA, ...base, status, counts, generatedAt, runs};
}

/**
 * The report a package has after `run` reports, with that runner's previous slice
 * replaced.
 *
 * Replacing rather than appending is what keeps a re-run from double-counting its
 * own slice; keeping the others is what lets the second runner of a cycle merge
 * with the first. A replaced slice stays in its position, so `runs` keeps reading
 * as the order the runners ran in even after one of them reports again.
 */
export function withRun(existing: IReport | null, run: IRunReport, base: IReportBase): IReport {
    const runs = existing?.runs ?? [];
    const previous = runs.findIndex(candidate => candidate.runner === run.runner);
    return reportOf(
        base,
        previous === -1 ? [...runs, run] : runs.map((entry, i) => (i === previous ? run : entry)),
    );
}

/**
 * The report a package has after `runner` drops its slice, or `null` when nothing
 * is left.
 *
 * A runner clears its slice *before* it starts, so a run that dies mid-way cannot
 * leave the previous report of that runner to be aggregated as the current one.
 */
export function withoutRun(
    existing: IReport | null,
    runner: string,
    base: IReportBase,
): IReport | null {
    const kept = (existing?.runs ?? []).filter(candidate => candidate.runner !== runner);
    return kept.length > 0 ? reportOf(base, kept) : null;
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

/**
 * Wall clock of one runner's slice.
 *
 * A runner that measures its own process (tap) reports it directly. The others
 * report per-test durations instead, so their slice's cost is the sum of the tests
 * that carried one — an approximation that is honest about what was measured and
 * never invents time for a runner that reported none.
 */
export function runDurationMs(run: IRunReport): number {
    if (typeof run.durationMs === 'number') return run.durationMs;
    return runTestDurationMs(run);
}

/**
 * What the *tests* of one run carried, summed from their own durations.
 *
 * The runner's own clock is the tempting number and the misleading one. tap measures its
 * process, so a hook that waits for a service, a dev server starting and a browser
 * launching all land in it: a package that waited six minutes reads as a package that got
 * six minutes slower, which is what made one CI report claim a regression its test cases
 * did not have (blong-party, whose run took 8m42s while its cases carried 2m09s). The
 * tests' own durations are what a regression in the test surface moves, and they are the
 * same kind of measurement whatever the runner, so they are the ones a baseline compares.
 */
export function runTestDurationMs(run: IRunReport): number {
    let total = 0;
    for (const suite of run.suites) {
        for (const test of suite.tests) total += test.durationMs ?? 0;
    }
    return total;
}

/**
 * What the package cost this cycle: every runner's slice added up.
 *
 * Added rather than overlapped because a package's runners run one after the other
 * (`blong-dev test && blong-dev playwright`), so this is the package's own run time — not
 * the wall clock of a CI job, which also depends on how packages are spread over runners.
 * It is the *run* time and not the tests' (see `reportTestDurationMs`): what a run waited
 * for is in here, and that is the whole reason both numbers are kept.
 */
export function reportDurationMs(report: IReport): number {
    return report.runs.reduce((sum, run) => sum + runDurationMs(run), 0);
}

/** The tests of one run that carried a duration of their own. */
function timedTests(run: IRunReport): number {
    return run.suites.reduce(
        (count, suite) =>
            count +
            suite.tests.filter(test => typeof test.durationMs === 'number' && test.durationMs > 0)
                .length,
        0,
    );
}

/**
 * What the package's tests cost: the cases that carried a duration, or — for a runner that
 * timed no case at all — the run's own clock, because an empty figure would hide the number
 * rather than correct it.
 */
export function reportTestDurationMs(report: IReport): number {
    const timed = report.runs.reduce((sum, run) => sum + runTestDurationMs(run), 0);
    return timed > 0 ? timed : reportDurationMs(report);
}

/**
 * The part of a run the tests did not carry — hooks, a dev server, a browser, a wait.
 *
 * Reported only when every test of every run carried a duration: the difference between a
 * clock and a partial sum is missing data, not waiting, and naming that as time outside the
 * tests would invent the very figure this is meant to keep honest.
 */
export function outsideTestsMs(report: IReport): number {
    const complete = report.runs.every(run => {
        const runnable = run.counts.total - run.counts.skipped - run.counts.todo;
        return runnable <= 0 || timedTests(run) >= runnable;
    });
    if (!complete) return 0;
    return Math.max(0, reportDurationMs(report) - reportTestDurationMs(report));
}

/**
 * When the time outside the tests is worth a reader's attention: a minute.
 *
 * Below it the figure is scheduling noise on a shared runner, and naming it in every row
 * would cost more than it says.
 */
export const OUTSIDE_TESTS_MATERIAL_MS = 60_000;

/** The longest tests of one run, most expensive first (ties keep report order). */
export function slowestTests(run: IRunReport, limit: number): ITestEntry[] {
    const timed = run.suites
        .flatMap(suite => suite.tests)
        .filter(test => typeof test.durationMs === 'number' && test.durationMs > 0);
    return timed
        .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))
        .slice(0, limit);
}

/** `1m 02s`, `12s`, `8.2s`, `340ms` — a duration a reader can compare at a glance. */
export function formatDurationMs(ms: number): string {
    const rounded = Math.round(ms);
    if (rounded < 1000) return `${rounded}ms`;
    // A tenth of a second below ten of them, where two tests can differ by just
    // enough to matter, and whole seconds above: beyond that the tenth is noise.
    if (rounded < 10_000) return `${(rounded / 1000).toFixed(1)}s`;
    const seconds = Math.round(rounded / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, '0')}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** `+12s`, `-1m 05s`, `0s` — a change in test time, for the cell that shows the time. */
export function formatDurationDeltaMs(deltaMs: number): string {
    if (deltaMs === 0) return '0s';
    return `${deltaMs > 0 ? '+' : '-'}${formatDurationMs(Math.abs(deltaMs))}`;
}
