import {test} from 'tap';
import {AssertionError, createBrowserAssert, TestExecutor} from './browser.ts';
import type {IAssertion, IDependencyEdge, IStepProgress} from './test-types.js';

test('the browser assert covers the chain surface', async t => {
    const assert = createBrowserAssert();
    t.doesNotThrow(() => assert.ok(true, 'ok passes'));
    t.doesNotThrow(() => assert.deepEqual({a: [1, {b: 2}]}, {a: [1, {b: 2}]}));
    t.doesNotThrow(() => assert.deepStrictEqual([1, 2], [1, 2]));
    t.throws(() => assert.equal(1, 2, 'one is not two'), /one is not two/);
    t.throws(() => assert.strictEqual(1, '1', 'strict'), AssertionError);
    t.throws(() => assert.deepEqual({a: 1}, {a: 2}), AssertionError);
    t.doesNotThrow(() => assert.notEqual(1, 2));
    t.throws(() => assert.fail('failed'), /failed/);
    await assert.rejects(Promise.reject(new Error('nope')), /nope/);
    await t.rejects(assert.rejects(Promise.resolve(), /x/), /Missing expected rejection/);
    await t.rejects(() => assert.rejects(Promise.reject(new Error('other')), /nope/), /did not match/);
    await t.rejects(() => assert.doesNotReject(Promise.reject(new Error('bad'))), /unwanted rejection/);
    t.doesNotThrow(() => assert.ifError(undefined));
    t.throws(() => assert.ifError(new Error('kept')), /kept/);
    t.throws(() => assert.match('abc', /xyz/), /did not match/);
    t.throws(() => assert.doesNotMatch('abc', /b/), /matched/);
    t.throws(() => assert.throws(() => undefined, /x/), /Missing expected exception/);
    t.doesNotThrow(() => assert.throws(() => { throw new Error('thrown'); }, /thrown/));
    t.doesNotThrow(() => assert.doesNotThrow(() => undefined));
});

test('the browser executor records assertions and live dependencies', async t => {
    async function first(assert: ReturnType<typeof createBrowserAssert>) {
        assert.ok(true, 'first runs');
        return {value: 42};
    }
    async function second(
        assert: ReturnType<typeof createBrowserAssert>,
        context: {$meta: object; first: Promise<{value: number}>},
    ) {
        const {value} = await context.first;
        assert.equal(value, 42, 'the value flows');
        return value;
    }
    const steps = Object.assign([first, second], {name: 'browser flow'});
    const executor = new TestExecutor({concurrency: 2});
    const edges: IDependencyEdge[] = [];
    executor.on('step:dependency', edge => edges.push(edge));
    await executor.execute(steps as never, {});

    const progress = executor.getProgress();
    t.equal(progress.status, 'completed', 'the run completed');
    t.equal(progress.assertions.total, 2, 'both assertions counted');
    t.equal(progress.assertions.threw, 0, 'none threw');
    t.same(
        progress.steps.get('first')?.assertions,
        {total: 1, threw: 0},
        'assertions are counted per step',
    );
    const log: IAssertion[] = progress.steps.get('first')?.assertionLog ?? [];
    t.equal(log.length, 1, 'the call is in the assertion log');
    t.equal(log[0].message, 'first runs', 'the message is kept');
    t.ok(log[0].passed, 'the assertion passed');
    t.ok(log[0].source?.file.includes('browser.test.ts'), 'the source pointer names the test');
    t.same(
        edges.map(edge => [edge.from, edge.to]),
        [['second', 'first']],
        'the dependency was emitted when it was read',
    );
});

test('a caught failed assertion is still counted as thrown', async t => {
    async function catches(assert: ReturnType<typeof createBrowserAssert>) {
        try {
            assert.equal(1, 2, 'caught mismatch');
        } catch {
            return 'continued';
        }
        return 'unreachable';
    }
    const steps = Object.assign([catches], {name: 'caught'});
    const executor = new TestExecutor({concurrency: 1});
    await executor.execute(steps as never, {});
    const step = executor.getProgress().steps.get('catches') as IStepProgress;
    t.equal(step.status, 'completed', 'the step continued');
    t.same(step.assertions, {total: 1, threw: 1}, 'the thrown assertion is counted');
    t.equal(executor.getProgress().assertions.threw, 1, 'the run sees it too');
});
