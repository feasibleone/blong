import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * Test: testOrderCheckpoint
 *
 * Demonstrates checkpoint-driven test assertions.
 *
 * This test calls handlers that use checkpoint?.() internally,
 * then verifies the checkpoint sequence to ensure the handler's
 * internal progress matches expectations.
 *
 * Key concepts:
 * - Handlers emit checkpoints without knowing about tests
 * - Tests read checkpoints from $meta.checkpoints
 * - The same handler code works in both production and test
 *
 * Naming note: The execution context name ('checkpoint verification') is
 * injected into $meta by the framework, not passed as a parameter.
 * When the proxy is updated, this will be done via:
 *   {handler: {testOrderCheckpoint: {checkpointVerification}}}
 * which injects $meta.name = 'checkpoint verification' automatically.
 */
export default handler(
    ({handler: {orderOrderCreate, orderOrderConfirm}}) => ({
        // No 'name' parameter — context name is injected into $meta by the proxy
        testOrderCheckpoint: (_params: {}, $meta: IMeta) => [
            async function createOrder(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const result = await orderOrderCreate(
                    {
                        items: [
                            {name: 'Widget', price: 50, quantity: 3},
                            {name: 'Gadget', price: 25, quantity: 2},
                        ],
                        customerId: 'cust-1',
                    },
                    $meta,
                );

                // Assert on the result
                assert.ok(result.orderId, 'Order ID returned');
                assert.equal(result.total, 200, 'Total is correct');
                assert.equal(result.discountedTotal, 180, 'Discount applied for orders > 100');
                assert.equal(result.status, 'PENDING', 'Initial status is PENDING');

                return result;
            },

            async function confirmOrder(
                assert: typeof Assert,
                {createOrder, $meta}: {createOrder: Promise<{orderId: string}>; $meta: IMeta},
            ) {
                const order = await createOrder;
                const result = await orderOrderConfirm(
                    {orderId: order.orderId, paymentMethod: 'card'},
                    $meta,
                );

                assert.equal(result.status, 'CONFIRMED', 'Order confirmed');
                assert.ok(result.confirmedAt, 'Confirmation timestamp set');

                return result;
            },
        ],
    }),
);
