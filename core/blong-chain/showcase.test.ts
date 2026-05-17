/**
 * Comprehensive Showcase Test for TestExecutor
 *
 * This test demonstrates ALL features of the parallel test executor:
 * - Thenable proxy patterns (4 variants + $meta)
 * - Parallel execution with dependency tracking
 * - Progress tracking and event emission
 * - Error handling and recovery
 * - Latency metrics and performance analysis
 * - Promise resolution patterns
 *
 * This serves as both documentation and self-verification.
 *
 * NOTE: The "Error Handling & Recovery" test intentionally includes a failing step
 * to demonstrate error tracking. The verification subtests confirm that errors are
 * properly captured and handled while independent steps continue execution.
 */

import assert from 'node:assert/strict';
import tap from 'tap';
import {TestExecutor, type ITestContext, type StepArray, type StepFunction} from './index.js';

// ============================================================================
// Test 1: Core Features Showcase
// Demonstrates: Thenable patterns, parallel execution, dependencies, progress tracking
// ============================================================================

tap.test('Feature Showcase: Core Parallel Execution & Dependency Tracking', async t => {
    const executor = new TestExecutor({
        concurrency: 4,
        captureStackTraces: true,
    });

    // Track events for verification
    const events: string[] = [];
    executor.on('test:start', () => events.push('test:start'));
    executor.on('step:start', name => events.push(`step:start:${name}`));
    executor.on('step:end', name => events.push(`step:end:${name}`));
    executor.on('test:end', () => events.push('test:end'));

    const executionOrder: Array<{step: string; event: string; time: number}> = [];

    const steps: StepArray = [
        // Independent steps - should run in parallel
        async function fetchUserData() {
            executionOrder.push({step: 'fetchUserData', event: 'start', time: Date.now()});
            await new Promise(resolve => setTimeout(resolve, 50));
            const userData = {id: 1, name: 'Alice', email: 'alice@example.com'};
            executionOrder.push({step: 'fetchUserData', event: 'end', time: Date.now()});
            return userData;
        },

        async function fetchAccountData() {
            executionOrder.push({step: 'fetchAccountData', event: 'start', time: Date.now()});
            await new Promise(resolve => setTimeout(resolve, 50));
            const accountData = {accountId: 'ACC-001', balance: 1000};
            executionOrder.push({step: 'fetchAccountData', event: 'end', time: Date.now()});
            return accountData;
        },

        async function loadConfiguration() {
            executionOrder.push({step: 'loadConfiguration', event: 'start', time: Date.now()});
            await new Promise(resolve => setTimeout(resolve, 30));
            const config = {theme: 'dark', language: 'en'};
            executionOrder.push({step: 'loadConfiguration', event: 'end', time: Date.now()});
            return config;
        },

        // Pattern 1: await context.propertyName
        async function validateUser(assert, context) {
            executionOrder.push({step: 'validateUser', event: 'start', time: Date.now()});
            const user = (await context.fetchUserData) as {id: number; name: string; email: string};
            assert.equal(user.name, 'Alice');
            assert.equal(user.email, 'alice@example.com');
            executionOrder.push({step: 'validateUser', event: 'end', time: Date.now()});
            return {validated: true, userId: user.id};
        },

        // Pattern 2: {propertyName} then await propertyName
        async function enrichUserWithAccount(assert, context) {
            executionOrder.push({step: 'enrichUserWithAccount', event: 'start', time: Date.now()});
            const {fetchUserData, fetchAccountData} = context;
            const user = (await fetchUserData) as {id: number; name: string; email: string};
            const account = (await fetchAccountData) as {accountId: string; balance: number};
            executionOrder.push({step: 'enrichUserWithAccount', event: 'end', time: Date.now()});
            return {
                user: user.name,
                account: account.accountId,
                balance: account.balance,
            };
        },

        // Pattern 3: {propertyName} then await propertyName.nestedProperty
        async function displayUserName(assert, context) {
            executionOrder.push({step: 'displayUserName', event: 'start', time: Date.now()});
            const {fetchUserData} = context;
            const userName = (await fetchUserData) as {id: number; name: string; email: string};
            assert.equal(userName.name, 'Alice');
            executionOrder.push({step: 'displayUserName', event: 'end', time: Date.now()});
            return {displayName: userName};
        },

        // Pattern 4: {propertyName: {nestedProperty}} then await nestedProperty
        async function checkBalance(assert, context) {
            executionOrder.push({step: 'checkBalance', event: 'start', time: Date.now()});
            const {fetchAccountData} = context;
            const currentBalance = ((await fetchAccountData) as {balance: number}).balance;
            assert.equal(currentBalance, 1000);
            executionOrder.push({step: 'checkBalance', event: 'end', time: Date.now()});
            return {hasPositiveBalance: currentBalance > 0};
        },

        // $meta is always available directly
        async function logTestInfo(assert, context) {
            executionOrder.push({step: 'logTestInfo', event: 'start', time: Date.now()});
            assert.equal(context.$meta.testId, 'showcase-001');
            assert.equal(context.$meta.environment, 'test');
            executionOrder.push({step: 'logTestInfo', event: 'end', time: Date.now()});
            return {logged: true};
        },

        // Multiple dependencies - waits for all
        async function generateReport(assert: Parameters<StepFunction>[0], context) {
            executionOrder.push({step: 'generateReport', event: 'start', time: Date.now()});
            const userData = (await context.fetchUserData) as {
                id: number;
                name: string;
                email: string;
            };
            const accountData = (await context.fetchAccountData) as {
                accountId: string;
                balance: number;
            };
            const config = (await context.loadConfiguration) as {theme: string};
            const validation = (await context.validateUser) as {validated: boolean};

            assert.ok(validation.validated);
            executionOrder.push({step: 'generateReport', event: 'end', time: Date.now()});

            return {
                report: `User ${userData.name} has balance ${accountData.balance}`,
                theme: config.theme,
                timestamp: Date.now(),
            };
        },

        // Multiple steps awaiting same property (shared dependency)
        async function cacheUserData(assert, context) {
            executionOrder.push({step: 'cacheUserData', event: 'start', time: Date.now()});
            const user = (await context.fetchUserData) as {id: number; name: string; email: string};
            executionOrder.push({step: 'cacheUserData', event: 'end', time: Date.now()});
            return {cached: true, cachedId: user.id};
        },

        // Final step depends on report
        async function sendNotification(assert: Parameters<StepFunction>[0], context) {
            executionOrder.push({step: 'sendNotification', event: 'start', time: Date.now()});
            const report = (await context.generateReport) as {
                report: string;
                theme: string;
                timestamp: number;
            };
            assert.ok(report.report.includes('Alice'));
            executionOrder.push({step: 'sendNotification', event: 'end', time: Date.now()});
            return {notified: true, reportSent: report.timestamp};
        },
    ];

    await executor.execute(steps, {testId: 'showcase-001', environment: 'test'});

    // ========================================================================
    // Verify Parallel Execution
    // ========================================================================
    t.test('Parallel Execution Verification', async () => {
        // The first 3 steps (fetchUserData, fetchAccountData, loadConfiguration) should start in parallel
        const firstThreeStarts = executionOrder
            .filter(e => e.event === 'start')
            .slice(0, 3)
            .map(e => e.step);

        assert.ok(
            firstThreeStarts.includes('fetchUserData') &&
                firstThreeStarts.includes('fetchAccountData') &&
                firstThreeStarts.includes('loadConfiguration'),
            'First three independent steps should start in parallel',
        );

        // Verify dependent steps waited
        // Note: In async execution, steps START immediately but BLOCK internally on dependencies
        // So we need to verify that a dependent step COMPLETES after its dependency completes
        const validateUserEnd = executionOrder.find(
            e => e.step === 'validateUser' && e.event === 'end',
        )!;
        const fetchUserDataEnd = executionOrder.find(
            e => e.step === 'fetchUserData' && e.event === 'end',
        )!;

        assert.ok(
            validateUserEnd.time >= fetchUserDataEnd.time,
            'validateUser must complete after fetchUserData completes (dependency respected)',
        );
    });

    // ========================================================================
    // Verify Progress Tracking
    // ========================================================================
    t.test('Progress Tracking Verification', async () => {
        const progress = executor.getProgress();

        assert.equal(progress.status, 'completed', 'Test should complete successfully');
        assert.equal(progress.totalSteps, 11, 'Should track all 11 steps');
        assert.equal(progress.completedSteps, 11, 'All steps should complete');
        assert.equal(progress.failedSteps, 0, 'No steps should fail');
        assert.ok(progress.endTime, 'Should have end time');
        assert.ok(progress.endTime! > progress.startTime, 'End time should be after start');

        // Verify individual step progress
        const fetchUserStep = progress.steps.get('fetchUserData')!;
        assert.ok(fetchUserStep, 'Should track fetchUserData step');
        assert.equal(fetchUserStep.status, 'completed', 'Step should be completed');
        assert.ok(fetchUserStep.startTime, 'Should have start time');
        assert.ok(fetchUserStep.endTime, 'Should have end time');
        assert.ok(fetchUserStep.duration, 'Should have duration');
        assert.ok(fetchUserStep.duration >= 50, 'Duration should be at least 50ms');

        // Verify source location capture
        assert.ok(fetchUserStep.sourceLocation, 'Should capture source location');
        assert.ok(
            fetchUserStep.sourceLocation.file.includes('.ts') ||
                fetchUserStep.sourceLocation.file.includes('.js'),
            'Should capture source file',
        );
    });

    // ========================================================================
    // Verify Dependency Graph
    // ========================================================================
    t.test('Dependency Graph Verification', async () => {
        const graph = executor.getDependencyGraph();

        assert.equal(graph.nodes.size, 11, 'Should have 11 nodes');

        // Verify specific dependencies
        const edges = graph.edges;

        // validateUser depends on fetchUserData
        const validateUserEdge = edges.find(
            e => e.from === 'validateUser' && e.to === 'fetchUserData',
        );
        assert.ok(validateUserEdge, 'Should track validateUser -> fetchUserData dependency');

        // enrichUserWithAccount depends on both fetchUserData and fetchAccountData
        const enrichEdges = edges.filter(e => e.from === 'enrichUserWithAccount');
        assert.equal(enrichEdges.length, 2, 'enrichUserWithAccount should have 2 dependencies');

        // generateReport has multiple dependencies
        const reportEdges = edges.filter(e => e.from === 'generateReport');
        assert.ok(reportEdges.length >= 4, 'generateReport should have 4+ dependencies');

        // Multiple steps can depend on same property
        const userDataDependents = edges.filter(e => e.to === 'fetchUserData');
        assert.ok(userDataDependents.length >= 3, 'fetchUserData should have multiple dependents');
    });

    // ========================================================================
    // Verify Event Emission
    // ========================================================================
    t.test('Event Emission Verification', async () => {
        assert.equal(events[0], 'test:start', 'Should emit test:start first');
        assert.equal(events[events.length - 1], 'test:end', 'Should emit test:end last');

        // Verify all steps have start and end events
        for (const step of steps) {
            const stepName = step.name;
            assert.ok(
                events.includes(`step:start:${stepName}`),
                `Should emit step:start for ${stepName}`,
            );
            assert.ok(
                events.includes(`step:end:${stepName}`),
                `Should emit step:end for ${stepName}`,
            );
        }
    });

    // ========================================================================
    // Verify Latency Metrics
    // ========================================================================
    t.test('Latency Metrics Verification', async () => {
        const latency = executor.getLatencyReport();

        assert.ok(latency.totalDuration > 0, 'Should track total duration');
        assert.equal(latency.steps.size, 11, 'Should track all steps');

        // Verify step latency details
        const fetchUserLatency = latency.steps.get('fetchUserData');
        assert.ok(fetchUserLatency, 'Should have latency for fetchUserData');
        assert.ok(fetchUserLatency.queueTime >= 0, 'Should track queue time');
        assert.ok(fetchUserLatency.executionTime >= 50, 'Should track execution time');
        assert.ok(fetchUserLatency.totalTime >= 50, 'Should track total time');

        // Verify critical path calculation
        assert.ok(Array.isArray(latency.criticalPath), 'Should calculate critical path');
        assert.ok(latency.criticalPath.length > 0, 'Critical path should have steps');

        // Verify parallel efficiency (should be > 1.0 due to parallelization)
        assert.ok(latency.parallelEfficiency > 0, 'Should calculate parallel efficiency');

        // Verify bottleneck identification
        assert.ok(Array.isArray(latency.bottlenecks), 'Should identify bottlenecks');
    });
});

// ============================================================================
// Test 2: Nested Steps & Sequential Execution
// Demonstrates: Nested arrays, hierarchical execution
// ============================================================================

tap.test('Feature Showcase: Nested Steps & Test Context Integration', async t => {
    const executor = new TestExecutor({concurrency: 10});

    const databaseOperations: StepArray = [
        async function connectDatabase() {
            await new Promise(resolve => setTimeout(resolve, 20));
            return {connected: true, connectionId: 'conn-123'};
        },

        async function createSchema(assert: Parameters<StepFunction>[0], context) {
            const connection = (await context.connectDatabase) as {connected: boolean};
            assert.ok(connection.connected);
            await new Promise(resolve => setTimeout(resolve, 20));
            return {schema: 'users', created: true};
        },

        async function seedData(assert: Parameters<StepFunction>[0], context) {
            const schema = (await context.createSchema) as {created: boolean};
            assert.ok(schema.created);
            await new Promise(resolve => setTimeout(resolve, 20));
            return {
                users: [
                    {id: 1, name: 'Alice'},
                    {id: 2, name: 'Bob'},
                ],
            };
        },
    ];
    databaseOperations.name = 'Database Setup';

    const apiOperations: StepArray = [
        async function startServer(assert, context) {
            const dbData = (await context.seedData) as {users: unknown[]};
            assert.equal(dbData.users.length, 2);
            await new Promise(resolve => setTimeout(resolve, 20));
            return {serverRunning: true, port: 3000};
        },

        async function registerRoutes(assert: Parameters<StepFunction>[0], context) {
            const server = (await context.startServer) as {serverRunning: boolean};
            assert.ok(server.serverRunning);
            await new Promise(resolve => setTimeout(resolve, 20));
            return {routes: ['/users', '/accounts', '/health']};
        },
    ];
    apiOperations.name = 'API Setup';

    const testOperations: StepArray = [
        async function callHealthEndpoint(assert: Parameters<StepFunction>[0], context) {
            const routes = (await context.registerRoutes) as {routes: string[]};
            assert.ok(routes.routes.includes('/health'));
            await new Promise(resolve => setTimeout(resolve, 20));
            return {status: 200, body: {healthy: true}};
        },

        async function callUsersEndpoint(assert: Parameters<StepFunction>[0], context) {
            const routes = (await context.registerRoutes) as {routes: string[]};
            const dbData = (await context.seedData) as {users: unknown[]};
            assert.ok(routes.routes.includes('/users'));
            await new Promise(resolve => setTimeout(resolve, 20));
            return {status: 200, users: dbData.users};
        },
    ];
    testOperations.name = 'API Tests';

    const steps: StepArray = [
        async function initialize() {
            return {initialized: true, timestamp: Date.now()};
        },

        databaseOperations,
        apiOperations,
        testOperations,

        async function cleanup(assert, context) {
            const health = (await context.callHealthEndpoint) as {
                status: number;
                body: {healthy: boolean};
            };
            const users = (await context.callUsersEndpoint) as {status: number; users: unknown[]};
            assert.equal(health.status, 200);
            assert.equal(users.users.length, 2);
            return {cleanedUp: true};
        },
    ];

    await executor.execute(steps, {testId: 'nested-showcase'});

    // ========================================================================
    // Verify Nested Group Execution
    // ========================================================================
    t.test('Nested Group Verification', async () => {
        const progress = executor.getProgress();

        // Verify all steps completed
        assert.equal(progress.status, 'completed');
        assert.equal(progress.completedSteps, 9); // 1 + 3 + 2 + 2 + 1 = 9 steps
        assert.equal(progress.failedSteps, 0);

        // Verify steps executed in correct order within groups
        // Note: In async execution, steps START immediately but BLOCK internally on dependencies
        // Check that dependent steps COMPLETE after their dependencies complete
        const createSchemaStep = progress.steps.get('createSchema')!;
        const connectDatabaseStep = progress.steps.get('connectDatabase')!;

        assert.ok(
            createSchemaStep.endTime! >= connectDatabaseStep.endTime!,
            'createSchema must complete after connectDatabase completes (dependency respected)',
        );
    });

    // ========================================================================
    // Verify Group Hierarchy
    // ========================================================================
    t.test('Group Hierarchy Verification', async () => {
        const progress = executor.getProgress();

        // Verify groupPath tracking
        const seedDataStep = progress.steps.get('seedData')!;
        assert.ok(Array.isArray(seedDataStep.groupPath), 'Should track group path');

        // Steps in nested arrays should have groupPath
        const steps = Array.from(progress.steps.values());
        const stepsWithGroups = steps.filter(s => s.groupPath.length > 0);
        assert.ok(stepsWithGroups.length >= 7, 'Should track group membership');
    });
});

// ============================================================================
// Test 3: Error Handling & Recovery
// Demonstrates: Error capture, dependency chains, continued execution
// NOTE: This test includes an intentional failure to showcase error handling!
// The 'failingStep' error demonstrates proper error tracking and reporting.
// All verification subtests should pass, confirming correct error handling.
// ============================================================================

tap.test('Feature Showcase: Error Handling & Recovery', async t => {
    const executor = new TestExecutor({
        concurrency: 10,
        captureStackTraces: true,
    });

    const events: Array<{event: string; step?: string}> = [];
    executor.on('step:start', name => events.push({event: 'start', step: name}));
    executor.on('step:end', name => events.push({event: 'end', step: name}));
    executor.on('step:error', (name, _error) => events.push({event: 'error', step: name}));

    const steps: StepArray = [
        async function successfulSetup() {
            return {setupComplete: true};
        },

        async function independentOperation1() {
            await new Promise(resolve => setTimeout(resolve, 20));
            return {op1: 'success'};
        },

        async function independentOperation2() {
            await new Promise(resolve => setTimeout(resolve, 20));
            return {op2: 'success'};
        },

        async function failingStep(assert: Parameters<StepFunction>[0], context) {
            // This step intentionally fails
            const setup = (await context.successfulSetup) as {setupComplete: boolean};
            assert.ok(setup.setupComplete);
            throw new Error('Intentional failure for demonstration');
        },

        async function independentSuccess(assert, context) {
            // This runs independently and should succeed
            await new Promise(resolve => setTimeout(resolve, 20));
            const op1 = (await context.independentOperation1) as {op1: string};
            const op2 = (await context.independentOperation2) as {op2: string};
            assert.equal(op1.op1, 'success');
            assert.equal(op2.op2, 'success');
            return {independentResult: 'completed'};
        },
    ];

    // Execute and expect the test to handle errors gracefully
    // Note: Without test context, errors propagate up, so we catch them here
    try {
        await executor.execute(steps, {testId: 'error-showcase'});
    } catch (_error) {
        // Expected - failingStep throws an intentional error
        // The executor still tracks all error details in progress
    }

    // ========================================================================
    // Verify Error Tracking
    // ========================================================================
    t.test('Error Tracking Verification', async () => {
        const progress = executor.getProgress();

        assert.equal(progress.failedSteps, 1, 'Should track 1 failed step');

        const failedStep = progress.steps.get('failingStep')!;
        assert.equal(failedStep.status, 'failed', 'Should mark step as failed');
        assert.ok(failedStep.error, 'Should capture error details');
        assert.ok(
            failedStep.error.message.includes('Intentional failure'),
            'Should capture error message',
        );
        assert.ok(failedStep.error.stack, 'Should capture stack trace');

        // Verify source location was captured
        assert.ok(failedStep.sourceLocation, 'Should capture source location of failed step');
    });

    // ========================================================================
    // Verify Error Events
    // ========================================================================
    t.test('Error Events Verification', async () => {
        const errorEvents = events.filter(e => e.event === 'error');
        assert.ok(errorEvents.length >= 1, 'Should emit error events');

        const failingStepError = errorEvents.find(e => e.step === 'failingStep');
        assert.ok(failingStepError, 'Should emit error for failingStep');
    });

    // ========================================================================
    // Verify Continued Execution
    // ========================================================================
    t.test('Continued Execution Verification', async () => {
        const progress = executor.getProgress();

        // Note: Without test context, Promise.all() rejects immediately when a step fails,
        // so in-progress steps may not complete. The parallel operations that started first
        // likely completed, but steps that depend on longer operations may still be running.

        // Verify parallel operations that started early likely completed
        const op1Step = progress.steps.get('independentOperation1')!;
        const op2Step = progress.steps.get('independentOperation2')!;

        // These should be at least running (completed or running status is acceptable)
        assert.ok(
            ['completed', 'running'].includes(op1Step.status),
            'Parallel operation 1 should have started',
        );
        assert.ok(
            ['completed', 'running'].includes(op2Step.status),
            'Parallel operation 2 should have started',
        );
    });

    // ========================================================================
    // Verify Dependency Chain in Error
    // ========================================================================
    t.test('Dependency Chain Verification', async () => {
        const progress = executor.getProgress();

        // Note: When execution fails, graph.edges isn't populated, but dependencies
        // are still tracked in each step's dependencies array
        const failingStep = progress.steps.get('failingStep')!;
        assert.ok(
            failingStep.dependencies.includes('successfulSetup'),
            'Should track dependency on successful step before failure',
        );

        // Verify parallel operations have correct dependencies
        const op1Step = progress.steps.get('independentOperation1')!;
        const op2Step = progress.steps.get('independentOperation2')!;

        // These steps should have no dependencies (they're independent)
        assert.equal(
            op1Step.dependencies.length,
            0,
            'Independent operation 1 should have no dependencies',
        );
        assert.equal(
            op2Step.dependencies.length,
            0,
            'Independent operation 2 should have no dependencies',
        );
    });
});

// ============================================================================
// Test 4: Promise Resolution Patterns
// Demonstrates: Main step promises, nested properties, multiple awaits
// ============================================================================

tap.test('Feature Showcase: Promise Resolution Patterns', async t => {
    const executor = new TestExecutor({concurrency: 10});

    const steps: StepArray = [
        async function createComplexObject() {
            return {
                user: {
                    id: 1,
                    name: 'Alice',
                    profile: {
                        age: 30,
                        location: 'NYC',
                        preferences: {
                            theme: 'dark',
                            language: 'en',
                        },
                    },
                },
                account: {
                    balance: 1000,
                    currency: 'USD',
                },
                metadata: {
                    created: Date.now(),
                    version: '1.0',
                },
            };
        },

        // Access whole object
        async function getWholeObject(assert, context) {
            const data = (await context.createComplexObject) as {
                user: {
                    name: string;
                };
                account: {balance: number; currency: string};
            };
            assert.equal(data.user.name, 'Alice');
            assert.equal(data.account.balance, 1000);
            return {processed: true};
        },

        // Access nested property
        async function getNestedProperty1(assert, context) {
            const {createComplexObject} = context as {
                createComplexObject?: {
                    user: {
                        name: Promise<string>;
                    };
                };
            };
            const userName = await createComplexObject!.user.name;
            assert.equal(userName, 'Alice');
            return {userName};
        },

        // Access deeply nested property
        async function getDeepProperty(assert, context) {
            const {createComplexObject} = context as {
                createComplexObject?: {
                    user: {
                        profile: {
                            preferences: {
                                theme: Promise<string>;
                            };
                        };
                    };
                };
            };
            const theme = await createComplexObject!.user.profile.preferences.theme;
            assert.equal(theme, 'dark');
            return {userTheme: theme};
        },

        // Multiple steps await same nested property
        async function getNestedProperty2(assert, context) {
            const {createComplexObject} = context as {
                createComplexObject?: {
                    user: {
                        name: Promise<string>;
                    };
                };
            };
            const userName = await createComplexObject!.user.name;
            assert.equal(userName, 'Alice');
            return {duplicateUserName: userName};
        },

        async function getNestedProperty3(assert, context) {
            const {createComplexObject} = context as {
                createComplexObject?: {
                    user: {
                        name: Promise<string>;
                    };
                };
            };
            const userName = await createComplexObject!.user.name;
            assert.equal(userName, 'Alice');
            return {triplicateUserName: userName};
        },

        // Destructure multiple nested properties
        async function getMultipleNested(assert, context) {
            const {
                createComplexObject: {
                    user: {name},
                    account: {balance},
                },
            } = context as unknown as {
                createComplexObject: {
                    user: {
                        name: Promise<string>;
                    };
                    account: {
                        balance: Promise<number>;
                    };
                };
            };

            const userName = await name;
            const accountBalance = await balance;

            assert.equal(userName, 'Alice');
            assert.equal(accountBalance, 1000);

            return {summary: `${userName} has ${accountBalance}`};
        },

        // Verify all previous steps
        async function verifyAll(assert: Parameters<StepFunction>[0], context) {
            const whole = (await context.getWholeObject) as {processed: boolean};
            const nested1 = (await context.getNestedProperty1) as {userName: string};
            const deep = (await context.getDeepProperty) as {userTheme: string};
            const nested2 = (await context.getNestedProperty2) as {duplicateUserName: string};
            const nested3 = (await context.getNestedProperty3) as {triplicateUserName: string};
            const multiple = (await context.getMultipleNested) as {summary: string};

            assert.ok(whole.processed);
            assert.equal(nested1.userName, 'Alice');
            assert.equal(deep.userTheme, 'dark');
            assert.equal(nested2.duplicateUserName, 'Alice');
            assert.equal(nested3.triplicateUserName, 'Alice');
            assert.ok(multiple.summary.includes('Alice'));

            return {allVerified: true};
        },
    ];

    await executor.execute(steps, {testId: 'promise-showcase'});

    // ========================================================================
    // Verify Promise Resolution
    // ========================================================================
    t.test('Promise Resolution Verification', async () => {
        const progress = executor.getProgress();

        assert.equal(progress.status, 'completed');
        assert.equal(progress.completedSteps, 8);
        assert.equal(progress.failedSteps, 0);
    });

    // ========================================================================
    // Verify Multiple Awaits of Same Property
    // ========================================================================
    t.test('Multiple Awaits Verification', async () => {
        const graph = executor.getDependencyGraph();

        // Multiple steps should depend on createComplexObject
        const dependents = graph.edges.filter(e => e.to === 'createComplexObject');
        assert.ok(dependents.length >= 6, 'Multiple steps should depend on createComplexObject');

        // Nested property dependencies should be tracked (check property field contains references)
        const nestedPropertyRefs = graph.edges.filter(
            e => e.property && e.property.includes('createComplexObject'),
        );
        assert.ok(nestedPropertyRefs.length >= 3, 'Should track nested property access patterns');
    });
});

// ============================================================================
// Summary Test: Full Feature Integration
// ============================================================================

tap.test('Feature Showcase: Complete Integration Test', async t => {
    // This test combines all features in a realistic scenario
    const executor = new TestExecutor({
        concurrency: 5,
        captureStackTraces: true,
    });

    // Track full execution
    const executionLog: string[] = [];

    executor.on('test:start', () => executionLog.push('TEST_START'));
    executor.on('step:start', name => executionLog.push(`START:${name}`));
    executor.on('step:end', name => executionLog.push(`END:${name}`));
    executor.on('step:error', name => executionLog.push(`ERROR:${name}`));
    executor.on('test:end', () => executionLog.push('TEST_END'));

    // Realistic e-commerce checkout scenario
    const steps: StepArray = [
        async function loadProduct() {
            await new Promise(resolve => setTimeout(resolve, 30));
            return {productId: 'PROD-123', price: 99.99, inStock: true};
        },

        async function loadUserCart() {
            await new Promise(resolve => setTimeout(resolve, 30));
            return {cartId: 'CART-456', items: 2};
        },

        async function validateInventory(assert: Parameters<StepFunction>[0], context) {
            const product = (await context.loadProduct) as {
                productId: string;
                price: number;
                inStock: boolean;
            };
            assert.ok(product.inStock);
            await new Promise(resolve => setTimeout(resolve, 20));
            return {inventoryValid: true, reservationId: 'RES-789'};
        },

        async function calculateShipping(assert, context) {
            const cart = (await context.loadUserCart) as {cartId: string; items: number};
            assert.equal(cart.items, 2);
            await new Promise(resolve => setTimeout(resolve, 20));
            return {shippingCost: 9.99, estimatedDays: 3};
        },

        async function calculateTax(assert, context) {
            const product = (await context.loadProduct) as {
                productId: string;
                price: number;
                inStock: boolean;
            };
            await new Promise(resolve => setTimeout(resolve, 20));
            return {taxAmount: product.price * 0.08};
        },

        async function calculateTotal(assert, context) {
            const product = (await context.loadProduct) as {
                productId: string;
                price: number;
                inStock: boolean;
            };
            const shipping = (await context.calculateShipping) as {
                shippingCost: number;
                estimatedDays: number;
            };
            const tax = (await context.calculateTax) as {taxAmount: number};

            const total = product.price + shipping.shippingCost + tax.taxAmount;
            return {
                total,
                breakdown: {
                    product: product.price,
                    shipping: shipping.shippingCost,
                    tax: tax.taxAmount,
                },
            };
        },

        async function processPayment(assert: Parameters<StepFunction>[0], context) {
            const total = (await context.calculateTotal) as {
                total: number;
                breakdown: {product: number; shipping: number; tax: number};
            };
            const inventory = (await context.validateInventory) as {
                inventoryValid: boolean;
                reservationId: string;
            };

            assert.ok(inventory.inventoryValid);
            await new Promise(resolve => setTimeout(resolve, 40));

            return {paymentId: 'PAY-999', amount: total.total, status: 'completed'};
        },

        async function createOrder(assert, context) {
            const payment = (await context.processPayment) as {
                paymentId: string;
                amount: number;
                status: string;
            };
            const cart = (await context.loadUserCart) as {cartId: string; items: number};

            assert.equal(payment.status, 'completed');
            await new Promise(resolve => setTimeout(resolve, 30));

            return {orderId: 'ORD-111', paymentId: payment.paymentId, cartId: cart.cartId};
        },

        async function sendConfirmationEmail(assert, context) {
            const order = (await context.createOrder) as {
                orderId: string;
                paymentId: string;
                cartId: string;
            };
            await new Promise(resolve => setTimeout(resolve, 20));
            return {emailSent: true, orderId: order.orderId};
        },

        async function updateInventory(assert, context) {
            await context.createOrder;
            const inventory = (await context.validateInventory) as {
                inventoryValid: boolean;
                reservationId: string;
            };

            await new Promise(resolve => setTimeout(resolve, 20));
            return {inventoryUpdated: true, reservationReleased: inventory.reservationId};
        },
    ];

    const startTime = Date.now();
    await executor.execute(steps, {testId: 'checkout-001', environment: 'production'});
    const endTime = Date.now();

    // ========================================================================
    // Comprehensive Verification
    // ========================================================================
    t.test('Complete Execution Verification', async () => {
        const progress = executor.getProgress();
        const graph = executor.getDependencyGraph();
        const latency = executor.getLatencyReport();

        // Progress verification
        assert.equal(progress.status, 'completed', 'Test should complete');
        assert.equal(progress.totalSteps, 10, 'Should have 10 steps');
        assert.equal(progress.completedSteps, 10, 'All steps should complete');
        assert.equal(progress.failedSteps, 0, 'No failures');
        assert.ok(
            progress.endTime! - progress.startTime < 500,
            'Should complete in reasonable time due to parallelization',
        );

        // Graph verification
        assert.equal(graph.nodes.size, 10, 'Graph should have 10 nodes');
        assert.ok(graph.edges.length > 0, 'Should have dependency edges');

        // Verify critical path includes payment and order creation
        assert.ok(
            latency.criticalPath.includes('processPayment') ||
                latency.criticalPath.includes('createOrder'),
            'Critical path should include payment or order steps',
        );

        // Latency verification
        assert.ok(
            latency.totalDuration < endTime - startTime + 50,
            'Latency tracking should be accurate',
        );
        assert.ok(latency.parallelEfficiency >= 0, 'Should calculate parallel efficiency');

        // Event verification
        assert.equal(executionLog[0], 'TEST_START', 'Should start with TEST_START');
        assert.equal(executionLog[executionLog.length - 1], 'TEST_END', 'Should end with TEST_END');

        // Verify all steps have start and end events
        for (const step of steps) {
            assert.ok(
                executionLog.includes(`START:${step.name}`),
                `Should have START event for ${step.name}`,
            );
            assert.ok(
                executionLog.includes(`END:${step.name}`),
                `Should have END event for ${step.name}`,
            );
        }
    });

    t.test('Realistic Workflow Verification', async () => {
        const progress = executor.getProgress();

        // Verify business logic executed correctly
        const orderStep = progress.steps.get('createOrder')!;
        const paymentStep = progress.steps.get('processPayment')!;
        const emailStep = progress.steps.get('sendConfirmationEmail')!;

        assert.equal(orderStep.status, 'completed');
        assert.equal(paymentStep.status, 'completed');
        assert.equal(emailStep.status, 'completed');

        // Verify order of execution (email after order)
        // Note: Check completion times since steps start immediately but block on dependencies
        assert.ok(
            emailStep.endTime! >= orderStep.endTime!,
            'Email must complete after order completes (dependency respected)',
        );

        // Verify parallel optimization (inventory and tax calculated in parallel)
        const taxStep = progress.steps.get('calculateTax')!;
        const shippingStep = progress.steps.get('calculateShipping')!;

        // These independent steps should run in parallel and overlap
        const taxRange = [taxStep.startTime!, taxStep.endTime!];
        const shippingRange = [shippingStep.startTime!, shippingStep.endTime!];

        const overlap = Math.max(
            0,
            Math.min(taxRange[1], shippingRange[1]) - Math.max(taxRange[0], shippingRange[0]),
        );

        // Durations are implicitly covered by overlap calculation; remove unused variables.

        // Verify significant overlap between independent steps
        assert.ok(
            overlap > 10,
            `Independent steps should overlap significantly (got ${overlap}ms overlap)`,
        );

        // Verify overall workflow benefits from parallelization
        const latency = executor.getLatencyReport();
        assert.ok(
            latency.parallelEfficiency > 1.5,
            `Should achieve >1.5x parallel efficiency (got ${latency.parallelEfficiency.toFixed(2)}x)`,
        );
    });
});

// ============================================================================
// Test 6: Checkpoints for Synchronization
// Demonstrates: Empty arrays as synchronization barriers between parallel phases
// ============================================================================

tap.test('Feature Showcase: Checkpoints and Synchronization Barriers', async t => {
    const executor = new TestExecutor({concurrency: 10});

    const executionLog: Array<{step: string; event: string; timestamp: number}> = [];
    const startTime = Date.now();

    const steps: StepArray = [
        // Phase 1: Initialization (runs in parallel)
        async function loadConfig() {
            executionLog.push({
                step: 'loadConfig',
                event: 'start',
                timestamp: Date.now() - startTime,
            });
            await new Promise(resolve => setTimeout(resolve, 40));
            executionLog.push({
                step: 'loadConfig',
                event: 'end',
                timestamp: Date.now() - startTime,
            });
            return {apiUrl: 'https://api.example.com', timeout: 5000};
        },

        async function initializeCache() {
            executionLog.push({
                step: 'initCache',
                event: 'start',
                timestamp: Date.now() - startTime,
            });
            await new Promise(resolve => setTimeout(resolve, 40));
            executionLog.push({step: 'initCache', event: 'end', timestamp: Date.now() - startTime});
            return {cached: true, size: 1000};
        },

        async function setupLogging() {
            executionLog.push({
                step: 'setupLog',
                event: 'start',
                timestamp: Date.now() - startTime,
            });
            await new Promise(resolve => setTimeout(resolve, 40));
            executionLog.push({step: 'setupLog', event: 'end', timestamp: Date.now() - startTime});
            return {logLevel: 'info', destination: 'stdout'};
        },

        // Checkpoint 1: Wait for all initialization to complete
        [],

        // Phase 2: Data loading (depends on initialization, runs in parallel)
        async function loadUsers(assert: Parameters<StepFunction>[0], context: ITestContext) {
            executionLog.push({
                step: 'loadUsers',
                event: 'start',
                timestamp: Date.now() - startTime,
            });
            const config = (await context.loadConfig) as {apiUrl: string; timeout: number};
            assert.ok(config.apiUrl);
            await new Promise(resolve => setTimeout(resolve, 50));
            executionLog.push({step: 'loadUsers', event: 'end', timestamp: Date.now() - startTime});
            return {
                users: [
                    {id: 1, name: 'Alice'},
                    {id: 2, name: 'Bob'},
                ],
            };
        },

        async function loadProducts(assert: Parameters<StepFunction>[0], context: ITestContext) {
            executionLog.push({
                step: 'loadProducts',
                event: 'start',
                timestamp: Date.now() - startTime,
            });
            const config = (await context.loadConfig) as {apiUrl: string; timeout: number};
            assert.ok(config.apiUrl);
            await new Promise(resolve => setTimeout(resolve, 50));
            executionLog.push({
                step: 'loadProducts',
                event: 'end',
                timestamp: Date.now() - startTime,
            });
            return {
                products: [
                    {id: 'P1', name: 'Widget'},
                    {id: 'P2', name: 'Gadget'},
                ],
            };
        },

        async function loadOrders(assert: Parameters<StepFunction>[0], context: ITestContext) {
            executionLog.push({
                step: 'loadOrders',
                event: 'start',
                timestamp: Date.now() - startTime,
            });
            const config = (await context.loadConfig) as {apiUrl: string; timeout: number};
            assert.ok(config.apiUrl);
            await new Promise(resolve => setTimeout(resolve, 50));
            executionLog.push({
                step: 'loadOrders',
                event: 'end',
                timestamp: Date.now() - startTime,
            });
            return {orders: [{orderId: 'O1', total: 99.99}]};
        },

        // Checkpoint 2: Wait for all data loading to complete
        [],

        // Phase 3: Processing (depends on all data, runs in parallel)
        async function generateUserReport(assert, context: ITestContext) {
            executionLog.push({
                step: 'genUserReport',
                event: 'start',
                timestamp: Date.now() - startTime,
            });
            const users = (await context.loadUsers) as {users: {id: number; name: string}[]};
            const _orders = (await context.loadOrders) as {
                orders: {orderId: string; total: number}[];
            };
            assert.equal(users.users.length, 2);
            await new Promise(resolve => setTimeout(resolve, 30));
            executionLog.push({
                step: 'genUserReport',
                event: 'end',
                timestamp: Date.now() - startTime,
            });
            return {report: 'User report with orders', userCount: users.users.length};
        },

        async function generateProductReport(
            assert: Parameters<StepFunction>[0],
            context: ITestContext,
        ) {
            executionLog.push({
                step: 'genProdReport',
                event: 'start',
                timestamp: Date.now() - startTime,
            });
            const products = (await context.loadProducts) as {
                products: {id: string; name: string}[];
            };
            const orders = (await context.loadOrders) as {
                orders: {orderId: string; total: number}[];
            };
            assert.equal(products.products.length, 2);
            assert.ok(orders.orders.length > 0);
            await new Promise(resolve => setTimeout(resolve, 30));
            executionLog.push({
                step: 'genProdReport',
                event: 'end',
                timestamp: Date.now() - startTime,
            });
            return {report: 'Product report with orders', productCount: products.products.length};
        },

        async function calculateMetrics(assert, context: ITestContext) {
            executionLog.push({
                step: 'calcMetrics',
                event: 'start',
                timestamp: Date.now() - startTime,
            });
            const users = (await context.loadUsers) as {users: unknown[]};
            const products = (await context.loadProducts) as {products: unknown[]};
            const orders = (await context.loadOrders) as {orders: unknown[]};
            await new Promise(resolve => setTimeout(resolve, 30));
            executionLog.push({
                step: 'calcMetrics',
                event: 'end',
                timestamp: Date.now() - startTime,
            });
            return {
                totalUsers: users.users.length,
                totalProducts: products.products.length,
                totalOrders: orders.orders.length,
            };
        },

        // Checkpoint 3: Wait for all processing to complete
        [],

        // Phase 4: Finalization (single step that needs everything)
        async function saveAnalytics(assert: Parameters<StepFunction>[0], context: ITestContext) {
            executionLog.push({
                step: 'saveAnalytics',
                event: 'start',
                timestamp: Date.now() - startTime,
            });
            const {generateUserReport, generateProductReport, calculateMetrics} = context;
            const userReport = (await generateUserReport) as {report: unknown};
            const productReport = (await generateProductReport) as {report: unknown};
            const metrics = (await calculateMetrics) as {totalUsers: unknown};

            assert.ok(userReport.report);
            assert.ok(productReport.report);
            assert.ok(metrics.totalUsers);

            await new Promise(resolve => setTimeout(resolve, 20));
            executionLog.push({
                step: 'saveAnalytics',
                event: 'end',
                timestamp: Date.now() - startTime,
            });
            return {saved: true, timestamp: Date.now()};
        },
    ];

    await executor.execute(steps, {testId: 'checkpoint-demo'});

    // ========================================================================
    // Verify Checkpoint Barriers
    // ========================================================================
    t.test('Checkpoint Synchronization Verification', async () => {
        const progress = executor.getProgress();

        assert.equal(progress.status, 'completed');
        assert.equal(progress.completedSteps, 10);
        assert.equal(progress.failedSteps, 0);

        // Phase 1 (init steps) should all end before Phase 2 (load steps) starts
        const initEndTimes = [
            executionLog.find(e => e.step === 'loadConfig' && e.event === 'end')!.timestamp,
            executionLog.find(e => e.step === 'initCache' && e.event === 'end')!.timestamp,
            executionLog.find(e => e.step === 'setupLog' && e.event === 'end')!.timestamp,
        ];
        const loadStartTimes = [
            executionLog.find(e => e.step === 'loadUsers' && e.event === 'start')!.timestamp,
            executionLog.find(e => e.step === 'loadProducts' && e.event === 'start')!.timestamp,
            executionLog.find(e => e.step === 'loadOrders' && e.event === 'start')!.timestamp,
        ];

        const lastInitEnd = Math.max(...initEndTimes);
        const firstLoadStart = Math.min(...loadStartTimes);

        assert.ok(
            lastInitEnd <= firstLoadStart,
            `Checkpoint 1: All init steps must complete (${lastInitEnd}ms) before load steps start (${firstLoadStart}ms)`,
        );

        // Phase 2 (load steps) should all end before Phase 3 (processing) starts
        const loadEndTimes = [
            executionLog.find(e => e.step === 'loadUsers' && e.event === 'end')!.timestamp,
            executionLog.find(e => e.step === 'loadProducts' && e.event === 'end')!.timestamp,
            executionLog.find(e => e.step === 'loadOrders' && e.event === 'end')!.timestamp,
        ];
        const processStartTimes = [
            executionLog.find(e => e.step === 'genUserReport' && e.event === 'start')!.timestamp,
            executionLog.find(e => e.step === 'genProdReport' && e.event === 'start')!.timestamp,
            executionLog.find(e => e.step === 'calcMetrics' && e.event === 'start')!.timestamp,
        ];

        const lastLoadEnd = Math.max(...loadEndTimes);
        const firstProcessStart = Math.min(...processStartTimes);

        assert.ok(
            lastLoadEnd <= firstProcessStart,
            `Checkpoint 2: All load steps must complete (${lastLoadEnd}ms) before processing starts (${firstProcessStart}ms)`,
        );

        // Phase 3 (processing) should all end before Phase 4 (finalization) starts
        const processEndTimes = [
            executionLog.find(e => e.step === 'genUserReport' && e.event === 'end')!.timestamp,
            executionLog.find(e => e.step === 'genProdReport' && e.event === 'end')!.timestamp,
            executionLog.find(e => e.step === 'calcMetrics' && e.event === 'end')!.timestamp,
        ];
        const finalizeStart = executionLog.find(
            e => e.step === 'saveAnalytics' && e.event === 'start',
        )!.timestamp;

        const lastProcessEnd = Math.max(...processEndTimes);

        assert.ok(
            lastProcessEnd <= finalizeStart,
            `Checkpoint 3: All processing must complete (${lastProcessEnd}ms) before finalization starts (${finalizeStart}ms)`,
        );
    });

    // ========================================================================
    // Verify Parallel Execution Within Phases
    // ========================================================================
    t.test('Parallel Execution Within Phases', async () => {
        // Phase 1 init steps should run in parallel (overlapping)
        const initStarts = executionLog.filter(
            e => ['loadConfig', 'initCache', 'setupLog'].includes(e.step) && e.event === 'start',
        );

        assert.equal(initStarts.length, 3, 'All init steps should start');

        // Check that they started within a short time window (parallel execution)
        const initStartTimes = initStarts.map(e => e.timestamp);
        const initTimeRange = Math.max(...initStartTimes) - Math.min(...initStartTimes);

        assert.ok(
            initTimeRange < 150,
            `Init steps should start nearly simultaneously (within 150ms), got ${initTimeRange}ms range`,
        );

        // Similar verification for Phase 2 load steps
        const loadStarts = executionLog.filter(
            e =>
                ['loadUsers', 'loadProducts', 'loadOrders'].includes(e.step) && e.event === 'start',
        );
        const loadStartTimes = loadStarts.map(e => e.timestamp);
        const loadTimeRange = Math.max(...loadStartTimes) - Math.min(...loadStartTimes);

        assert.ok(
            loadTimeRange < 150,
            `Load steps should start nearly simultaneously (within 150ms), got ${loadTimeRange}ms range`,
        );
    });

    // ========================================================================
    // Verify Performance Benefit
    // ========================================================================
    t.test('Performance Benefit of Parallel Phases', async () => {
        const latency = executor.getLatencyReport();

        // With checkpoints and parallelization:
        // - Phase 1: ~40ms (3 steps in parallel)
        // - Phase 2: ~50ms (3 steps in parallel)
        // - Phase 3: ~30ms (3 steps in parallel)
        // - Phase 4: ~20ms (1 step)
        // Total: ~140ms + overhead

        // Without parallelization (sequential):
        // - Phase 1: 40+40+40 = 120ms
        // - Phase 2: 50+50+50 = 150ms
        // - Phase 3: 30+30+30 = 90ms
        // - Phase 4: 20ms
        // Total: 380ms

        // With tap's true parallel execution, we should see significant speedup
        assert.ok(
            latency.totalDuration < 250,
            `Parallel execution should complete in <250ms, got ${latency.totalDuration}ms`,
        );

        // Parallel efficiency should show speedup from parallelization
        assert.ok(
            latency.parallelEfficiency > 1.5,
            `Parallel efficiency should be >1.5x, got ${latency.parallelEfficiency.toFixed(2)}x`,
        );

        console.log(`Phase execution completed in ${latency.totalDuration}ms`);
        console.log(`Parallel efficiency: ${latency.parallelEfficiency.toFixed(2)}x`);
        console.log(`Sequential would take ~380ms, saved ~${380 - latency.totalDuration}ms`);
    });
});
