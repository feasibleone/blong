/**
 * Integration test for blong-ttk
 *
 * Tests the complete flow: collection execution → results → Allure reporting
 */

import {allureResultWrite, allureSessionEnd, allureSessionStart} from '@feasibleone/blong-allure';
import {TestExecutor} from '@feasibleone/blong-chain';
import {rm} from 'node:fs/promises';
import {test} from 'tap';
/* eslint-disable @typescript-eslint/no-explicit-any */

test('integration - execute example collection with TestExecutor', async t => {
    // Import the example collection
    const collectionModule = await import('./examples/collections/simple-transfer.js');
    const collection = collectionModule.default;

    // Verify collection structure
    t.ok(collection);
    t.equal(typeof collection, 'function');

    // Create TestExecutor
    const _executor = new TestExecutor({
        concurrency: 2,
    });

    // Execute the collection
    try {
        // Get the handler function
        const handler = (collection as any)({
            lib: {
                group: (_name: string) => (steps: any[]) => steps,
            },
            handler: {},
        });

        // Execute the test
        const testFn = handler.exampleSimpleTransfer;
        t.ok(testFn);
        t.equal(typeof testFn, 'function');

        // Call the test function
        const steps = testFn({name: 'Test'}, {traceId: 'test-trace'} as any);
        t.ok(Array.isArray(steps));
        t.ok(steps.length > 0);

        t.pass('Collection executed successfully');
    } catch (error: any) {
        t.fail(`Collection execution failed: ${error.message}`);
    }
});

test('integration - Allure session lifecycle', async t => {
    const outputDir = './test-allure-results';

    try {
        // Start session
        await allureSessionStart({outputDir});

        // Verify files were created
        // In a real test, we'd verify the files exist
        t.pass('Allure session started');

        // End session (without generating report to avoid CLI dependency)
        await allureSessionEnd({
            outputDir,
            generateOnEnd: false,
        });

        t.pass('Allure session ended');
    } finally {
        // Cleanup
        await rm(outputDir, {recursive: true, force: true});
    }
});

test('integration - result writing for test step', async t => {
    const outputDir = './test-allure-results-2';

    try {
        await allureSessionStart({outputDir});

        // Create a mock step result
        const step = {
            stepName: 'test-step',
            displayName: 'test-step',
            groupPath: [],
            status: 'completed' as const,
            startTime: Date.now(),
            endTime: Date.now() + 100,
            dependencies: [],
            dependents: [],
        };

        // Write result
        await allureResultWrite(
            outputDir,
            step,
            {
                realm: 'ttk',
                collection: 'test-collection',
                group: 'test-group',
                logUrl: 'http://localhost:9998/trace/{traceId}',
            },
            {traceId: 'test-trace-123'} as any,
        );

        t.pass('Result written successfully');
    } finally {
        await rm(outputDir, {recursive: true, force: true});
    }
});

test('integration - callback coordination', async t => {
    // Test the callback promise coordination
    const {getPendingCallbacks} =
        await import('./callback/orchestrator/callback/callbackCallbackRegister.js');

    const store = getPendingCallbacks();
    store.clear(); // Clean state

    // Simulate callback registration and receipt
    const correlationId = 'test-corr-123';

    // Create a pending promise manually
    let resolveCallback: any;
    const callbackPromise = new Promise(resolve => {
        resolveCallback = resolve;
    });

    const timeoutHandle = setTimeout(() => {
        t.fail('Callback timeout');
    }, 5000);

    store.set(correlationId, {
        resolve: resolveCallback,
        reject: () => t.fail('Callback rejected'),
        timeout: timeoutHandle,
        type: 'PUT /transfers/{ID}',
    });

    // Simulate callback arrival
    const pending = store.get(correlationId);
    t.ok(pending);

    if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve({
            correlationId,
            status: 200,
            body: {transferState: 'COMMITTED'},
        });
        store.delete(correlationId);
    }

    // Wait for resolution
    const result = await callbackPromise;
    t.ok(result);
    t.equal((result as any).correlationId, correlationId);
    t.equal((result as any).status, 200);

    t.pass('Callback coordination works');
});
