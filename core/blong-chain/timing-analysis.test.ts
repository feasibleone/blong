import assert from 'assert';
import tap from 'tap';
import {TestExecutor} from './index.js';

// ============================================================================
// Timing Analysis Test: Parallel Execution Performance Validation
// Demonstrates: Actual parallel efficiency, timing overlap, critical path
// ============================================================================

tap.test('Timing Analysis: Parallel Execution Performance', async t => {
    const executor = new TestExecutor({
        concurrency: 5,
        captureStackTraces: true,
    });

    const timingLog: Array<{event: string; step: string; timestamp: number}> = [];
    const startTime = Date.now();

    executor.on('step:start', name => {
        timingLog.push({
            event: 'start',
            step: name,
            timestamp: Date.now() - startTime,
        });
    });

    executor.on('step:end', name => {
        timingLog.push({
            event: 'end',
            step: name,
            timestamp: Date.now() - startTime,
        });
    });

    const steps = [
        async function loadProduct(assert: typeof import('assert'), context) {
            await new Promise(resolve => setTimeout(resolve, 30));
            return {productId: 'PROD-123', price: 99.99, inStock: true};
        },

        async function loadUserCart(assert: typeof import('assert'), context) {
            await new Promise(resolve => setTimeout(resolve, 30));
            return {cartId: 'CART-456', items: 2};
        },

        async function validateInventory(assert: typeof import('assert'), context) {
            const product = await context.loadProduct;
            assert.ok(product.inStock);
            await new Promise(resolve => setTimeout(resolve, 20));
            return {inventoryValid: true, reservationId: 'RES-789'};
        },

        async function calculateShipping(assert: typeof import('assert'), context) {
            const cart = await context.loadUserCart;
            assert.equal(cart.items, 2);
            await new Promise(resolve => setTimeout(resolve, 20));
            return {shippingCost: 9.99, estimatedDays: 3};
        },

        async function calculateTax(assert: typeof import('assert'), context) {
            const product = await context.loadProduct;
            await new Promise(resolve => setTimeout(resolve, 20));
            return {taxAmount: product.price * 0.08};
        },

        async function calculateTotal(assert: typeof import('assert'), context) {
            const product = await context.loadProduct;
            const shipping = await context.calculateShipping;
            const tax = await context.calculateTax;

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

        async function processPayment(assert: typeof import('assert'), context) {
            const total = await context.calculateTotal;
            const inventory = await context.validateInventory;

            assert.ok(inventory.inventoryValid);
            await new Promise(resolve => setTimeout(resolve, 40));

            return {paymentId: 'PAY-999', amount: total.total, status: 'completed'};
        },

        async function createOrder(assert: typeof import('assert'), context) {
            const payment = await context.processPayment;
            const cart = await context.loadUserCart;

            assert.equal(payment.status, 'completed');
            await new Promise(resolve => setTimeout(resolve, 30));

            return {orderId: 'ORD-111', paymentId: payment.paymentId, cartId: cart.cartId};
        },

        async function sendConfirmationEmail(assert: typeof import('assert'), context) {
            const order = await context.createOrder;
            await new Promise(resolve => setTimeout(resolve, 20));
            return {emailSent: true, orderId: order.orderId};
        },

        async function updateInventory(assert: typeof import('assert'), context) {
            await context.createOrder;
            const inventory = await context.validateInventory;

            await new Promise(resolve => setTimeout(resolve, 20));
            return {inventoryUpdated: true, reservationReleased: inventory.reservationId};
        },
    ];

    await executor.execute(steps, {testId: 'timing-analysis'});

    const progress = executor.getProgress();
    const latency = executor.getLatencyReport();

    // ========================================================================
    // Verify Parallel Execution Occurred
    // ========================================================================
    t.test('Parallel Execution Verification', async () => {
        const taxStep = progress.steps.get('calculateTax')!;
        const shippingStep = progress.steps.get('calculateShipping')!;

        // Calculate overlap between calculateTax and calculateShipping (independent steps)
        const taxRange = [taxStep.startTime!, taxStep.endTime!];
        const shippingRange = [shippingStep.startTime!, shippingStep.endTime!];

        const overlap = Math.max(
            0,
            Math.min(taxRange[1], shippingRange[1]) - Math.max(taxRange[0], shippingRange[0]),
        );

        // These independent steps should overlap significantly
        assert.ok(overlap > 10, `Steps should overlap (overlap: ${overlap}ms)`);

        console.log('Parallel execution metrics:');
        console.log(`  calculateTax duration: ${taxStep.endTime! - taxStep.startTime!}ms`);
        console.log(
            `  calculateShipping duration: ${shippingStep.endTime! - shippingStep.startTime!}ms`,
        );
        console.log(`  Overlap: ${overlap}ms`);
    });

    // ========================================================================
    // Verify Parallel Efficiency
    // ========================================================================
    t.test('Parallel Efficiency Verification', async () => {
        // Parallel efficiency should be > 1.0 (indicating speedup from parallelization)
        assert.ok(
            latency.parallelEfficiency > 1.5,
            `Parallel efficiency should be > 1.5x (actual: ${latency.parallelEfficiency.toFixed(2)}x)`,
        );

        console.log('Performance metrics:');
        console.log(`  Total duration: ${latency.totalDuration}ms`);
        console.log(`  Parallel efficiency: ${latency.parallelEfficiency.toFixed(2)}x`);
        console.log(`  Critical path: ${latency.criticalPath.join(' → ')}`);
    });

    // ========================================================================
    // Verify Independent Steps Start Simultaneously
    // ========================================================================
    t.test('Simultaneous Start Verification', async () => {
        const starts = timingLog.filter(e => e.event === 'start').slice(0, 5);

        // First 5 steps should all start within a small time window of each other
        const startTimes = starts.map(e => e.timestamp);
        const minStart = Math.min(...startTimes);
        const maxStart = Math.max(...startTimes);
        const startSyncThresholdMs = process.env.CI ? 20 : 10;

        assert.ok(
            maxStart - minStart <= startSyncThresholdMs,
            `Independent steps should start within ${startSyncThresholdMs}ms of each other (spread: ${maxStart - minStart}ms)`,
        );

        console.log('Step start times:');
        for (const start of starts) {
            console.log(`  ${start.step}: ${start.timestamp}ms`);
        }
    });

    // ========================================================================
    // Verify Dependencies Are Respected
    // ========================================================================
    t.test('Dependency Verification', async () => {
        const calculateTotalStep = progress.steps.get('calculateTotal')!;
        const loadProductStep = progress.steps.get('loadProduct')!;

        // calculateTotal depends on loadProduct, so it must complete after loadProduct completes
        // Note: Steps start immediately but block internally on dependencies
        assert.ok(
            calculateTotalStep.endTime! >= loadProductStep.endTime!,
            'Dependent step should complete after dependency completes',
        );

        const createOrderStep = progress.steps.get('createOrder')!;
        const processPaymentStep = progress.steps.get('processPayment')!;

        // createOrder depends on processPayment
        assert.ok(
            createOrderStep.endTime! >= processPaymentStep.endTime!,
            'createOrder should complete after processPayment completes',
        );

        console.log('Dependency timing:');
        console.log(
            `  loadProduct end: ${loadProductStep.endTime! - progress.startTime}ms → calculateTotal end: ${calculateTotalStep.endTime! - progress.startTime}ms`,
        );
        console.log(
            `  processPayment end: ${processPaymentStep.endTime! - progress.startTime}ms → createOrder end: ${createOrderStep.endTime! - progress.startTime}ms`,
        );
    });

    // ========================================================================
    // Verify Critical Path
    // ========================================================================
    t.test('Critical Path Verification', async () => {
        // Critical path should include the longest dependency chain
        assert.ok(latency.criticalPath.length > 0, 'Should have a critical path');
        assert.ok(
            latency.criticalPath.includes('loadProduct'),
            'Critical path should include loadProduct',
        );

        console.log('Critical path analysis:');
        console.log(`  Steps: ${latency.criticalPath.join(' → ')}`);
        console.log(`  Total duration: ${latency.totalDuration}ms`);
        console.log(`  Parallel efficiency: ${latency.parallelEfficiency.toFixed(2)}x`);
    });

    // ========================================================================
    // Log Detailed Timing Information
    // ========================================================================
    t.test('Timing Log Output', async () => {
        console.log('\n=== Complete Timing Log ===');
        for (const entry of timingLog) {
            console.log(
                `${entry.timestamp.toString().padStart(5)}ms | ${entry.event.padEnd(5)} | ${entry.step}`,
            );
        }

        console.log('\n=== Step Details ===');
        for (const [name, step] of progress.steps) {
            const duration = step.endTime! - step.startTime!;
            const queueTime = step.startTime! - progress.startTime;
            console.log(
                `${name.padEnd(25)} | Queue: ${queueTime.toString().padStart(4)}ms | Duration: ${duration.toFixed(2).padStart(6)}ms`,
            );
        }

        // Always pass - this subtest is just for logging
        assert.ok(true);
    });
});
