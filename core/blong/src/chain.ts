import assert from 'node:assert';

type Step = (a: typeof assert, results: object) => object | Promise<object>
type Steps = Promise<(Step | Step[]) & {name: string}>[] | Step[];
interface TestContext {
    test: (name: string, fn: (t: unknown) => void | Promise<void>) => unknown
}

const runSteps = (steps: Steps) => async(t: TestContext) => {
    const results = {$meta: {}};
    for (const [index, stepPromise] of steps.entries()) {
        const step = await stepPromise;
        if (Array.isArray(step)) t.test(step.name || `step ${index + 1}`, runSteps(step));
        else if (typeof step === 'function') {
            const name = step.name;
            if (name) {
                await t.test(name, async t => {
                    results[name] = await step(assert, results);
                });
            } else {
                await t.test(`step ${index + 1}`, async t => {
                    await step(assert, results);
                });
            }
        }
    }
};

export default async (test: TestContext): Promise<unknown> => {
    const context = test || (await import('node:test')).default
    return steps => context.test(steps.name, runSteps(steps));
}
