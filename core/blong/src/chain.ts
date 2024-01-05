import assert from 'node:assert';

type Step = (a: typeof assert, results: object) => object | Promise<object>
type Steps = (Promise<(Step | Step[]) & {name: string}>[] | Step[]) & {name: string};
interface ITestContext {
    test: (name: string, fn: (t: unknown) => void | Promise<void>) => unknown
}

const runSteps = (steps: Steps): (t: ITestContext) => Promise<void> => async(t: ITestContext) => {
    const results = {$meta: {}};
    for (const [index, stepPromise] of steps.entries()) {
        const step = await stepPromise;
        if (Array.isArray(step)) t.test(step.name || `step ${index + 1}`, runSteps(step));
        else if (typeof step === 'function') {
            const name = step.name;
            if (name) {
                await t.test(name, async t => {
                    const result = await step(assert, results)
                    if (results) results[name] = result;
                });
            } else {
                await t.test(`step ${index + 1}`, async t => {
                    await step(assert, results);
                });
            }
        }
    }
};

export default async (test: ITestContext): Promise<(steps: Steps) => unknown> => {
    const context = test || (await import('node:test')).default
    return steps => context.test(steps.name, runSteps(steps));
}
