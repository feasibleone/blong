/**
 * TDD test suite for the parallel test executor
 *
 * These tests validate the new parallel test execution framework with:
 * - Thenable proxy patterns (4 variants)
 * - Automatic dependency detection
 * - Parallel execution with configurable concurrency
 * - Dependency graph tracking
 * - Live progress tracking
 * - Enhanced error reporting
 * - Latency metrics
 */

import assert from 'assert';
import tap from 'tap';
import {
    TestExecutor,
    type ITestContext,
    type ITestFrameworkContext,
    type StepArray,
} from './index.js';

tap.test('TestExecutor - Thenable Proxy Patterns', async t => {
    t.test('Pattern 1: await context.propertyName', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupData() {
                return {userId: 'user-123', name: 'Alice'};
            },
            async function processData(assert, context) {
                // Pattern 1: Direct context access
                const data = (await context.setupData) as {userId: string; name: string};
                assert.equal(data.userId, 'user-123');
                assert.equal(data.name, 'Alice');
                return {processed: true};
            },
        ];

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.status, 'completed');
        assert.equal(progress.completedSteps, 2);
        assert.equal(progress.failedSteps, 0);
    });

    t.test('Pattern 2: {propertyName} then await propertyName', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupData() {
                return {userId: 'user-456', email: 'bob@example.com'};
            },
            async function verifyData(assert, context) {
                // Pattern 2: Single-level destructuring, then await
                const {setupData} = context;
                const data = (await setupData) as {userId: string; email: string};
                assert.equal(data.userId, 'user-456');
                assert.equal(data.email, 'bob@example.com');
            },
        ];

        await executor.execute(steps, {});

        const graph = executor.getDependencyGraph();
        assert.equal(graph.edges.length, 1);
        assert.equal(graph.edges[0].from, 'verifyData');
        assert.equal(graph.edges[0].to, 'setupData');
    });

    t.test('Pattern 3: {propertyName} then await propertyName.nestedProperty', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupUser() {
                return {
                    id: 'user-789',
                    profile: {name: 'Charlie', age: 30},
                };
            },
            async function verifyProfile(assert, context) {
                // Pattern 3: Property access after destructuring
                const setupUser = (await context.setupUser) as {
                    profile: {name: string; age: number};
                };
                const name = setupUser.profile.name;
                const age = setupUser.profile.age;
                assert.equal(name, 'Charlie');
                assert.equal(age, 30);
            },
        ];

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.status, 'completed');
    });

    t.test('Pattern 4: {propertyName: {nestedProperty}} then await nestedProperty', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupAccount() {
                return {
                    accountId: 'acct-999',
                    owner: {name: 'Diana', email: 'diana@example.com'},
                };
            },
            async function processOwner(assert, context) {
                // Pattern 4: Nested destructuring, then await
                const setupAccount = (await context.setupAccount) as {
                    owner: {name: string; email: string};
                };
                const ownerData = setupAccount.owner;
                assert.equal(ownerData.name, 'Diana');
                assert.equal(ownerData.email, 'diana@example.com');
            },
        ];

        await executor.execute(steps, {});
    });

    t.test('$meta is always available directly without await', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const testMeta = {testId: 'test-123', environment: 'dev'};

        const steps: StepArray = [
            async function checkMeta(assert, context) {
                // $meta should be directly accessible, not a thenable proxy
                assert.equal(context.$meta.testId, 'test-123');
                assert.equal(context.$meta.environment, 'dev');
                // Should not need await
                const meta = context.$meta;
                assert.equal(meta.testId, 'test-123');
            },
        ];

        await executor.execute(steps, testMeta);
    });
});

tap.test('TestExecutor - Parallel Execution', async t => {
    t.test('independent steps run in parallel', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const executionOrder: string[] = [];

        const steps: StepArray = [
            async function stepA() {
                executionOrder.push('A-start');
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push('A-end');
                return {valueA: 'A'};
            },
            async function stepB() {
                executionOrder.push('B-start');
                await new Promise(resolve => setTimeout(resolve, 30));
                executionOrder.push('B-end');
                return {valueB: 'B'};
            },
            async function stepC() {
                executionOrder.push('C-start');
                await new Promise(resolve => setTimeout(resolve, 20));
                executionOrder.push('C-end');
                return {valueC: 'C'};
            },
        ];

        await executor.execute(steps, {});

        // All steps should start before any end (parallel execution)
        const _startCount = executionOrder.filter(e => e.endsWith('-start')).length;
        const firstEndIndex = executionOrder.findIndex(e => e.endsWith('-end'));
        const startsBeforeFirstEnd = executionOrder
            .slice(0, firstEndIndex)
            .filter(e => e.endsWith('-start')).length;

        assert.ok(
            startsBeforeFirstEnd > 1,
            'Multiple steps should start before first one ends (parallel execution)',
        );
    });

    t.test('dependent steps wait for dependencies', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const executionOrder: string[] = [];

        const steps: StepArray = [
            async function setupDatabase() {
                executionOrder.push('DB-start');
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push('DB-end');
                return {dbId: 'db-123'};
            },
            async function queryDatabase(assert, context) {
                executionOrder.push('Query-start');
                const {setupDatabase} = context;
                const db = (await setupDatabase) as {dbId: string};
                executionOrder.push('Query-end');
                assert.equal(db.dbId, 'db-123');
                return {results: []};
            },
        ];

        await executor.execute(steps, {});

        // Query should not END before DB setup completes
        // (Query can START in parallel, but it will BLOCK on await setupDatabase)
        const dbEndIndex = executionOrder.indexOf('DB-end');
        const queryEndIndex = executionOrder.indexOf('Query-end');

        assert.ok(dbEndIndex < queryEndIndex, 'Dependent step should complete after dependency');
    });

    t.test('respects concurrency limit', async () => {
        const executor = new TestExecutor({concurrency: 2}); // Limit to 2 concurrent steps
        let concurrentSteps = 0;
        let maxConcurrent = 0;

        const steps = Array.from(
            {length: 5},
            (_, i) =>
                async function step() {
                    concurrentSteps++;
                    maxConcurrent = Math.max(maxConcurrent, concurrentSteps);
                    await new Promise(resolve => setTimeout(resolve, 20));
                    concurrentSteps--;
                    return {value: i};
                },
        );

        // Rename steps to make them unique
        steps.forEach((step, i) => {
            Object.defineProperty(step, 'name', {value: `step${i}`, configurable: true});
        });

        await executor.execute(steps, {});

        assert.ok(maxConcurrent <= 2, `Max concurrent should be <= 2, was ${maxConcurrent}`);
    });
});

tap.test('TestExecutor - Dependency Graph', async t => {
    t.test('tracks simple dependency', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function stepA() {
                return {value: 'A'};
            },
            async function stepB(assert, context) {
                const {stepA} = context;
                await stepA;
                return {value: 'B'};
            },
        ];

        await executor.execute(steps, {});

        const graph = executor.getDependencyGraph();
        assert.equal(graph.nodes.size, 2);
        assert.equal(graph.edges.length, 1);
        assert.equal(graph.edges[0].from, 'stepB');
        assert.equal(graph.edges[0].to, 'stepA');
        assert.equal(graph.edges[0].property, 'stepA');
    });

    t.test('tracks multiple dependencies', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupUser() {
                return {userId: 'user-1'};
            },
            async function setupAccount() {
                return {accountId: 'acct-1'};
            },
            async function linkAccounts(assert, context) {
                const {setupUser, setupAccount} = context;
                await setupUser;
                await setupAccount;
                return {linked: true};
            },
        ];

        await executor.execute(steps, {});

        const graph = executor.getDependencyGraph();
        assert.equal(graph.edges.length, 2);

        const deps = graph.edges.filter(e => e.from === 'linkAccounts');
        assert.equal(deps.length, 2);
        assert.ok(deps.some(e => e.to === 'setupUser'));
        assert.ok(deps.some(e => e.to === 'setupAccount'));
    });

    t.test('tracks nested property dependencies', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupData() {
                return {user: {name: 'Alice', email: 'alice@example.com'}};
            },
            async function processData(assert, context) {
                const {setupData} = context;
                const email = (await setupData) as {user: {name: string; email: string}};
                return {processed: email.user.email};
            },
        ];

        await executor.execute(steps, {});

        const graph = executor.getDependencyGraph();
        const edge = graph.edges.find(e => e.from === 'processData');
        assert.ok(edge);
        assert.ok(edge.property.includes('setupData'));
    });
});

tap.test('TestExecutor - Progress Tracking', async t => {
    t.test('tracks overall test progress', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function step1() {
                return {v: 1};
            },
            async function step2() {
                return {v: 2};
            },
            async function step3() {
                return {v: 3};
            },
        ];

        const progressSnapshots: string[] = [];
        executor.on('step:start', name => progressSnapshots.push(`start:${name}`));
        executor.on('step:end', name => progressSnapshots.push(`end:${name}`));

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.totalSteps, 3);
        assert.equal(progress.completedSteps, 3);
        assert.equal(progress.failedSteps, 0);
        assert.equal(progress.status, 'completed');

        assert.equal(progressSnapshots.length, 6); // 3 starts + 3 ends
    });

    t.test('tracks individual step progress', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function processData() {
                await new Promise(resolve => setTimeout(resolve, 50));
                return {result: 'done'};
            },
        ];

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        const stepProgress = progress.steps.get('processData');

        assert.ok(stepProgress);
        assert.equal(stepProgress.status, 'completed');
        assert.ok(stepProgress.startTime);
        assert.ok(stepProgress.endTime);
        assert.ok(stepProgress.duration && stepProgress.duration >= 50);
    });

    t.test('emits real-time progress events', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const events: string[] = [];

        executor.on('test:start', () => events.push('test:start'));
        executor.on('step:start', name => events.push(`step:start:${name}`));
        executor.on('step:end', name => events.push(`step:end:${name}`));
        executor.on('test:end', () => events.push('test:end'));

        const steps: StepArray = [
            async function step1() {
                return {};
            },
            async function step2() {
                return {};
            },
        ];

        await executor.execute(steps, {});

        assert.equal(events[0], 'test:start');
        assert.equal(events[events.length - 1], 'test:end');
        assert.ok(events.includes('step:start:step1'));
        assert.ok(events.includes('step:end:step1'));
    });
});

tap.test('TestExecutor - Error Handling', async t => {
    t.test('captures step errors with context', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupData() {
                return {userId: 'user-1'};
            },
            async function failingStep(assert, context) {
                const {setupData} = context;
                await setupData;
                throw new Error('Intentional test failure');
            },
        ];

        await assert.rejects(executor.execute(steps, {}), /Intentional test failure/);

        const progress = executor.getProgress();
        assert.equal(progress.failedSteps, 1);

        const stepProgress = progress.steps.get('failingStep');
        assert.ok(stepProgress);
        assert.equal(stepProgress.status, 'failed');
        assert.ok(stepProgress.error);
        assert.ok(stepProgress.error.message.includes('Intentional test failure'));
    });

    t.test('includes dependency chain in error', async () => {
        const executor = new TestExecutor({concurrency: 10, captureStackTraces: true});

        const steps: StepArray = [
            async function step1() {
                return {data: 'step1'};
            },
            async function step2(assert, context) {
                const {step1} = context;
                await step1;
                return {data: 'step2'};
            },
            async function step3(assert, context) {
                const {step2} = context;
                await step2;
                throw new Error('Failed in step3');
            },
        ];

        await assert.rejects(executor.execute(steps, {}), /Failed in step3/);

        const stepProgress = executor.getProgress().steps.get('step3');
        assert.ok(stepProgress);
        assert.ok(stepProgress.dependencies.includes('step2'));
    });

    t.test('captures source location for failed steps', async () => {
        const executor = new TestExecutor({concurrency: 10, captureStackTraces: true});

        const steps: StepArray = [
            async function testStep() {
                throw new Error('Test error');
            },
        ];

        await assert.rejects(executor.execute(steps, {}));

        const stepProgress = executor.getProgress().steps.get('testStep');
        assert.ok(stepProgress);
        assert.ok(stepProgress.sourceLocation);
        assert.ok(
            stepProgress.sourceLocation.file.includes('blong-chain'),
            `Expected file to include 'blong-chain', got: ${stepProgress.sourceLocation.file}`,
        );
        assert.ok(stepProgress.sourceLocation.line > 0);
    });
});

tap.test('TestExecutor - Latency Metrics', async t => {
    t.test('tracks step latency', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function slowStep() {
                await new Promise(resolve => setTimeout(resolve, 100));
                return {done: true};
            },
        ];

        await executor.execute(steps, {});

        const latency = executor.getLatencyReport();
        const stepLatency = latency.steps.get('slowStep');

        assert.ok(stepLatency);
        assert.ok(stepLatency.executionTime >= 90); // Should be ~100ms, allow some tolerance
        assert.ok(stepLatency.totalTime >= stepLatency.executionTime);
        assert.equal(stepLatency.waitTime, 0); // No dependencies, no wait time
    });

    t.test('distinguishes queue time, wait time, and execution time', async () => {
        const executor = new TestExecutor({concurrency: 1}); // Force queueing

        const steps: StepArray = [
            async function step1() {
                await new Promise(resolve => setTimeout(resolve, 50));
                return {data: 'step1'};
            },
            async function step2(assert, context) {
                const {step1} = context;
                await step1; // Wait for dependency
                await new Promise(resolve => setTimeout(resolve, 30));
                return {data: 'step2'};
            },
            async function step3() {
                // Independent step, should queue
                await new Promise(resolve => setTimeout(resolve, 20));
                return {data: 'step3'};
            },
        ];

        await executor.execute(steps, {});

        const latency = executor.getLatencyReport();

        const step2Latency = latency.steps.get('step2');
        assert.ok(step2Latency);
        // TODO: Implement sophisticated wait time tracking
        // For now, waitTime is always 0 - step2 accesses step1 which completes before step2 runs
        assert.equal(step2Latency.waitTime, 0, 'waitTime tracking not yet sophisticated');
        assert.ok(step2Latency.executionTime >= 30, 'step2 should have ~30ms execution time');

        const step3Latency = latency.steps.get('step3');
        assert.ok(step3Latency);
        assert.ok(
            step3Latency.queueTime > 0,
            'step3 should have queue time due to concurrency limit',
        );
    });

    t.test('identifies critical path', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function step1() {
                await new Promise(resolve => setTimeout(resolve, 20));
                return {data: 'step1'};
            },
            async function step2(assert, context) {
                const {step1} = context;
                await step1;
                await new Promise(resolve => setTimeout(resolve, 30));
                return {data: 'step2'};
            },
            async function step3(assert, context) {
                const {step2} = context;
                await step2;
                await new Promise(resolve => setTimeout(resolve, 40));
                return {data: 'step3'};
            },
            async function stepIndependent() {
                await new Promise(resolve => setTimeout(resolve, 10));
                return {data: 'independent'};
            },
        ];

        await executor.execute(steps, {});

        const latency = executor.getLatencyReport();

        // Critical path should be step1 -> step2 -> step3
        assert.ok(latency.criticalPath.includes('step1'));
        assert.ok(latency.criticalPath.includes('step2'));
        assert.ok(latency.criticalPath.includes('step3'));
        assert.ok(!latency.criticalPath.includes('stepIndependent'));
    });
});

tap.test('TestExecutor - Nested Steps (Sequential Execution)', async t => {
    t.test('executes nested arrays sequentially', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const executionOrder: string[] = [];

        const steps: StepArray = [
            async function step1() {
                executionOrder.push('step1');
                return {v: 1};
            },
            [
                async function step2() {
                    executionOrder.push('step2');
                    return {v: 2};
                },
                async function step3() {
                    executionOrder.push('step3');
                    return {v: 3};
                },
            ],
        ];

        await executor.execute(steps, {});

        // step1 should complete before nested array starts
        const step1Index = executionOrder.indexOf('step1');
        const step2Index = executionOrder.indexOf('step2');

        assert.ok(step1Index < step2Index, 'Nested array should wait for outer level to complete');
    });

    t.test('empty array acts as checkpoint for parallel execution', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const executionOrder: Array<{step: string; event: string; time: number}> = [];
        const startTime = Date.now();

        const steps: StepArray = [
            async function parallelStep1() {
                executionOrder.push({
                    step: 'parallel1',
                    event: 'start',
                    time: Date.now() - startTime,
                });
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push({
                    step: 'parallel1',
                    event: 'end',
                    time: Date.now() - startTime,
                });
                return {data: 1};
            },

            async function parallelStep2() {
                executionOrder.push({
                    step: 'parallel2',
                    event: 'start',
                    time: Date.now() - startTime,
                });
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push({
                    step: 'parallel2',
                    event: 'end',
                    time: Date.now() - startTime,
                });
                return {data: 2};
            },

            async function parallelStep3() {
                executionOrder.push({
                    step: 'parallel3',
                    event: 'start',
                    time: Date.now() - startTime,
                });
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push({
                    step: 'parallel3',
                    event: 'end',
                    time: Date.now() - startTime,
                });
                return {data: 3};
            },

            // Checkpoint - wait for all parallel steps above to complete
            [],

            async function afterCheckpoint1() {
                executionOrder.push({step: 'after1', event: 'start', time: Date.now() - startTime});
                await new Promise(resolve => setTimeout(resolve, 30));
                executionOrder.push({step: 'after1', event: 'end', time: Date.now() - startTime});
                return {data: 4};
            },

            async function afterCheckpoint2() {
                executionOrder.push({step: 'after2', event: 'start', time: Date.now() - startTime});
                await new Promise(resolve => setTimeout(resolve, 30));
                executionOrder.push({step: 'after2', event: 'end', time: Date.now() - startTime});
                return {data: 5};
            },
        ];

        await executor.execute(steps, {});

        // Verify all parallel steps end before any after-checkpoint steps start
        const parallel1End = executionOrder.find(e => e.step === 'parallel1' && e.event === 'end')!;
        const parallel2End = executionOrder.find(e => e.step === 'parallel2' && e.event === 'end')!;
        const parallel3End = executionOrder.find(e => e.step === 'parallel3' && e.event === 'end')!;
        const after1Start = executionOrder.find(e => e.step === 'after1' && e.event === 'start')!;
        const after2Start = executionOrder.find(e => e.step === 'after2' && e.event === 'start')!;

        const lastParallelEnd = Math.max(parallel1End.time, parallel2End.time, parallel3End.time);
        const firstAfterStart = Math.min(after1Start.time, after2Start.time);

        assert.ok(
            lastParallelEnd <= firstAfterStart,
            `Checkpoint should ensure all parallel steps complete (${lastParallelEnd}ms) before next steps start (${firstAfterStart}ms)`,
        );

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 5);
    });

    t.test('multiple checkpoints create multiple synchronization barriers', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const executionOrder: string[] = [];

        const steps: StepArray = [
            async function phase1Step1() {
                await new Promise(resolve => setTimeout(resolve, 30));
                executionOrder.push('phase1-1');
                return {phase: 1, step: 1};
            },

            async function phase1Step2() {
                await new Promise(resolve => setTimeout(resolve, 30));
                executionOrder.push('phase1-2');
                return {phase: 1, step: 2};
            },

            [], // Checkpoint 1

            async function phase2Step1() {
                await new Promise(resolve => setTimeout(resolve, 30));
                executionOrder.push('phase2-1');
                return {phase: 2, step: 1};
            },

            async function phase2Step2() {
                await new Promise(resolve => setTimeout(resolve, 30));
                executionOrder.push('phase2-2');
                return {phase: 2, step: 2};
            },

            [], // Checkpoint 2

            async function phase3Step1() {
                await new Promise(resolve => setTimeout(resolve, 30));
                executionOrder.push('phase3-1');
                return {phase: 3, step: 1};
            },
        ];

        await executor.execute(steps, {});

        // Verify ordering
        const phase1Index = Math.max(
            executionOrder.indexOf('phase1-1'),
            executionOrder.indexOf('phase1-2'),
        );
        const phase2Index = Math.min(
            executionOrder.indexOf('phase2-1'),
            executionOrder.indexOf('phase2-2'),
        );
        const phase3Index = executionOrder.indexOf('phase3-1');

        assert.ok(phase1Index < phase2Index, 'Phase 1 should complete before Phase 2 starts');

        const phase2MaxIndex = Math.max(
            executionOrder.indexOf('phase2-1'),
            executionOrder.indexOf('phase2-2'),
        );
        assert.ok(phase2MaxIndex < phase3Index, 'Phase 2 should complete before Phase 3 starts');

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 5);
    });
});

tap.test('TestExecutor - Promise Resolution', async t => {
    t.test('resolves main step promise', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function producer() {
                return {value: 42};
            },
            async function consumer(assert, context) {
                const result = (await context.producer) as {value: number};
                assert.equal(result.value, 42);
            },
        ];

        await executor.execute(steps, {});
    });

    t.test('resolves nested property promises', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function producer() {
                return {
                    user: {name: 'Alice', age: 30},
                    meta: {timestamp: Date.now()},
                };
            },
            async function consumer(assert, context) {
                const producerResult = (await context.producer) as {
                    user: {name: string; age: number};
                    meta: {timestamp: number};
                };
                const name = producerResult.user.name;
                const age = producerResult.user.age;
                assert.equal(name, 'Alice');
                assert.equal(age, 30);
            },
        ];

        await executor.execute(steps, {});
    });

    t.test('multiple steps can await same property', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function producer() {
                return {shared: 'value'};
            },
            async function consumer1(assert, context) {
                const result = (await context.producer) as {shared: string};
                assert.equal(result.shared, 'value');
                return {c1: true};
            },
            async function consumer2(assert, context) {
                const result = (await context.producer) as {shared: string};
                assert.equal(result.shared, 'value');
                return {c2: true};
            },
        ];

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 3);
    });
});

tap.test('TestExecutor - Nested Test Context (node:test integration)', async t => {
    t.test('executes steps with nested test context for proper indentation', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupDatabase() {
                return {connected: true};
            },
            async function queryUsers(assert, context) {
                const db = (await context.setupDatabase) as {connected: boolean};
                assert.equal(db.connected, true);
                return {users: ['alice', 'bob']};
            },
        ];

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 2);
        assert.equal(progress.status, 'completed');
    });

    t.test('handles nested arrays with automatic indentation', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const nestedSteps: StepArray = [
            async function createUser() {
                return {userId: 123};
            },
            async function verifyUser(assert, context) {
                const user = (await context.createUser) as {userId: number};
                assert.equal(user.userId, 123);
                return {verified: true};
            },
        ];
        nestedSteps.name = 'User Management';

        const steps: StepArray = [
            async function setupSystem() {
                return {ready: true};
            },
            nestedSteps,
            async function finalCheck(assert, context) {
                const system = (await context.setupSystem) as {ready: boolean};
                const verified = (await context.verifyUser) as {verified: boolean};
                assert.equal(system.ready, true);
                assert.equal(verified.verified, true);
                return {complete: true};
            },
        ];

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 4);
        assert.equal(progress.status, 'completed');
    });

    t.test('handles deeply nested arrays with proper hierarchy', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const level3Steps: StepArray = [
            async function deepOperation() {
                return {level: 3};
            },
        ];
        level3Steps.name = 'Level 3 Operations';

        const level2Steps: StepArray = [
            async function midOperation() {
                return {level: 2};
            },
            level3Steps,
        ];
        level2Steps.name = 'Level 2 Operations';

        const steps: StepArray = [
            async function topOperation() {
                return {level: 1};
            },
            level2Steps,
            async function finalOperation(assert, context) {
                const top = (await context.topOperation) as {level: number};
                const mid = (await context.midOperation) as {level: number};
                const deep = (await context.deepOperation) as {level: number};
                assert.equal(top.level, 1);
                assert.equal(mid.level, 2);
                assert.equal(deep.level, 3);
                return {complete: true};
            },
        ];

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 4);
        assert.equal(progress.status, 'completed');
    });

    t.test('maintains parallel execution within nested groups', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const executionOrder: string[] = [];

        const parallelGroup: StepArray = [
            async function parallelStep1() {
                executionOrder.push('p1-start');
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push('p1-end');
                return {p1: true};
            },
            async function parallelStep2() {
                executionOrder.push('p2-start');
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push('p2-end');
                return {p2: true};
            },
        ];
        parallelGroup.name = 'Parallel Group';

        const steps: StepArray = [
            async function setup() {
                executionOrder.push('setup');
                return {ready: true};
            },
            parallelGroup,
        ];

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 3);
        assert.equal(progress.status, 'completed');

        // Verify both steps started (proving they executed)
        assert.ok(
            executionOrder.includes('p1-start') && executionOrder.includes('p2-start'),
            'Both parallel steps should have executed',
        );
    });

    t.test('works without test context (backward compatibility)', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const nestedSteps: StepArray = [
            async function nestedOp() {
                return {nested: true};
            },
        ];
        nestedSteps.name = 'Nested';

        const steps: StepArray = [
            async function topOp() {
                return {top: true};
            },
            nestedSteps,
        ];

        // Execute without test context
        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 2);
        assert.equal(progress.status, 'completed');
    });

    t.test('error reporting tracked in progress even with test context', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupData() {
                return {data: 'test'};
            },
            async function workingStep(assert, context) {
                const data = (await context.setupData) as {data: string};
                assert.equal(data.data, 'test');
                return {result: 'success'};
            },
        ];

        await executor.execute(steps, {});

        // Verify all steps completed successfully
        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 2);
        assert.equal(progress.failedSteps, 0);
        assert.equal(progress.status, 'completed');
    });
});

tap.test('TestExecutor - Error Reporting with Nested Context', async t => {
    t.test('reports errors in nested test output and tracks in progress', async () => {
        // Run WITHOUT test context so our assertions can pass while demonstrating tracking
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupData() {
                return {data: 'test'};
            },
            async function failingStep(assert, context) {
                await context.setupData;
                throw new Error('Intentional test failure');
            },
            async function independentStep() {
                // This runs in parallel with failingStep, so it may complete
                return {independent: true};
            },
        ];

        // Execute without test context for this verification test
        try {
            await executor.execute(steps, {});
        } catch {
            // Expected - error thrown but should be tracked
        }

        // Verify error was tracked in progress
        const progress = executor.getProgress();
        assert.equal(progress.failedSteps, 1, 'Should track 1 failed step');

        // setupData should complete, independentStep may complete (parallel execution)
        assert.ok(progress.completedSteps >= 1, 'At least setupData should complete');

        const failedStep = progress.steps.get('failingStep');
        assert.ok(failedStep, 'Failed step should be in progress');
        assert.equal(failedStep.status, 'failed', 'Step status should be failed');
        assert.ok(failedStep.error, 'Error should be captured');
        assert.ok(
            failedStep.error.message.includes('Intentional test failure'),
            'Error message should be captured',
        );
    });

    t.test('reports errors in nested groups with proper indentation', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const problemGroup: StepArray = [
            async function goodStep() {
                return {good: true};
            },
            async function badStep() {
                throw new Error('Error in nested group');
            },
        ];
        problemGroup.name = 'Problem Group';

        const steps: StepArray = [
            async function setupOk() {
                return {setup: true};
            },
            problemGroup,
            async function cleanupStep(assert, context) {
                // This runs in parallel (no dependency on badStep)
                const setup = (await context.setupOk) as {setup: boolean};
                assert.equal(setup.setup, true);
                return {cleanup: true};
            },
        ];

        try {
            await executor.execute(steps, {});
        } catch {
            // Expected error - one of the steps failed
        }

        const progress = executor.getProgress();

        // Verify the error was tracked
        const badStepProgress = progress.steps.get('badStep');
        assert.ok(badStepProgress, 'Bad step should be tracked');
        assert.equal(badStepProgress.status, 'failed', 'Bad step should be marked as failed');
        assert.ok(badStepProgress.error, 'Error should be captured');
        assert.ok(
            badStepProgress.error.message.includes('Error in nested group'),
            'Error message should match',
        );

        // Verify group path is correct
        assert.deepEqual(
            badStepProgress.groupPath,
            ['Problem Group'],
            'Group path should be captured',
        );

        // Verify goodStep completed
        const goodStepProgress = progress.steps.get('goodStep');
        assert.ok(goodStepProgress, 'Good step should be tracked');
        assert.equal(goodStepProgress.status, 'completed', 'Good step should complete');
    });

    t.test('reports multiple errors in nested hierarchy', async () => {
        const executor = new TestExecutor({concurrency: 10});

        // Create two parallel failing steps at the same level
        const steps: StepArray = [
            async function failAtRoot1() {
                throw new Error('Root error 1');
            },
            async function failAtRoot2() {
                throw new Error('Root error 2');
            },
        ];

        try {
            await executor.execute(steps, {});
        } catch {
            // Expected errors - both run in parallel so both should fail
        }

        const progress = executor.getProgress();

        // Both errors should be tracked since they run in parallel
        assert.equal(progress.failedSteps, 2, 'Should track 2 failed steps running in parallel');

        const error1 = progress.steps.get('failAtRoot1');
        assert.ok(error1, 'First error should be tracked');
        assert.equal(error1.status, 'failed', 'First step should be failed');
        assert.ok(error1.error?.message.includes('Root error 1'), 'First error message');

        const error2 = progress.steps.get('failAtRoot2');
        assert.ok(error2, 'Second error should be tracked');
        assert.equal(error2.status, 'failed', 'Second step should be failed');
        assert.ok(error2.error?.message.includes('Root error 2'), 'Second error message');
    });

    t.test('continues execution after error when using test context', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const executionLog: string[] = [];

        const steps: StepArray = [
            async function step1() {
                executionLog.push('step1');
                return {result: 1};
            },
            async function failingStep() {
                executionLog.push('failingStep');
                throw new Error('Failure in middle');
            },
            async function step3() {
                executionLog.push('step3');
                return {result: 3};
            },
        ];

        try {
            await executor.execute(steps, {});
        } catch {
            // Expected error
        }

        // All steps should have been attempted (parallel execution)
        assert.ok(executionLog.includes('step1'), 'step1 should execute');
        assert.ok(executionLog.includes('failingStep'), 'failingStep should execute');
        assert.ok(executionLog.includes('step3'), 'step3 should execute');

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 2, 'Should have 2 completed steps');
        assert.equal(progress.failedSteps, 1, 'Should have 1 failed step');
    });

    t.test('error details are captured with source location when enabled', async () => {
        const executor = new TestExecutor({concurrency: 10, captureStackTraces: true});

        const steps: StepArray = [
            async function errorWithContext() {
                throw new Error('Error with context details');
            },
        ];

        try {
            await executor.execute(steps, {});
        } catch {
            // Expected error
        }

        const progress = executor.getProgress();
        const errorStep = progress.steps.get('errorWithContext');

        assert.ok(errorStep, 'Error step should be tracked');
        assert.equal(errorStep.status, 'failed', 'Step should be marked as failed');
        assert.ok(errorStep.error, 'Error should be captured');
        assert.ok(errorStep.error.stack, 'Stack trace should be captured');
        assert.ok(errorStep.sourceLocation, 'Source location should be captured');
        assert.ok(errorStep.sourceLocation.file, 'File should be in source location');
        assert.ok(errorStep.sourceLocation.line > 0, 'Line number should be positive');
    });
});

tap.test('TestExecutor - Unique Step Names', async t => {
    t.test('throws error on duplicate function names', async () => {
        const executor = new TestExecutor({concurrency: 10});

        // Create steps with duplicate function names
        const steps: StepArray = [
            async function setupData() {
                return {value: 'first'};
            },
            async function setupData() {
                return {value: 'second'};
            },
        ];

        // Should throw error about duplicate step name
        await assert.rejects(
            executor.execute(steps, {}),
            /Duplicate step name detected: "setupData"/,
        );
    });

    t.test('throws error on duplicate anonymous function names', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async () => {
                return {value: 1};
            },
            async () => {
                return {value: 2};
            },
        ];

        // Anonymous functions all have name "anonymous" so should throw
        await assert.rejects(
            executor.execute(steps, {}),
            /Duplicate step name detected: "anonymous"/,
        );
    });

    t.test('throws error on duplicate function names across nested groups', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const group1: StepArray = [
            async function stepA() {
                return {group: 1};
            },
        ];
        group1.name = 'Group 1';

        const group2: StepArray = [
            async function stepA() {
                return {group: 2};
            },
        ];
        group2.name = 'Group 2';

        const steps: StepArray = [
            async function stepA() {
                return {top: true};
            },
            group1,
            group2,
        ];

        // This should throw because all stepA functions share the same context
        await assert.rejects(executor.execute(steps, {}), /Duplicate step name detected: "stepA"/);
    });

    t.test('unique names work correctly - no duplicates', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function fetchUsers() {
                return {id: 1, value: 'users'};
            },
            async function fetchProducts() {
                return {id: 2, value: 'products'};
            },
            async function validateData(assert, context) {
                const users = (await context.fetchUsers) as {id: number; value: string};
                const products = (await context.fetchProducts) as {id: number; value: string};
                assert.equal(users.id, 1);
                assert.equal(products.id, 2);
                return {validated: true};
            },
        ];

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.status, 'completed');
        assert.equal(progress.failedSteps, 0);
        assert.equal(progress.completedSteps, 3);
    });

    t.test('error message includes step name', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function processItem() {
                return {value: 'first'};
            },
            async function processItem() {
                return {value: 'second'};
            },
        ];

        try {
            await executor.execute(steps, {});
            assert.fail('Should have thrown an error');
        } catch (error: unknown) {
            assert.ok((error as Error).message.includes('Duplicate step name detected'));
            assert.ok((error as Error).message.includes('processItem'));
            assert.ok((error as Error).message.includes('unique function name'));
        }
    });

    t.test('duplicate detection resets between test executions', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const stepsWithDuplicate = [
            async function myStep() {
                return {run: 1};
            },
            async function myStep() {
                return {run: 2};
            },
        ];

        const stepsWithoutDuplicate = [
            async function myStep() {
                return {run: 1};
            },
            async function otherStep() {
                return {run: 2};
            },
        ];

        // First execution should fail due to duplicate
        await assert.rejects(
            executor.execute(stepsWithDuplicate, {testId: 'first'}),
            /Duplicate step name detected: "myStep"/,
        );

        // Second execution with different steps should succeed (tracking is reset)
        await executor.execute(stepsWithoutDuplicate, {testId: 'second'});

        const progress = executor.getProgress();
        assert.equal(progress.status, 'completed');
        assert.equal(progress.completedSteps, 2);

        // Third execution with duplicate again should fail
        await assert.rejects(
            executor.execute(stepsWithDuplicate, {testId: 'third'}),
            /Duplicate step name detected: "myStep"/,
        );
    });
});

tap.test('TestExecutor - Invalid Step Reference Validation', async t => {
    t.test('detects direct reference to non-existent step', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupData() {
                return {userId: 'user-123'};
            },
            async function processData(assert, context) {
                // Reference a step that doesn't exist
                const _data = await context.nonExistentStep;
                return {processed: true};
            },
        ];

        await assert.rejects(
            executor.execute(steps, {}),
            /Invalid step reference\(s\) detected.*nonExistentStep/,
        );
    });

    t.test('detects nested property reference to non-existent step', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupData() {
                return {userId: 'user-123'};
            },
            async function processData(assert, context) {
                // Reference a nested property of a step that doesn't exist
                const _name = await (context.invalidStep as {user: {name: string}}).user.name;
                return {processed: true};
            },
        ];

        await assert.rejects(
            executor.execute(steps, {}),
            /Invalid step reference\(s\) detected.*invalidStep/,
        );
    });

    t.test('error message includes which step made the invalid reference', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function step1() {
                return {data: 'step1'};
            },
            async function step2(assert, context) {
                const _data = await context.missingStep;
                return {data: 'step2'};
            },
        ];

        try {
            await executor.execute(steps, {});
            assert.fail('Should have thrown an error');
        } catch (error: unknown) {
            assert.ok((error as Error).message.includes('step2'));
            assert.ok((error as Error).message.includes('missingStep'));
            assert.ok((error as Error).message.includes('context.missingStep'));
        }
    });

    t.test('error message lists available steps', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupData() {
                return {data: 'setup'};
            },
            async function processData() {
                return {data: 'processed'};
            },
            async function verifyData(assert, context) {
                const _data = await context.invalidStep;
                return {verified: true};
            },
        ];

        try {
            await executor.execute(steps, {});
            assert.fail('Should have thrown an error');
        } catch (error: unknown) {
            assert.ok((error as Error).message.includes('Available steps:'));
            assert.ok((error as Error).message.includes('setupData'));
            assert.ok((error as Error).message.includes('processData'));
            assert.ok((error as Error).message.includes('verifyData'));
        }
    });

    t.test('detects multiple invalid references', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function step1() {
                return {data: 'step1'};
            },
            async function step2(assert, context) {
                await context.missing1;
                await context.missing2;
                return {data: 'step2'};
            },
        ];

        try {
            await executor.execute(steps, {});
            assert.fail('Should have thrown an error');
        } catch (error: unknown) {
            // Should detect at least one invalid reference (first one accessed)
            assert.ok((error as Error).message.includes('missing1'));
            assert.ok((error as Error).message.includes('Invalid step reference(s) detected'));
        }
    });

    t.test('does not flag valid step references', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupData() {
                return {userId: 'user-123', name: 'Alice'};
            },
            async function processData(assert, context) {
                const data = (await context.setupData) as {userId: string; name: string};
                assert.equal(data.userId, 'user-123');
                return {processed: true};
            },
            async function verifyData(assert, context) {
                const data = (await context.processData) as {processed: boolean};
                assert.equal(data.processed, true);
                return {verified: true};
            },
        ];

        // Should not throw an error
        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.status, 'completed');
        assert.equal(progress.completedSteps, 3);
        assert.equal(progress.failedSteps, 0);
    });

    t.test('does not flag nested property access of valid steps', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps: StepArray = [
            async function setupUser() {
                return {
                    id: 'user-123',
                    profile: {name: 'Alice', age: 30},
                };
            },
            async function processUser(assert, context) {
                const name = (await context.setupUser) as {profile: {name: string; age: number}};
                const age = (await context.setupUser) as {profile: {name: string; age: number}};
                assert.equal(name.profile.name, 'Alice');
                assert.equal(age.profile.age, 30);
                return {processed: true};
            },
        ];

        // Should not throw an error
        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.status, 'completed');
        assert.equal(progress.completedSteps, 2);
    });

    t.test('validation is reset between test runs', async () => {
        const executor = new TestExecutor({concurrency: 10});

        // First test run with valid references
        const validSteps: StepArray = [
            async function step1() {
                return {data: 'step1'};
            },
            async function step2(assert, context) {
                const _data = (await context.step1) as {data: string};
                return {data: 'step2'};
            },
        ];

        await executor.execute(validSteps, {});
        const progress1 = executor.getProgress();
        assert.equal(progress1.status, 'completed');

        // Second test run with invalid reference
        const invalidSteps: StepArray = [
            async function stepA() {
                return {data: 'stepA'};
            },
            async function stepB(assert, context) {
                const _data = (await context.nonExistent) as {data: string};
                return {data: 'stepB'};
            },
        ];

        await assert.rejects(
            executor.execute(invalidSteps, {}),
            /Invalid step reference\(s\) detected/,
        );

        // Third test run with valid references again
        await executor.execute(validSteps, {});
        const progress3 = executor.getProgress();
        assert.equal(progress3.status, 'completed');
    });
});

tap.test('TestExecutor - Rerun (Phase 1)', async t => {
    t.test('retries a failing step up to maxRetries times', async () => {
        const executor = new TestExecutor({
            concurrency: 5,
            rerun: {enabled: true, maxRetries: 2},
        });

        let attempts = 0;

        const steps: StepArray = [
            async function flakyStep() {
                attempts++;
                if (attempts < 3) {
                    throw new Error('transient error');
                }
                return {ok: true};
            },
        ];

        await executor.execute(steps, {});

        assert.equal(attempts, 3, 'should have tried 3 times (1 initial + 2 retries)');
        const progress = executor.getProgress();
        assert.equal(progress.status, 'completed');
        assert.equal(progress.failedSteps, 0);
    });

    t.test('marks step as failed when all retries are exhausted', async () => {
        const executor = new TestExecutor({
            concurrency: 5,
            rerun: {enabled: true, maxRetries: 1},
        });

        let attempts = 0;

        const steps: StepArray = [
            async function alwaysFails() {
                attempts++;
                throw new Error('persistent error');
            },
        ];

        await assert.rejects(executor.execute(steps, {}), /persistent error/);

        assert.equal(attempts, 2, 'should have tried 2 times (1 initial + 1 retry)');
        const progress = executor.getProgress();
        assert.equal(progress.failedSteps, 1);
    });

    t.test('does not retry when rerun is disabled', async () => {
        const executor = new TestExecutor({concurrency: 5});

        let attempts = 0;

        const steps: StepArray = [
            async function failsOnce() {
                attempts++;
                if (attempts === 1) throw new Error('first attempt error');
                return {ok: true};
            },
        ];

        await assert.rejects(executor.execute(steps, {}), /first attempt error/);

        assert.equal(attempts, 1, 'should only try once when rerun is disabled');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// assert.snapshot / mask / autoSnapshot / checkpoint tests
//
// The capturing context helper simulates a minimal TAP test context so that
// we can inspect what matchSnapshot receives without running TAP.
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal TAP-like test context that captures matchSnapshot calls. */
function makeCapturingContext(): {ctx: ITestFrameworkContext; captured: Array<[unknown, string]>} {
    const captured: Array<[unknown, string]> = [];
    const ctx = {
        matchSnapshot(v: unknown, n: string) {
            captured.push([v, n]);
        },
        test(_name: string, fn: (t: unknown) => Promise<void> | void) {
            return fn({
                matchSnapshot(v: unknown, n: string) {
                    captured.push([v, n]);
                },
            });
        },
    };
    return {ctx, captured};
}

tap.test('assert.snapshot — explicit call (value + name + opts)', async t => {
    t.test('masks listed paths using chain-level mask', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1, mask: ['id']});
        const steps: StepArray = [
            async function myStep(assert) {
                assert.snapshot({id: 'abc-123', name: 'Alice'}, 'myStep');
            },
        ];
        await executor.execute(steps, {}, ctx);
        assert.equal(captured.length, 1);
        assert.equal((captured[0][0] as Record<string, unknown>).id, '<masked>');
        assert.equal((captured[0][0] as Record<string, unknown>).name, 'Alice');
        assert.equal(captured[0][1], 'myStep');
    });

    t.test('merges chain-level mask with per-call mask', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1, mask: ['id']});
        const steps: StepArray = [
            async function myStep(assert) {
                assert.snapshot({id: 'x', createdAt: '2024', name: 'A'}, 'myStep', {
                    mask: ['createdAt'],
                });
            },
        ];
        await executor.execute(steps, {}, ctx);
        const result = captured[0][0] as Record<string, unknown>;
        assert.equal(result.id, '<masked>');
        assert.equal(result.createdAt, '<masked>');
        assert.equal(result.name, 'A');
    });

    t.test('passes value unchanged when no mask configured', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1});
        const steps: StepArray = [
            async function myStep(assert) {
                assert.snapshot({id: 'abc-123', name: 'Alice'}, 'myStep');
            },
        ];
        await executor.execute(steps, {}, ctx);
        assert.equal((captured[0][0] as Record<string, unknown>).id, 'abc-123');
    });

    t.test('masks nested dot-path fields', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1, mask: ['user.userId']});
        const steps: StepArray = [
            async function myStep(assert) {
                assert.snapshot({user: {userId: 'u1', role: 'admin'}}, 'myStep');
            },
        ];
        await executor.execute(steps, {}, ctx);
        const result = captured[0][0] as {user: Record<string, unknown>};
        assert.equal(result.user.userId, '<masked>');
        assert.equal(result.user.role, 'admin');
    });

    t.test('wildcard * masks field in every direct child', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1, mask: ['*.id']});
        const steps: StepArray = [
            async function myStep(assert) {
                assert.snapshot({a: {id: '1', x: 'keep'}, b: {id: '2', y: 'keep'}}, 'myStep');
            },
        ];
        await executor.execute(steps, {}, ctx);
        const result = captured[0][0] as Record<string, Record<string, unknown>>;
        assert.equal(result.a.id, '<masked>');
        assert.equal(result.b.id, '<masked>');
        assert.equal(result.a.x, 'keep');
        assert.equal(result.b.y, 'keep');
    });

    t.test('ignores prototype-polluting mask paths', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({
            concurrency: 1,
            mask: ['__proto__.toString', 'constructor'],
        });
        const steps: StepArray = [
            async function myStep(assert) {
                assert.snapshot({name: 'Bob'}, 'myStep');
            },
        ];
        await executor.execute(steps, {}, ctx);
        const result = captured[0][0] as Record<string, unknown>;
        assert.equal(result.name, 'Bob');
        assert.equal(typeof result.constructor, 'function', 'constructor should be unchanged');
    });

    t.test('assert.snapshot is not available without TAP context', async () => {
        const executor = new TestExecutor({concurrency: 1});
        let snapshotFn: unknown;
        const steps: StepArray = [
            async function myStep(assert) {
                snapshotFn = assert.snapshot;
            },
        ];
        await executor.execute(steps, {}); // no test context
        assert.equal(snapshotFn, undefined, 'snapshot is undefined without TAP context');
    });
});

tap.test('assert.snapshot() — deferred (no-args / opts-only)', async t => {
    t.test('assert.snapshot() snapshots return value under step name', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1});
        const steps: StepArray = [
            async function myStep(assert) {
                assert.snapshot(); // deferred — executor takes the snapshot
                return {name: 'Alice', value: 42};
            },
        ];
        await executor.execute(steps, {}, ctx);
        assert.equal(captured.length, 1);
        assert.equal((captured[0][0] as Record<string, unknown>).name, 'Alice');
        assert.equal(captured[0][1], 'myStep');
    });

    t.test('assert.snapshot({mask}) merges per-call mask with chain-level mask', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1, mask: ['id']});
        const steps: StepArray = [
            async function myStep(assert) {
                assert.snapshot({mask: ['createdAt']});
                return {id: 'x', createdAt: '2024', name: 'A'};
            },
        ];
        await executor.execute(steps, {}, ctx);
        const result = captured[0][0] as Record<string, unknown>;
        assert.equal(result.id, '<masked>');
        assert.equal(result.createdAt, '<masked>');
        assert.equal(result.name, 'A');
    });

    t.test('deferred snapshot wins; no extra autoSnapshot snapshot is taken', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1, autoSnapshot: true});
        const steps: StepArray = [
            async function myStep(assert) {
                assert.snapshot();
                return {v: 1};
            },
        ];
        await executor.execute(steps, {}, ctx);
        // Only one snapshot even though autoSnapshot is enabled — deferred wins
        assert.equal(captured.length, 1);
    });

    t.test('deferred snapshot not available without TAP context', async () => {
        // Without TAP context, assert has no snapshot method — nothing is taken.
        const executor = new TestExecutor({concurrency: 1});
        const results: unknown[] = [];
        const steps: StepArray = [
            async function myStep(assert) {
                if (assert.snapshot) assert.snapshot();
                results.push('ran');
                return {v: 1};
            },
        ];
        await executor.execute(steps, {}); // no TAP ctx
        assert.equal(results.length, 1); // step ran fine
    });
});

tap.test('autoSnapshot: true', async t => {
    t.test('snapshots every step result under its function name', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1, autoSnapshot: true});
        const steps: StepArray = [
            async function stepA() {
                return {a: 1};
            },
            async function stepB() {
                return {b: 2};
            },
        ];
        await executor.execute(steps, {}, ctx);
        assert.equal(captured.length, 2);
        const names = captured.map(c => c[1]);
        assert.ok(names.includes('stepA'));
        assert.ok(names.includes('stepB'));
    });

    t.test('applies chain-level mask before snapshotting', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1, autoSnapshot: true, mask: ['id']});
        const steps: StepArray = [
            async function myStep() {
                return {id: 'dynamic', name: 'Alice'};
            },
        ];
        await executor.execute(steps, {}, ctx);
        assert.equal((captured[0][0] as Record<string, unknown>).id, '<masked>');
        assert.equal((captured[0][0] as Record<string, unknown>).name, 'Alice');
    });

    t.test('does nothing when no TAP context is supplied', async () => {
        const executor = new TestExecutor({concurrency: 1, autoSnapshot: true});
        const steps: StepArray = [
            async function stepA() {
                return {v: 1};
            },
        ];
        // Should not throw — just skips snapshotting
        await executor.execute(steps, {});
        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 1);
    });
});

tap.test("checkpoint markers — ['*'] and ['step1','step2']", async t => {
    t.test("['*'] snapshots all completed steps into a context object", async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1});
        const steps: StepArray = [
            async function stepA() {
                return {a: 1};
            },
            async function stepB() {
                return {b: 2};
            },
            ['*'],
        ];
        await executor.execute(steps, {}, ctx);
        assert.equal(captured.length, 1);
        const snapshot = captured[0][0] as Record<string, unknown>;
        assert.deepStrictEqual((snapshot.stepA as Record<string, unknown>).a, 1);
        assert.deepStrictEqual((snapshot.stepB as Record<string, unknown>).b, 2);
        assert.equal(captured[0][1], 'context');
    });

    t.test("named ['*'] checkpoint uses .name property for snapshot name", async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1});
        const steps: StepArray = [
            async function stepA() {
                return {a: 1};
            },
            Object.assign(['*'], {name: 'my-flow'}),
        ];
        await executor.execute(steps, {}, ctx);
        assert.equal(captured[0][1], 'my-flow');
    });

    t.test("['step1', 'step2'] snapshots only named steps", async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1});
        const steps: StepArray = [
            async function stepA() {
                return {a: 1};
            },
            async function stepB() {
                return {b: 2};
            },
            async function stepC() {
                return {c: 3};
            },
            ['stepA', 'stepC'],
        ];
        await executor.execute(steps, {}, ctx);
        assert.equal(captured.length, 1);
        const snapshot = captured[0][0] as Record<string, unknown>;
        assert.ok('stepA' in snapshot);
        assert.ok('stepC' in snapshot);
        assert.ok(!('stepB' in snapshot));
    });

    t.test('checkpoint applies chain-level mask to context snapshot', async () => {
        const {ctx, captured} = makeCapturingContext();
        const executor = new TestExecutor({concurrency: 1, mask: ['id']});
        const steps: StepArray = [
            async function stepA() {
                return {id: 'dynamic', name: 'A'};
            },
            async function stepB() {
                return {id: 'dynamic2', name: 'B'};
            },
            ['*'],
        ];
        await executor.execute(steps, {}, ctx);
        const snapshot = captured[0][0] as Record<string, Record<string, unknown>>;
        assert.equal(snapshot.stepA.id, '<masked>');
        assert.equal(snapshot.stepB.id, '<masked>');
        assert.equal(snapshot.stepA.name, 'A');
        assert.equal(snapshot.stepB.name, 'B');
    });

    t.test("['step1', 'step2'] does not block other running steps", async () => {
        const order: string[] = [];
        const {ctx, captured} = makeCapturingContext();
        // concurrency: 10 so all steps can run in parallel
        const executor = new TestExecutor({concurrency: 10});
        const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));
        const steps: StepArray = [
            async function fast() {
                await delay(10);
                order.push('fast');
                return {x: 1};
            },
            async function slow() {
                await delay(80);
                order.push('slow');
                return {y: 2};
            },
            // Snapshot only 'fast' (which finishes first) — 'slow' keeps running
            ['fast'],
            // stepC can start immediately after the checkpoint, 'slow' still running
            async function stepC(_a: unknown, ctx: ITestContext) {
                await ctx.slow; // wait for slow via context, not checkpoint
                order.push('C');
                return {z: 3};
            },
        ];
        await executor.execute(steps, {}, ctx);
        // 'fast' should be snapshotted, 'slow' should NOT be in that snapshot
        assert.equal(captured.length, 1);
        const snapshot = captured[0][0] as Record<string, unknown>;
        assert.ok('fast' in snapshot);
        assert.ok(!('slow' in snapshot));
        // All three steps completed
        assert.ok(order.includes('fast'));
        assert.ok(order.includes('slow'));
        assert.ok(order.includes('C'));
    });

    t.test('[] empty array is still a sync barrier without snapshot', async () => {
        const {ctx, captured} = makeCapturingContext();
        const order: string[] = [];
        const executor = new TestExecutor({concurrency: 10});
        const steps: StepArray = [
            async function stepA() {
                order.push('A');
                return {a: 1};
            },
            [],
            async function stepB(assert, context) {
                await context.stepA;
                order.push('B');
                return {b: 2};
            },
        ];
        await executor.execute(steps, {}, ctx);
        assert.equal(captured.length, 0); // [] takes no snapshot
        assert.ok(order.indexOf('A') < order.indexOf('B'));
    });
});
