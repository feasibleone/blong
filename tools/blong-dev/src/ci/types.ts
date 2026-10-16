/**
 * The document `blong-dev ci failures` produces.
 *
 * It is the answer to one question — what failed in this run, and why — assembled from three
 * sources that know different things: the run's failure bundle (which packages and tests failed),
 * the job log's own operation summary (which packages' operations failed, including ones that
 * published no report) and, when asked for, the `reports` artifact (the raw stream each reason is
 * read from).
 *
 * A verdict is a hypothesis with the numbers behind it, never a claim: `runner-slower` names the
 * previous run and the ratio it was measured against, and `unknown` is the honest answer when
 * nothing in the evidence supports a cause.
 */

import type {ITestCounts, TestStatus} from '../report/reportTypes.ts';
import type {IOperationResult} from './operations.ts';

/** The run a diagnosis is about, and how it was chosen. */
export interface ICiTarget {
    /** `owner/repo`. */
    repository: string;
    workflow: string;
    /** The run number every URL on the reports site uses. */
    run: number;
    /** GitHub's own id for the run, needed for its log and artifacts. */
    runId?: number;
    commit: string;
    branch: string;
    runUrl: string;
    /** How this run was picked, which a reader needs when no `--run` was given. */
    how: string;
}

/** The same package in an earlier run: what says whether this run made it worse. */
export interface IRunComparison {
    run: number;
    status: TestStatus;
    counts: ITestCounts;
    /** The package's own test time, `0` when the comparison could not learn it. */
    testsMs: number;
    /**
     * Where the comparison came from.
     *
     * `page` is the package's published page, which carries the counts and the test time. `bundle`
     * is the run's failure bundle, which is all that is left when a package published an Allure
     * report instead (the browser legs do) — it answers whether the package was red, and nothing
     * about how long it took (@@F-545).
     */
    source: 'page' | 'bundle';
}

/** What a failing test looks like, with everything known about why it failed. */
export interface ICiFailure {
    package: string;
    path: string;
    suite: string;
    test: string;
    runner: string;
    status: string;
    file?: string;
    line?: number;
    message?: string;
    evidence?: string;
    /** Where `message` and `evidence` came from. */
    source: 'bundle' | 'artifact';
    /** Where the test stands in the base branch's history, when the bundle carried it. */
    history?: {kind: string};
    verdict?: IVerdict;
}

export type VerdictKind =
    /** A budget ran out while the runner was slower than usual: the fix is the budget. */
    | 'timeout-under-load'
    /** A committed image differs from the rendered frame: a tolerance, not an assertion. */
    | 'snapshot-mismatch'
    /** The package failed but published no report for the leg that failed. */
    | 'leg-gap'
    /** The base branch was green on this test. */
    | 'new-failure'
    /** The base branch was already red on it. */
    | 'recurring'
    /** Nothing in the evidence supports a cause. */
    | 'unknown';

export interface IVerdict {
    kind: VerdictKind;
    /** The numbers the hypothesis rests on, in one line. */
    reason: string;
}

/** One package of the run. */
export interface ICiPackage {
    package: string;
    path: string;
    runners: string[];
    counts: ITestCounts;
    failures: ICiFailure[];
    /** The operation as the run's own summary reported it, when that could be read. */
    operation?: IOperationResult;
    /**
     * The package's own verdict, for a failure that is not a test: today only the leg-gap, where
     * an operation failed and no report of it reached the bundle.
     */
    verdict?: IVerdict;
    /** The same package in the previous published run. */
    previous?: IRunComparison;
    /**
     * True when the run's summary called this package's operation failed while the bundle has
     * nothing for it — the leg-gap that made a three-failure run read as a two-failure one.
     */
    legGap?: boolean;
}

export interface IDiagnosis {
    target: ICiTarget;
    /** False when the run published no bundle, i.e. it was green. */
    red: boolean;
    totals: {
        packages: number;
        tests: number;
        failed: number;
        flaky: number;
        newFailures: number;
    };
    packages: ICiPackage[];
    /** Every operation the run's summary named, failures first. */
    operations: IOperationResult[];
    /** Where the reasons came from: the published bundle, or the downloaded artifact. */
    evidence: 'bundle' | 'artifact';
    /** Directory the `reports` artifact was unpacked into, when it was. */
    artifactDir?: string;
    /** What the tool could not see, said plainly rather than left to be assumed. */
    notes: string[];
    /** The root `ci-report.md`, when it describes a run older than this one. */
    staleReport?: {file: string; describesRun: number};
}
