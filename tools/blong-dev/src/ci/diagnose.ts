/**
 * Assemble the answer: what failed, why, and what the numbers behind that say.
 *
 * Three sources are merged, each the only witness to something: the run's failure bundle (the
 * failing tests, with provenance), the job log's operation summary (a failing operation that
 * published no report), and — for `--full` — the downloaded `reports` artifact (the raw stream
 * each reason lives in). Nothing is inferred from a checkout: the run happened on a runner, in a
 * commit that is usually not the one on disk.
 *
 * Every gap is named rather than smoothed over. A failure with no message says so, a package the
 * bundle does not have says the bundle has nothing for it, and a comparison the site cannot supply
 * is left out instead of being guessed (@@D-561).
 */

import type {IFailuresJson, IFailuresJsonFailure} from '../report/failuresBundle.ts';
import {isProblem, type ITestCounts} from '../report/reportTypes.ts';
import {legGapVerdict, verdictFor} from './classify.ts';
import type {IArtifactEvidence} from './evidence.ts';
import {RUNNER_STDERR_FILE} from './evidence.ts';
import type {IOperationResult} from './operations.ts';
import type {ICiFailure, ICiPackage, ICiTarget, IDiagnosis, IRunComparison} from './types.ts';

/** How many earlier runs are searched for a package's previous published page. */
const DEFAULT_EARLIER_RUNS = 3;

export interface IDiagnoseInput {
    target: ICiTarget;
    /** The bundle the run published, absent when the run was green or died before writing one. */
    bundle?: IFailuresJson;
    /** The run's own operation summary, when the job log could be read. */
    operations?: readonly IOperationResult[];
    /** Runs of the same scope, newest first, used to find a package's previous page. */
    history?: readonly number[];
    earlierRuns?: number;
    /**
     * Injected: the same package in one earlier run, from the reports site.
     *
     * A function rather than a summary, because two documents can answer it — the package's page
     * and, for a package that published an Allure report instead, the run's failure bundle.
     */
    previous?: (pkg: string, run: number) => Promise<IRunComparison | undefined>;
    /** Injected: what an unpacked `reports` artifact adds. */
    evidence?: IArtifactEvidence;
    artifactDir?: string;
    /** Notes resolution produced, carried into the answer. */
    notes?: readonly string[];
    staleReport?: {file: string; describesRun: number};
}

/** One failure of the bundle, in the shape the diagnosis carries. */
function toFailure(packageName: string, path: string, failure: IFailuresJsonFailure): ICiFailure {
    return {
        package: packageName,
        path,
        suite: failure.suite,
        test: failure.test,
        runner: failure.runner,
        status: failure.status,
        ...(failure.file ? {file: failure.file} : {}),
        ...(failure.line ? {line: failure.line} : {}),
        ...(failure.message ? {message: failure.message} : {}),
        ...(failure.evidence ? {evidence: failure.evidence} : {}),
        ...(failure.history ? {history: failure.history} : {}),
        source: 'bundle',
    };
}

/** The counts of a run that has no report for its package. */
function noCounts(): ITestCounts {
    return {total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, todo: 0};
}

/**
 * Legs the bundle has nothing for, read from the report inside the artifact.
 *
 * A package can run a leg that fails while the report it publishes comes from another one — the
 * Storybook leg of `blong-log` beside its tap tests — and that is invisible to a reader of the
 * bundle unless the leg writes a slice of its own. Where it did not, the artifact still has the
 * leg's own files, and a failure found there is added with the verdict that says why it was
 * missing (@@F-539).
 */
function addLegFailures(pkg: ICiPackage, evidence: IArtifactEvidence): number {
    const report = evidence.report(pkg.path);
    let added = 0;
    for (const run of report?.runs ?? []) {
        if (run.status !== 'failed' && run.status !== 'broken') continue;
        for (const suite of run.suites) {
            for (const test of suite.tests) {
                if (!isProblem(test.status)) continue;
                const name = test.name;
                const known = pkg.failures.some(
                    failure =>
                        failure.runner === run.runner &&
                        (failure.test === name || failure.test.endsWith(`› ${name}`)),
                );
                if (known) continue;
                const file = test.file ?? suite.file;
                pkg.failures.push({
                    package: pkg.package,
                    path: pkg.path,
                    suite: suite.name,
                    test: name,
                    runner: run.runner,
                    status: test.status,
                    ...(file ? {file} : {}),
                    ...(test.line ? {line: test.line} : {}),
                    ...(test.message ? {message: test.message} : {}),
                    source: 'artifact',
                });
                added += 1;
            }
        }
    }
    return added;
}

/**
 * Layer what the artifact knows onto the packages already assembled.
 *
 * Three passes, in increasing order of how badly the bundle failed to describe the failure: the
 * reason for a failure the bundle already names, a failing leg its own report knew about and the
 * bundle did not, and a leg that published nothing at all — readable only from its own log.
 */
function applyEvidence(
    packages: Map<string, ICiPackage>,
    evidence: IArtifactEvidence,
    notes: string[],
): void {
    for (const pkg of packages.values()) {
        if (pkg.path === '') pkg.path = evidence.locate(pkg.package) ?? '';
        for (const failure of pkg.failures) {
            if (!failure.message) {
                const message = evidence.message(pkg.path, failure.runner, failure.test);
                if (message) {
                    failure.message = message;
                    failure.source = 'artifact';
                }
            }
            if (failure.evidence) continue;
            const fromRunner = evidence.excerpt(failure);
            const fromStderr = evidence.stderr(pkg.path);
            // A process that exited without a reason in its report is the case the stream cannot
            // answer, so what it wrote to stderr goes first (@@F-543). That includes a process a
            // signal killed, which the report names with the signal instead of a code (@@F-549).
            const preferStderr = /exited with (?:code|signal)/i.test(failure.message ?? '');
            const chosen = preferStderr && fromStderr ? fromStderr : (fromRunner ?? fromStderr);
            if (chosen) {
                failure.evidence =
                    fromStderr === chosen && fromRunner !== chosen
                        ? `from ${RUNNER_STDERR_FILE}:\n${chosen}`
                        : chosen;
                failure.source = 'artifact';
            }
        }
        if (addLegFailures(pkg, evidence) > 0) {
            notes.push(
                `${pkg.package}: a failing leg of the artifact's own report was not in the bundle, ` +
                    'and is listed from the artifact instead',
            );
        }
        if (pkg.failures.length > 0 || pkg.path === '') continue;
        const logged = evidence.logFailures(pkg.path);
        for (const entry of logged) {
            pkg.failures.push({
                package: pkg.package,
                path: pkg.path,
                suite: '',
                test: entry.test,
                runner: entry.runner,
                status: 'failed',
                ...(entry.excerpt ? {evidence: entry.excerpt} : {}),
                source: 'artifact',
            });
        }
        if (logged.length > 0) {
            notes.push(
                `${pkg.package}: the failing leg published no report of its own, so its tests are ` +
                    "read from the leg's log inside the artifact",
            );
        }
    }
}

/** The answer. */
export async function diagnose(input: IDiagnoseInput): Promise<IDiagnosis> {
    const notes = [...(input.notes ?? [])];
    const packages = new Map<string, ICiPackage>();
    const earlierRuns = input.earlierRuns ?? DEFAULT_EARLIER_RUNS;

    for (const entry of input.bundle?.packages ?? []) {
        packages.set(entry.package, {
            package: entry.package,
            path: entry.path,
            runners: entry.runners,
            counts: entry.counts,
            failures: entry.failures.map(failure => toFailure(entry.package, entry.path, failure)),
        });
    }

    for (const operation of input.operations ?? []) {
        if (operation.verdict !== 'failure') continue;
        const pkg = packages.get(operation.package);
        if (pkg) {
            pkg.operation = operation;
            continue;
        }
        packages.set(operation.package, {
            package: operation.package,
            path: '',
            runners: [],
            counts: noCounts(),
            failures: [],
            operation,
            legGap: true,
            verdict: legGapVerdict(operation),
        });
    }

    // The artifact last, so it can explain the packages the bundle and the summary both named —
    // and the one neither of them listed a single test for.
    if (input.evidence) {
        applyEvidence(packages, input.evidence, notes);
    }

    for (const pkg of packages.values()) {
        pkg.previous = await previousRun(pkg.package, input, earlierRuns);
        for (const failure of pkg.failures) {
            const verdict = verdictFor(failure, pkg.previous);
            if (verdict) failure.verdict = verdict;
        }
    }

    const all = [...packages.values()].flatMap(pkg => pkg.failures);
    // A leg-gap package that the artifact supplied tests for is no longer a gap in what is known,
    // only in what the bundle carried.
    for (const pkg of packages.values()) {
        if (pkg.failures.length === 0 && pkg.operation?.verdict !== 'failure') pkg.legGap = false;
    }
    // Red means a test **failed**, not that the run published a bundle: a bundle is published
    // whenever the report holds a problem of any kind, and a flaky test is a problem to the
    // pipeline while the run itself is green. Build #621 proves it — it is a successful run whose
    // bundle holds one flaky entry, and calling it red sent a reader looking for a failure that
    // does not exist (@@F-544).
    const failed = all.filter(failure => failure.status !== 'flaky').length;
    const observed = {
        packages: packages.size,
        tests: all.length,
        failed,
        flaky: all.length - failed,
        newFailures: all.filter(failure => failure.history?.kind === 'new').length,
    };
    if (input.bundle && observed.tests !== input.bundle.totals.tests) {
        notes.push(
            `the bundle names ${input.bundle.totals.tests} failing test(s) while the evidence ` +
                `accounts for ${observed.tests}; the difference is listed above as the leg the ` +
                'bundle never heard about',
        );
    }
    if (!input.bundle) {
        notes.push(
            'the run published no failure bundle, which is what a green run looks like — and also ' +
                'what a run that died before the report step looks like; the operation summary ' +
                'above is the witness for the second case',
        );
    }
    if (failed === 0 && observed.flaky > 0) {
        notes.push(
            `${observed.flaky} flaky test(s) sit in the bundle and none of them failed: a flaky ` +
                'test passed on its retry, so the run itself is green and the bundle is what made it ' +
                'look otherwise',
        );
    }
    if (!input.evidence) {
        const mystery = all.filter(
            failure => failure.status !== 'flaky' && !failure.message && !failure.evidence,
        ).length;
        if (mystery > 0) {
            notes.push(
                `${mystery} failure(s) came with no reason: run with --full to download the ` +
                    "run's reports artifact and read the raw stream beside each report",
            );
        }
    }

    const failedOperations = (input.operations ?? []).filter(
        operation => operation.verdict === 'failure',
    );
    return {
        target: input.target,
        red: observed.failed > 0 || failedOperations.length > 0,
        totals: observed,
        packages: [...packages.values()].sort(
            (left, right) =>
                Number(right.legGap ?? false) - Number(left.legGap ?? false) ||
                left.package.localeCompare(right.package),
        ),
        operations: [...(input.operations ?? [])],
        evidence: input.evidence ? 'artifact' : 'bundle',
        ...(input.artifactDir ? {artifactDir: input.artifactDir} : {}),
        notes,
        ...(input.staleReport ? {staleReport: input.staleReport} : {}),
    };
}

/**
 * The same package in an earlier run, from the reports site.
 *
 * Older runs are searched newest first and the first one with a page for this package wins: a run
 * the package did not take part in published nothing about it, and that is not a comparison
 * (@@F-540).
 */
async function previousRun(
    packageName: string,
    input: IDiagnoseInput,
    earlierRuns: number,
): Promise<IRunComparison | undefined> {
    if (!input.previous) return undefined;
    let seen = 0;
    for (const run of input.history ?? []) {
        if (run === input.target.run) continue;
        if (run > input.target.run) continue;
        if (seen >= earlierRuns) break;
        seen += 1;
        const comparison = await input.previous(packageName, run);
        if (comparison) return comparison;
    }
    return undefined;
}
