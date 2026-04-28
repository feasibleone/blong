import {TestExecutor, type ITestLogger} from '@feasibleone/blong-chain';
import assert from 'node:assert';

type Step = (a: typeof assert, results: object) => object | Promise<object>;
type Steps = (Promise<(Step | Step[]) & {name: string}>[] | Step[]) & {name: string};
interface ITestContext {
    test: (name: string, fn: (t: unknown) => void | Promise<void>) => unknown;
}

const runSteps =
    (
        steps: Steps,
        log?: ITestLogger,
        results = {$meta: {}},
    ): ((t: ITestContext) => Promise<void>) =>
    async (t: ITestContext) => {
        // Use new parallel TestExecutor for improved performance
        const executor = new TestExecutor({concurrency: 10, log});

        // Resolve any promises in steps array
        const resolvedSteps: (Step | Step[])[] = [];
        for (const stepPromise of steps) {
            resolvedSteps.push(await stepPromise);
        }

        // Execute with parallel executor, passing test context for nested output
        try {
            await executor.execute(resolvedSteps as any, results.$meta || {}, t as any);

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
): Promise<(steps: Steps) => unknown> => {
    const context = test || (await import('node:test')).default;
    return steps =>
        context.test(steps.name, runSteps(steps, log) as (t: unknown) => void | Promise<void>);
};
