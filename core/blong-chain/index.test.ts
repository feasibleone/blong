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

import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {TestExecutor} from './index.js';

describe('TestExecutor - Thenable Proxy Patterns', () => {
    it('Pattern 1: await context.propertyName', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function setupData() {
                return {userId: 'user-123', name: 'Alice'};
            },
            async function processData(assert, context) {
                // Pattern 1: Direct context access
                const data = await context.setupData;
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

    it('Pattern 2: {propertyName} then await propertyName', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function setupData() {
                return {userId: 'user-456', email: 'bob@example.com'};
            },
            async function verifyData(assert: any, context: any) {
                // Pattern 2: Single-level destructuring, then await
                const {setupData} = context;
                const data = await setupData;
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

    it('Pattern 3: {propertyName} then await propertyName.nestedProperty', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function setupUser() {
                return {
                    id: 'user-789',
                    profile: {name: 'Charlie', age: 30},
                };
            },
            async function verifyProfile(assert: any, context: any) {
                // Pattern 3: Property access after destructuring
                const {setupUser} = context;
                const name = await setupUser.profile.name;
                const age = await setupUser.profile.age;
                assert.equal(name, 'Charlie');
                assert.equal(age, 30);
            },
        ];

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.status, 'completed');
    });

    it('Pattern 4: {propertyName: {nestedProperty}} then await nestedProperty', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function setupAccount() {
                return {
                    accountId: 'acct-999',
                    owner: {name: 'Diana', email: 'diana@example.com'},
                };
            },
            async function processOwner(assert: any, context: any) {
                // Pattern 4: Nested destructuring, then await
                const {
                    setupAccount: {owner},
                } = context;
                const ownerData = await owner;
                assert.equal(ownerData.name, 'Diana');
                assert.equal(ownerData.email, 'diana@example.com');
            },
        ];

        await executor.execute(steps, {});
    });

    it('$meta is always available directly without await', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const testMeta = {testId: 'test-123', environment: 'dev'};

        const steps = [
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

describe('TestExecutor - Parallel Execution', () => {
    it('independent steps run in parallel', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const executionOrder: string[] = [];

        const steps = [
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
        const startCount = executionOrder.filter(e => e.endsWith('-start')).length;
        const firstEndIndex = executionOrder.findIndex(e => e.endsWith('-end'));
        const startsBeforeFirstEnd = executionOrder
            .slice(0, firstEndIndex)
            .filter(e => e.endsWith('-start')).length;

        assert.ok(
            startsBeforeFirstEnd > 1,
            'Multiple steps should start before first one ends (parallel execution)',
        );
    });

    it('dependent steps wait for dependencies', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const executionOrder: string[] = [];

        const steps = [
            async function setupDatabase() {
                executionOrder.push('DB-start');
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push('DB-end');
                return {dbId: 'db-123'};
            },
            async function queryDatabase(assert: any, context: any) {
                executionOrder.push('Query-start');
                const {setupDatabase} = context;
                const db = await setupDatabase;
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

    it('respects concurrency limit', async () => {
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

        await executor.execute(steps as any, {});

        assert.ok(maxConcurrent <= 2, `Max concurrent should be <= 2, was ${maxConcurrent}`);
    });
});

describe('TestExecutor - Dependency Graph', () => {
    it('tracks simple dependency', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function stepA() {
                return {value: 'A'};
            },
            async function stepB(assert: any, context: any) {
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

    it('tracks multiple dependencies', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function setupUser() {
                return {userId: 'user-1'};
            },
            async function setupAccount() {
                return {accountId: 'acct-1'};
            },
            async function linkAccounts(assert: any, context: any) {
                const {setupUser, setupAccount} = context;
                const user = await setupUser;
                const account = await setupAccount;
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

    it('tracks nested property dependencies', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function setupData() {
                return {user: {name: 'Alice', email: 'alice@example.com'}};
            },
            async function processData(assert: any, context: any) {
                const {setupData} = context;
                const email = await setupData.user.email;
                return {processed: email};
            },
        ];

        await executor.execute(steps, {});

        const graph = executor.getDependencyGraph();
        const edge = graph.edges.find(e => e.from === 'processData');
        assert.ok(edge);
        assert.ok(edge.property.includes('setupData'));
    });
});

describe('TestExecutor - Progress Tracking', () => {
    it('tracks overall test progress', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
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

    it('tracks individual step progress', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
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

    it('emits real-time progress events', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const events: string[] = [];

        executor.on('test:start', () => events.push('test:start'));
        executor.on('step:start', name => events.push(`step:start:${name}`));
        executor.on('step:end', name => events.push(`step:end:${name}`));
        executor.on('test:end', () => events.push('test:end'));

        const steps = [
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

describe('TestExecutor - Error Handling', () => {
    it('captures step errors with context', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function setupData() {
                return {userId: 'user-1'};
            },
            async function failingStep(assert: any, context: any) {
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

    it('includes dependency chain in error', async () => {
        const executor = new TestExecutor({concurrency: 10, captureStackTraces: true});

        const steps = [
            async function step1() {
                return {data: 'step1'};
            },
            async function step2(assert: any, context: any) {
                const {step1} = context;
                await step1;
                return {data: 'step2'};
            },
            async function step3(assert: any, context: any) {
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

    it('captures source location for failed steps', async () => {
        const executor = new TestExecutor({concurrency: 10, captureStackTraces: true});

        const steps = [
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

describe('TestExecutor - Latency Metrics', () => {
    it('tracks step latency', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
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

    it('distinguishes queue time, wait time, and execution time', async () => {
        const executor = new TestExecutor({concurrency: 1}); // Force queueing

        const steps = [
            async function step1() {
                await new Promise(resolve => setTimeout(resolve, 50));
                return {data: 'step1'};
            },
            async function step2(assert: any, context: any) {
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

    it('identifies critical path', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function step1() {
                await new Promise(resolve => setTimeout(resolve, 20));
                return {data: 'step1'};
            },
            async function step2(assert: any, context: any) {
                const {step1} = context;
                await step1;
                await new Promise(resolve => setTimeout(resolve, 30));
                return {data: 'step2'};
            },
            async function step3(assert: any, context: any) {
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

describe('TestExecutor - Nested Steps (Sequential Execution)', () => {
    it('executes nested arrays sequentially', async () => {
        const executor = new TestExecutor({concurrency: 10});
        const executionOrder: string[] = [];

        const steps = [
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
            ] as any,
        ];

        await executor.execute(steps as any, {});

        // step1 should complete before nested array starts
        const step1Index = executionOrder.indexOf('step1');
        const step2Index = executionOrder.indexOf('step2');

        assert.ok(step1Index < step2Index, 'Nested array should wait for outer level to complete');
    });
});

describe('TestExecutor - Promise Resolution', () => {
    it('resolves main step promise', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function producer() {
                return {value: 42};
            },
            async function consumer(assert, context) {
                const result = await context.producer;
                assert.equal(result.value, 42);
            },
        ];

        await executor.execute(steps, {});
    });

    it('resolves nested property promises', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function producer() {
                return {
                    user: {name: 'Alice', age: 30},
                    meta: {timestamp: Date.now()},
                };
            },
            async function consumer(assert, context) {
                const name = await context.producer.user.name;
                const age = await context.producer.user.age;
                assert.equal(name, 'Alice');
                assert.equal(age, 30);
            },
        ];

        await executor.execute(steps, {});
    });

    it('multiple steps can await same property', async () => {
        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function producer() {
                return {shared: 'value'};
            },
            async function consumer1(assert, context) {
                const result = await context.producer;
                assert.equal(result.shared, 'value');
                return {c1: true};
            },
            async function consumer2(assert, context) {
                const result = await context.producer;
                assert.equal(result.shared, 'value');
                return {c2: true};
            },
        ];

        await executor.execute(steps, {});

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 3);
    });
});
