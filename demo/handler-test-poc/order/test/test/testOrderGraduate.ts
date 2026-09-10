import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * Test: testOrderGraduate
 *
 * Demonstrates the handler-test graduation pattern.
 *
 * This test is the "pre-graduation" version of orderFlowExecute.
 * Compare this test with the production handler to see how tests
 * can evolve into production code:
 *
 * 1. Test version (this file): mandatory assert, test-specific setup
 * 2. Production version (orderFlowExecute.ts): optional assert?, checkpoints
 *
 * The test also calls the graduated handler (orderFlowExecute) to
 * verify it behaves identically to the manual workflow, demonstrating
 * that graduation preserves behavior.
 *
 * The graduated handler receives optional `assert?` automatically
 * from the framework proxy (when checkpoint mode is active), so its
 * internal assertions execute during tests without any caller changes.
 */
export default handler(
    ({handler: {testLoginTokenCreate, orderOrderCreate, orderOrderConfirm, orderFlowExecute}}) => ({
        testOrderGraduate: (_params: {}, $meta: IMeta) => [
            testLoginTokenCreate({}, $meta),
            // Step 1: The "test" version — manual orchestration with mandatory assertions
            async function manualFlow(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const order = (await orderOrderCreate(
                    {
                        items: [{name: 'Book', price: 30, quantity: 4}],
                        customerId: 'customer-2',
                    },
                    $meta,
                )) as {orderId: string; total: number; discountedTotal: number};
                assert.ok(order.orderId, 'Order created');
                assert.equal(order.total, 120, 'Total calculated');
                assert.equal(order.discountedTotal, 108, '10% discount applied');

                const confirmed = (await orderOrderConfirm(
                    {orderId: order.orderId, paymentMethod: 'bank'},
                    $meta,
                )) as {status: string};
                assert.equal(confirmed.status, 'CONFIRMED', 'Order confirmed');

                return {total: order.total, discountedTotal: order.discountedTotal};
            },

            // Step 2: The "graduated" version — same workflow via the production handler
            // The handler receives assert? automatically from the proxy
            async function graduatedFlow(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                // Reset checkpoints to track graduated handler's progress
                $meta.checkpoints = [];

                const result = (await orderFlowExecute(
                    {
                        items: [{name: 'Book', price: 30, quantity: 4}],
                        customerId: 'customer-3',
                        paymentMethod: 'bank',
                    },
                    $meta,
                )) as {total: number; discountedTotal: number; status: string};

                // Same assertions — the graduated handler should produce identical results
                assert.equal(result.total, 120, 'Graduated: total matches');
                assert.equal(result.discountedTotal, 108, 'Graduated: discount matches');
                assert.equal(result.status, 'CONFIRMED', 'Graduated: status matches');

                // Verify the graduated handler's own checkpoints fired
                const checkpoints = $meta.checkpoints;
                assert.ok(checkpoints.length > 0, 'Graduated handler emitted checkpoints');
                const names = checkpoints.map(cp => cp.name);
                assert.ok(
                    names.includes('order-phase-complete'),
                    'Graduated handler: order phase checkpoint',
                );
                assert.ok(
                    names.includes('confirm-phase-complete'),
                    'Graduated handler: confirm phase checkpoint',
                );

                return result;
            },

            // Step 3: Compare the two approaches
            async function compareResults(
                assert: typeof Assert,
                {
                    manualFlow,
                    graduatedFlow,
                }: {
                    manualFlow: Promise<{total: number; discountedTotal: number}>;
                    graduatedFlow: Promise<{total: number; discountedTotal: number}>;
                },
            ) {
                const manual = await manualFlow;
                const graduated = await graduatedFlow;

                assert.equal(
                    manual.total,
                    graduated.total,
                    'Manual and graduated produce same total',
                );
                assert.equal(
                    manual.discountedTotal,
                    graduated.discountedTotal,
                    'Manual and graduated produce same discounted total',
                );
            },
        ],
    }),
);
