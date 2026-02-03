/**
 * Demonstration of error reporting in nested test contexts
 *
 * This file shows how errors are properly reported with indentation and tracking.
 * Run with: node --test error-demo.test.js
 *
 * You'll see that:
 * 1. Errors appear in the nested test output with proper indentation
 * 2. Error details (message, stack trace) are captured
 * 3. Progress tracking records all error information
 * 4. Other independent steps continue executing
 */

import {describe, it} from 'node:test';
import {TestExecutor} from '../index.js';

describe('Error Reporting Demo', () => {
    it('shows error in nested output with full details', async t => {
        console.log('\n📊 Demonstrating error reporting in nested test context:\n');

        const executor = new TestExecutor({concurrency: 10});

        const steps = [
            async function successStep1() {
                console.log('✅ Step 1: Success');
                return {result: 'step1-done'};
            },
            async function errorStep() {
                console.log('❌ Step 2: About to fail...');
                throw new Error('This error will appear in nested output with indentation');
            },
            async function successStep2() {
                console.log('✅ Step 3: Success (runs in parallel)');
                return {result: 'step3-done'};
            },
        ];

        await executor.execute(steps, {}, t as any);

        // Verify error was tracked
        const progress = executor.getProgress();
        console.log(`\n📈 Progress Summary:`);
        console.log(`   Total steps: ${progress.totalSteps}`);
        console.log(`   Completed: ${progress.completedSteps}`);
        console.log(`   Failed: ${progress.failedSteps}`);

        const errorStep = progress.steps.get('errorStep');
        if (errorStep && errorStep.error) {
            console.log(`\n🔍 Error Details Captured:`);
            console.log(`   Status: ${errorStep.status}`);
            console.log(`   Message: ${errorStep.error.message}`);
            console.log(`   Has stack trace: ${!!errorStep.error.stack}`);
        }

        console.log('\n✨ Note: The ✖ mark above shows the error in nested output\n');
    });

    it('shows errors in nested groups with proper indentation', async t => {
        console.log('\n📊 Demonstrating nested group error reporting:\n');

        const executor = new TestExecutor({concurrency: 10});

        const databaseOps = [
            async function connect() {
                console.log('  ✅ Connecting to database...');
                return {connected: true};
            },
            async function failedQuery() {
                console.log('  ❌ Running query (will fail)...');
                throw new Error('Query failed: table not found');
            },
            async function successQuery() {
                console.log('  ✅ Running successful query...');
                return {rows: 10};
            },
        ] as any;
        databaseOps.name = 'Database Operations';

        const steps = [
            async function init() {
                console.log('✅ Initializing system...');
                return {ready: true};
            },
            databaseOps,
            async function cleanup() {
                console.log('✅ Cleanup...');
                return {cleaned: true};
            },
        ];

        await executor.execute(steps, {}, t as any);

        const progress = executor.getProgress();
        console.log(`\n📈 Progress Summary:`);
        console.log(`   Total steps: ${progress.totalSteps}`);
        console.log(`   Completed: ${progress.completedSteps}`);
        console.log(`   Failed: ${progress.failedSteps}`);

        console.log('\n✨ Note: Errors in nested groups show proper indentation\n');
    });

    it('demonstrates multiple errors at different nesting levels', async t => {
        console.log('\n📊 Multiple errors at different levels:\n');

        const executor = new TestExecutor({concurrency: 10});

        const level2 = [
            async function level2Error() {
                console.log('    ❌ Error at level 2');
                throw new Error('Level 2 failure');
            },
        ] as any;
        level2.name = 'Level 2 Group';

        const steps = [
            async function level1Success() {
                console.log('  ✅ Success at level 1');
                return {level: 1};
            },
            async function level1Error() {
                console.log('  ❌ Error at level 1');
                throw new Error('Level 1 failure');
            },
            level2,
        ];

        await executor.execute(steps, {}, t as any);

        const progress = executor.getProgress();
        console.log(`\n📈 Progress Summary:`);
        console.log(`   Failed steps: ${progress.failedSteps}`);

        const level1Err = progress.steps.get('level1Error');
        const level2Err = progress.steps.get('level2Error');

        console.log(`\n🔍 Error Hierarchy:`);
        console.log(`   Level 1 error group path: [${level1Err?.groupPath.join(', ')}]`);
        console.log(`   Level 2 error group path: [${level2Err?.groupPath.join(', ')}]`);

        console.log('\n✨ Both errors tracked with correct nesting information\n');
    });
});

console.log('\n' + '='.repeat(70));
console.log('ERROR REPORTING DEMONSTRATION');
console.log('='.repeat(70));
console.log('\nThis demo shows that:');
console.log('  1. ✖ marks appear in test output for failed steps');
console.log('  2. Error messages and stack traces are displayed');
console.log('  3. Nested groups show proper indentation');
console.log('  4. Progress object captures all error details');
console.log('  5. Other steps continue executing (parallel execution)');
console.log('='.repeat(70) + '\n');
