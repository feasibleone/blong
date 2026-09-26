import {TestExecutor, type IStepProgress, type ITestLogger} from '@feasibleone/blong-chain';
import {withProgress} from '@feasibleone/blong-lib';
import type {IPlatformApi} from '@feasibleone/blong/types';
import assert from 'node:assert';

type Step = (a: typeof assert, results: object) => object | Promise<object>;
type Steps = (Promise<(Step | Step[]) & {name: string}>[] | Step[]) & {
    name: string;
    autoSnapshot?: boolean;
    mask?: string[];
};
interface ITestContext {
    test: (name: string, fn: (t: unknown) => void | Promise<void>) => unknown;
}

/** Allure reporting options, as the framework config supplies them. */
export interface IAllureRunOptions {
    /** Write results at all. Off by default, on for a captured (CI) run. */
    enabled?: boolean;
    /** Results directory (default `allure-results`). */
    outputDir?: string;
    /** Trend history file (default `.allure/history.jsonl`). */
    historyPath?: string;
    /** Generate the HTML report when the session ends. */
    generateOnEnd?: boolean;
    /** Pattern with `{traceId}`, used to link a result to its log trace. */
    logUrl?: string;
}

export interface IChainOptions {
    /** The group's wire name, e.g. `test.order.checkpoint` — what Allure labels come from. */
    method?: string;
    allure?: IAllureRunOptions;
    /**
     * The platform this run belongs to, as `IPlatformApi` names it.
     *
     * Allure 3's format is a directory of files, so producing one needs a
     * filesystem — and the browser platform has none. The platform is therefore what
     * decides whether the attempt is made at all (see `canWriteReport`). A caller
     * that names no platform is read as the server, which is what a direct chain run
     * in Node is: refusing to report there would be worse than trying.
     */
    platform?: IPlatformApi['platform'];
}

/**
 * `@feasibleone/blong-allure`, assembled rather than written out.
 *
 * A specifier written as a literal is *resolved* by the bundler even when the import
 * is dynamic, so the whole integration was landing in every browser build: its modules
 * import `node:fs`, `node:fs/promises`, `node:crypto`, `node:url` and
 * `node:child_process`, none of which a browser can provide, and
 * `browserBundle.test.ts` failed on exactly that list. Building the string at runtime
 * leaves the specifier opaque to the bundler, which is the same trick `load.ts` uses
 * (`extension` there) to keep the server half of the platform map out of a browser
 * build — and it costs nothing on the server, where Node resolves the specifier when
 * it is imported.
 *
 * The import is never *made* on a browser either: `canWriteReport` refuses the
 * platform before it, because a browser has nowhere to write a report.
 */
const allurePackage = (): string => ['@feasibleone', 'blong-allure'].join('/');

/**
 * The one Allure session of this process, started by the first group that runs.
 *
 * A session clears its results directory, so it cannot be per group: the first
 * group would wipe the results of the ones before it. It is started lazily
 * instead, and ended by {@link endAllureSession} once every group has finished.
 */
let session: Promise<void> | undefined;

/** The options the running session was started with, for its end. */
let sessionOptions: IAllureRunOptions | undefined;

/**
 * Why this process will produce no Allure report, once that is known.
 *
 * Held for the run rather than per group, because the answer is the run's: a
 * second group that says the same thing again adds noise to a run that has already
 * explained why the report it asked for will not exist. `session` is never set
 * while this is, so a blocked run also does not try to close a session later.
 */
let blocked: string | undefined;

/**
 * Whether this platform can write Allure's files at all.
 *
 * The browser platform is the one that cannot: it has no `node:fs`, so the lazy
 * import of `blong-allure` there can only fail — and a failure caught per group is
 * a failure reported per group over a run whose tests were fine. Its tests report
 * through their own producer (Allure's Playwright integration), so the results this
 * guard withholds are ones that were never going to exist on that platform.
 *
 * The allowed kinds are listed rather than the refused one, so a platform added
 * later has to be considered here instead of inheriting a report nobody can write.
 */
function canWriteReport(platform: IChainOptions['platform']): boolean {
    return platform === undefined || platform === 'server';
}

/** The results directory and history file, defaulted the way Allure documents them. */
function sessionConfig(options: IAllureRunOptions): {
    outputDir: string;
    historyPath: string;
    logUrl?: string;
} {
    return {
        outputDir: options.outputDir ?? 'allure-results',
        historyPath: options.historyPath ?? '.allure/history.jsonl',
        logUrl: options.logUrl,
    };
}

/**
 * Start the Allure session if this run wants one, once.
 *
 * `blong-allure` is imported here rather than at the top of the file, for the
 * reason the log implementation is chosen lazily: a run that does not report to
 * Allure should not load it.
 *
 * The platform is checked *before* the attempt, and the reason it cannot report is
 * said out loud — as a configuration mistake rather than an error in a test, so the
 * absence of a report is explained rather than discovered.
 *
 * An unexpected failure (a package that cannot be imported on a platform that
 * should be able to write results) is reported on the same terms, and the session
 * is dropped rather than left rejected: there is nothing for the end of the run to
 * close, and a later group must not await a promise that has already failed.
 *
 * This never throws. A report that cannot be written is not a test that failed —
 * the run is judged on its tests — and a caller that had to guard the call would be
 * one place too many for that decision to live.
 */
async function ensureSession(
    options: IAllureRunOptions | undefined,
    platform: IChainOptions['platform'],
    log?: ITestLogger,
): Promise<boolean> {
    if (options?.enabled !== true || blocked !== undefined) return false;
    if (!canWriteReport(platform)) {
        blocked =
            `Allure reporting is enabled for this run but the ${platform} platform cannot write its ` +
            'files, so a report will not be produced';
        log?.warn?.(blocked);
        return false;
    }
    if (session === undefined) {
        sessionOptions = options;
        session = (async () => {
            const {allureSessionStart} = await import(/* @vite-ignore */ allurePackage());
            await allureSessionStart(sessionConfig(options));
        })();
    }
    try {
        await session;
        return true;
    } catch (error) {
        // The first group to lose the session reports it; a group that was awaiting
        // the same start loses it too and stays quiet, because the reason is the
        // run's rather than its own.
        session = undefined;
        sessionOptions = undefined;
        if (blocked === undefined) {
            blocked = `Allure reporting failed: ${String(error)}`;
            log?.error?.(error);
        }
        return false;
    }
}

/**
 * The Allure context for a group's wire name.
 *
 * `test.order.checkpoint` reads as realm `test`, collection `order`, group
 * `checkpoint`. A name that does not split stays the realm, so a suite with its
 * own naming still gets a label rather than a result filed under nothing.
 */
function contextOf(method: string | undefined, options: IAllureRunOptions) {
    const [realm, collection, ...rest] = (method ?? '').split('.').filter(Boolean);
    return {
        realm,
        collection,
        group: rest.length > 0 ? rest.join('.') : undefined,
        logUrl: options.logUrl,
    };
}

/** The steps an executor recorded, in the order they completed. */
function stepsOf(executor: TestExecutor): IStepProgress[] {
    return Array.from(executor.getProgress().steps.values());
}

/** Write one group result, standing in for a step list its executor may not have. */
async function writeGroupResult(
    options: IAllureRunOptions,
    name: string,
    executor: TestExecutor,
    method?: string,
): Promise<void> {
    const steps = stepsOf(executor);
    if (steps.length === 0) return;
    const {allureGroupResultWrite} = await import(/* @vite-ignore */ allurePackage());
    await allureGroupResultWrite(
        sessionConfig(options).outputDir,
        {name, steps},
        contextOf(method, options),
    );
}

/**
 * End the Allure session, if one was started, and optionally generate its report.
 *
 * Called by the runner once every group has finished, because the results
 * directory belongs to the run rather than to any one group.
 */
export async function endAllureSession(): Promise<void> {
    if (session === undefined) return;
    const options = sessionOptions ?? {};
    const closing = session;
    session = undefined;
    sessionOptions = undefined;
    // Waiting on the start first: the end must not run the CLI over a results
    // directory while the thing that lays it out is still opening it. A start that
    // failed has already cleared `session` (see `ensureSession`), so this awaits one
    // that opened, or that is opening.
    await closing;
    const {allureSessionEnd} = await import(/* @vite-ignore */ allurePackage());
    await allureSessionEnd({...sessionConfig(options), generateOnEnd: options.generateOnEnd});
}

const runSteps =
    (
        steps: Steps,
        log?: ITestLogger,
        options: IChainOptions = {},
        results = {$meta: {}},
    ): ((t: ITestContext) => Promise<void>) =>
    async (t: ITestContext) => {
        // Use new parallel TestExecutor for improved performance
        const executor = new TestExecutor({
            concurrency: 10,
            log,
            autoSnapshot: (steps as Steps).autoSnapshot,
            mask: (steps as Steps).mask,
        });

        // Resolve any promises in steps array
        const resolvedSteps: (Step | Step[])[] = [];
        for (const stepPromise of steps) {
            resolvedSteps.push(await stepPromise);
        }

        // Reporting is a run-level concern, and this call never throws: a report that
        // cannot be written says so once and the run carries on being judged on its
        // tests (see `ensureSession`).
        const reporting = await ensureSession(options.allure, options.platform, log);

        // Execute with parallel executor, passing test context for nested output
        try {
            await withProgress(
                log,
                `run ${steps.name}`,
                executor.execute(resolvedSteps, results.$meta || {}, t),
                {
                    getProgress: () => {
                        const progress = executor.getProgress();
                        return {done: progress.completedSteps, total: progress.totalSteps};
                    },
                },
            );

            // Copy results from executor context to results object
            const progress = executor.getProgress();
            for (const [name, stepProgress] of progress.steps) {
                if (stepProgress.result !== undefined) {
                    (results as Record<string, unknown>)[name] = stepProgress.result;
                }
            }
        } catch (error) {
            // Preserve error with context
            throw error;
        } finally {
            // The group is the test case: one result per group, written whether the
            // group passed or not — a scenario that failed is the one a reader opens
            // the report for. The group's own name is what it was run as.
            if (reporting && options.allure) {
                await writeGroupResult(options.allure, steps.name, executor, options.method).catch(
                    error => log?.error?.(error),
                );
            }
        }
    };

// const runStepsSerial =
//     (
//         steps: Steps,
//         results = {$meta: {}} as Record<string, unknown>,
//     ): ((t: ITestContext) => Promise<void>) =>
//     async (t: ITestContext) => {
//         for (const [index, stepPromise] of steps.entries()) {
//             const step = await stepPromise;
//             if (Array.isArray(step))
//                 t.test(
//                     step.name || `step ${index + 1}`,
//                     runStepsSerial(step, results) as (t: unknown) => void | Promise<void>,
//                 );
//             else if (typeof step === 'function') {
//                 const name = step.name;
//                 if (name) {
//                     await t.test(name, async () => {
//                         const result = await step(assert, results);
//                         if (results) (results as Record<string, unknown>)[name] = result;
//                     });
//                 } else {
//                     await t.test(`step ${index + 1}`, async () => {
//                         await step(assert, results);
//                     });
//                 }
//             }
//         }
//     };

export default async (
    test: ITestContext,
    log?: ITestLogger,
    options: IChainOptions = {},
): Promise<(steps: Steps) => unknown> => {
    const context = test || (await import('node:test')).default;
    return steps =>
        context.test(
            steps.name,
            runSteps(steps, log, options) as (t: unknown) => void | Promise<void>,
        );
};
