/**
 * Demonstration of nested test context with automatic indentation
 * Run with: node --test demo.test.js
 */

import {strict} from 'node:assert';
import {describe, it} from 'node:test';
import {TestExecutor} from '../index.js';
import type {StepArray} from '../test-types.js';

describe('Demo: Nested Test Context with Automatic Indentation', () => {
    it('demonstrates nested test hierarchy', async t => {
        const executor = new TestExecutor({concurrency: 10});

        // Define nested test groups
        const databaseOperations: StepArray = [
            async function connectToDatabase() {
                console.log('Connecting to database...');
                return {connection: 'db-connection-123', status: 'connected'};
            },
            async function createTable(assert, context) {
                const db = (await context.connectToDatabase) as {
                    connection: string;
                    status: string;
                };
                console.log(`Creating table using ${db.connection}`);
                assert.equal(db.status, 'connected');
                return {table: 'users', created: true};
            },
        ];
        databaseOperations.name = 'Database Setup';

        const userOperations: StepArray = [
            async function createUser(assert, context) {
                const table = (await context.createTable) as {table: string; created: boolean};
                console.log(`Creating user in ${table.table} table`);
                assert.equal(table.created, true);
                return {userId: 1, name: 'Alice'};
            },
            async function updateUser(assert, context) {
                const user = (await context.createUser) as {userId: number; name: string};
                console.log(`Updating user ${user.name} (ID: ${user.userId})`);
                return {userId: user.userId, name: user.name, updated: true};
            },
        ];
        userOperations.name = 'User Operations';

        // Main test steps
        const steps: StepArray = [
            async function initializeSystem() {
                console.log('Initializing system...');
                return {systemReady: true, timestamp: Date.now()};
            },
            databaseOperations, // Nested group 1
            userOperations, // Nested group 2
            async function verifySystem(assert, context) {
                const system = (await context.initializeSystem) as {
                    systemReady: boolean;
                    timestamp: number;
                };
                const user = (await context.updateUser) as {
                    userId: number;
                    name: string;
                    updated: boolean;
                };
                console.log('Verifying system state...');
                assert.equal(system.systemReady, true);
                assert.equal(user.updated, true);
                console.log(`✅ System verified with user ${user.name}`);
                return {verified: true};
            },
        ];

        // Execute with test context for automatic indentation
        await executor.execute(steps, {}, t);

        // Verify results
        const progress = executor.getProgress();
        strict.equal(progress.completedSteps, 6);
        strict.equal(progress.status, 'completed');
    });

    it('demonstrates deeply nested hierarchy', async t => {
        const executor = new TestExecutor({concurrency: 10});

        const level3 = [
            async function deepOperation() {
                console.log('Executing deep operation at level 3');
                return {level: 3, data: 'deep-data'};
            },
        ] as StepArray;
        level3.name = 'Level 3: Deep Processing';

        const level2 = [
            async function midOperation() {
                console.log('Executing mid operation at level 2');
                return {level: 2, data: 'mid-data'};
            },
            level3, // Nested within level 2
        ] as StepArray;
        level2.name = 'Level 2: Processing';

        const steps: StepArray = [
            async function topOperation() {
                console.log('Executing top operation at level 1');
                return {level: 1, data: 'top-data'};
            },
            level2, // Nested within level 1
            async function summary(assert, context) {
                const top = (await context.topOperation) as {level: number; data: string};
                const mid = (await context.midOperation) as {level: number; data: string};
                const deep = (await context.deepOperation) as {level: number; data: string};
                console.log('Summary of all levels:');
                console.log(`  Level 1: ${top.data}`);
                console.log(`  Level 2: ${mid.data}`);
                console.log(`  Level 3: ${deep.data}`);
                assert.equal(top.level + mid.level + deep.level, 6);
                return {complete: true};
            },
        ];

        await executor.execute(steps, {}, t);

        const progress = executor.getProgress();
        strict.equal(progress.completedSteps, 4);
    });

    it('shows parallel execution within groups', async t => {
        const executor = new TestExecutor({concurrency: 10});

        const parallelTasks: StepArray = [
            async function task1() {
                console.log('Task 1 starting...');
                await new Promise(resolve => setTimeout(resolve, 50));
                console.log('Task 1 completed');
                return {task: 1, result: 'done'};
            },
            async function task2() {
                console.log('Task 2 starting...');
                await new Promise(resolve => setTimeout(resolve, 50));
                console.log('Task 2 completed');
                return {task: 2, result: 'done'};
            },
            async function task3() {
                console.log('Task 3 starting...');
                await new Promise(resolve => setTimeout(resolve, 50));
                console.log('Task 3 completed');
                return {task: 3, result: 'done'};
            },
        ];
        parallelTasks.name = 'Parallel Task Execution';

        const steps: StepArray = [
            async function setup() {
                console.log('Setup phase');
                return {ready: true};
            },
            parallelTasks, // These will run in parallel
            async function verify(assert, context) {
                const t1 = (await context.task1) as {task: number; result: string};
                const t2 = (await context.task2) as {task: number; result: string};
                const t3 = (await context.task3) as {task: number; result: string};
                console.log('All tasks verified');
                assert.equal(t1.result, 'done');
                assert.equal(t2.result, 'done');
                assert.equal(t3.result, 'done');
                return {allComplete: true};
            },
        ];

        await executor.execute(steps, {}, t);

        const progress = executor.getProgress();
        strict.equal(progress.completedSteps, 5);
    });
});
