import assert from 'node:assert';
import { test } from 'node:test';

type Step = (a: typeof assert, results: object) => object
type Steps = Promise<(Step | Step[]) & {name: string}>[] | Step[];
type TestContext = Parameters<Parameters<typeof test.test>[0]>[0];

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
                await t.test(`step ${index + 1}`, t => {
                    step(assert, results);
                });
            }
        }
    }
};

export default steps => test.test(steps.name, runSteps(steps));
