/**
 * Demonstration of nested test context with automatic indentation
 * Run with: node --test demo.test.js
 */

import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {TestExecutor} from '../index.js';

describe('Demo: Nested Test Context with Automatic Indentation', () => {
    it('demonstrates nested test hierarchy', async t => {
        const executor = new TestExecutor({concurrency: 10});

        // Define nested test groups
        const databaseOperations = [
            async function connectToDatabase() {
                console.log('Connecting to database...');
                return {connection: 'db-connection-123', status: 'connected'};
            },
            async function createTable(assert, context) {
                const db = await context.connectToDatabase;
                console.log(`Creating table using ${db.connection}`);
                assert.equal(db.status, 'connected');
                return {table: 'users', created: true};
            },
        ] as any;
        databaseOperations.name = 'Database Setup';

        const userOperations = [
            async function createUser(assert, context) {
                const table = await context.createTable;
                console.log(`Creating user in ${table.table} table`);
                assert.equal(table.created, true);
                return {userId: 1, name: 'Alice'};
            },
            async function updateUser(assert, context) {
                const user = await context.createUser;
                console.log(`Updating user ${user.name} (ID: ${user.userId})`);
                return {userId: user.userId, name: user.name, updated: true};
            },
        ] as any;
        userOperations.name = 'User Operations';

        // Main test steps
        const steps = [
            async function initializeSystem() {
                console.log('Initializing system...');
                return {systemReady: true, timestamp: Date.now()};
            },
            databaseOperations, // Nested group 1
            userOperations, // Nested group 2
            async function verifySystem(assert, context) {
                const system = await context.initializeSystem;
                const user = await context.updateUser;
                console.log('Verifying system state...');
                assert.equal(system.systemReady, true);
                assert.equal(user.updated, true);
                console.log(`✅ System verified with user ${user.name}`);
                return {verified: true};
            },
        ];

        // Execute with test context for automatic indentation
        await executor.execute(steps, {}, t as any);

        // Verify results
        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 6);
        assert.equal(progress.status, 'completed');
    });

    it('demonstrates deeply nested hierarchy', async t => {
        const executor = new TestExecutor({concurrency: 10});

        const level3 = [
            async function deepOperation() {
                console.log('Executing deep operation at level 3');
                return {level: 3, data: 'deep-data'};
            },
        ] as any;
        level3.name = 'Level 3: Deep Processing';

        const level2 = [
            async function midOperation() {
                console.log('Executing mid operation at level 2');
                return {level: 2, data: 'mid-data'};
            },
            level3, // Nested within level 2
        ] as any;
        level2.name = 'Level 2: Processing';

        const steps = [
            async function topOperation() {
                console.log('Executing top operation at level 1');
                return {level: 1, data: 'top-data'};
            },
            level2, // Nested within level 1
            async function summary(assert, context) {
                const top = await context.topOperation;
                const mid = await context.midOperation;
                const deep = await context.deepOperation;
                console.log('Summary of all levels:');
                console.log(`  Level 1: ${top.data}`);
                console.log(`  Level 2: ${mid.data}`);
                console.log(`  Level 3: ${deep.data}`);
                assert.equal(top.level + mid.level + deep.level, 6);
                return {complete: true};
            },
        ];

        await executor.execute(steps, {}, t as any);

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 4);
    });

    it('shows parallel execution within groups', async t => {
        const executor = new TestExecutor({concurrency: 10});

        const parallelTasks = [
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
        ] as any;
        parallelTasks.name = 'Parallel Task Execution';

        const steps = [
            async function setup() {
                console.log('Setup phase');
                return {ready: true};
            },
            parallelTasks, // These will run in parallel
            async function verify(assert, context) {
                const t1 = await context.task1;
                const t2 = await context.task2;
                const t3 = await context.task3;
                console.log('All tasks verified');
                assert.equal(t1.result, 'done');
                assert.equal(t2.result, 'done');
                assert.equal(t3.result, 'done');
                return {allComplete: true};
            },
        ];

        await executor.execute(steps, {}, t as any);

        const progress = executor.getProgress();
        assert.equal(progress.completedSteps, 5);
    });
});
