import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * Test: testOrderCheckpoint
 *
 * Demonstrates checkpoint-driven test assertions.
 *
 * This test calls handlers that use $meta.checkpoint?.() internally,
 * then verifies the checkpoint sequence to ensure the handler's
 * internal progress matches expectations.
 *
 * Key concepts:
 * - Handlers emit checkpoints without knowing about tests
 * - Tests read checkpoints from $meta.checkpoints
 * - The same handler code works in both production and test
 */
export default handler(
    ({handler: {testLoginTokenCreate, orderOrderCreate, orderOrderConfirm}}) => ({
        testOrderCheckpoint: (_params: {}, $meta: IMeta) => [
            testLoginTokenCreate({}, $meta),
            async function createOrder(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                // Reset checkpoints for this test scope
                $meta.checkpoints = [];

                const result = (await orderOrderCreate(
                    {
                        items: [
                            {name: 'Widget', price: 50, quantity: 3},
                            {name: 'Gadget', price: 25, quantity: 2},
                        ],
                        customerId: 'cust-1',
                    },
                    $meta,
                )) as {orderId: string; total: number; discountedTotal: number; status: string};

                // Assert on the result
                assert.ok(result.orderId, 'Order ID returned');
                assert.equal(result.total, 200, 'Total is correct');
                assert.equal(result.discountedTotal, 180, 'Discount applied for orders > 100');
                assert.equal(result.status, 'PENDING', 'Initial status is PENDING');

                // Verify checkpoints recorded during execution
                const checkpoints = $meta.checkpoints!;
                assert.ok(checkpoints, 'Checkpoints array exists');
                assert.equal(checkpoints.length, 3, 'Three checkpoints recorded');

                const cp0 = checkpoints[0].data as Record<string, unknown>;
                assert.equal(checkpoints[0].name, 'total-calculated', 'First checkpoint: total');
                assert.equal(cp0.total, 200, 'Checkpoint total value');
                assert.equal(cp0.itemCount, 2, 'Checkpoint item count');

                const cp1 = checkpoints[1].data as Record<string, unknown>;
                assert.equal(
                    checkpoints[1].name,
                    'discount-applied',
                    'Second checkpoint: discount',
                );
                assert.equal(cp1.discount, 0.1, 'Checkpoint discount rate');
                assert.equal(cp1.discountedTotal, 180, 'Checkpoint discounted total');

                const cp2 = checkpoints[2].data as Record<string, unknown>;
                assert.equal(checkpoints[2].name, 'order-created', 'Third checkpoint: created');
                assert.equal(cp2.status, 'PENDING', 'Checkpoint order status');
                assert.ok(cp2.orderId, 'Checkpoint has order ID');

                // Verify all checkpoints have timestamps
                for (const cp of checkpoints) {
                    assert.ok(cp.timestamp > 0, `Checkpoint '${cp.name}' has timestamp`);
                }

                return result;
            },

            async function confirmOrder(
                assert: typeof Assert,
                {createOrder, $meta}: {createOrder: Promise<{orderId: string}>; $meta: IMeta},
            ) {
                const order = await createOrder;
                // Reset checkpoints for this handler call
                $meta.checkpoints = [];

                const result = (await orderOrderConfirm(
                    {orderId: order.orderId, paymentMethod: 'card'},
                    $meta,
                )) as {orderId: string; status: string; confirmedAt: string};

                assert.equal(result.status, 'CONFIRMED', 'Order confirmed');
                assert.ok(result.confirmedAt, 'Confirmation timestamp set');

                // Verify confirm handler's checkpoints
                const checkpoints = $meta.checkpoints;
                assert.ok(checkpoints, 'Confirm checkpoints exist');
                assert.equal(checkpoints.length, 3, 'Three confirm checkpoints');

                assert.equal(checkpoints[0].name, 'payment-validated', 'First: payment validated');
                assert.equal(
                    checkpoints[1].name,
                    'payment-processing',
                    'Second: payment processing',
                );
                assert.equal(checkpoints[2].name, 'order-confirmed', 'Third: order confirmed');

                return result;
            },
        ],
    }),
);
