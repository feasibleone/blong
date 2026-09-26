import {handler, type IMeta, type IProgressPoint, type IProgressRegion} from '@feasibleone/blong';
import type Assert from 'node:assert';

/** The points an invocation announced, in the order it announced them. */
const pointsOf = (meta: IMeta): IProgressPoint[] =>
    (meta.progress ?? []).filter((entry): entry is IProgressPoint => entry.kind === 'point');

/** The branches it took, in the order it took them. */
const regionsOf = (meta: IMeta): IProgressRegion[] =>
    (meta.progress ?? []).filter((entry): entry is IProgressRegion => entry.kind === 'region');

/**
 * Test: testOrderCheckpoint
 *
 * Demonstrates checkpoint-driven test assertions.
 *
 * This test calls handlers that use $meta.checkpoint?.() internally,
 * then verifies the progress recorded in `$meta.progress` to ensure the handler's
 * internal progress matches expectations.
 *
 * Key concepts:
 * - Handlers emit checkpoints without knowing about tests
 * - Tests read one progress array, which holds the points and the branches together
 * - The same handler code works in both production and test
 */
export default handler(({handler: {loginTokenCreate, orderOrderCreate, orderOrderConfirm}}) => ({
    testOrderCheckpoint: (_params: {}, $meta: IMeta) => [
        async function login(_assert: unknown, {$meta}: {$meta: IMeta}) {
            return loginTokenCreate({username: 'testUser', password: 'testPassword'}, $meta);
        },
        async function createOrder(
            assert: typeof Assert,
            {login, $meta}: {login: Promise<unknown>; $meta: IMeta},
        ) {
            // The login has to land before the first authenticated call: the token that call
            // carries is the one the login response delivered.
            await login;

            // Reset the invocation's progress for this test scope
            $meta.progress = [];

            const result = (await orderOrderCreate(
                {
                    items: [
                        {name: 'Widget', price: 50, quantity: 3},
                        {name: 'Gadget', price: 25, quantity: 2},
                    ],
                    customerId: 'customer-1',
                },
                $meta,
            )) as {orderId: string; total: number; discountedTotal: number; status: string};

            // Assert on the result
            assert.ok(result.orderId, 'Order ID returned');
            assert.equal(result.total, 200, 'Total is correct');
            assert.equal(result.discountedTotal, 180, 'Discount applied for orders > 100');
            assert.equal(result.status, 'PENDING', 'Initial status is PENDING');

            // Verify the progress recorded during execution
            const points = pointsOf($meta);
            assert.equal(points.length, 3, 'Three checkpoints recorded');

            const cp0 = points[0].data as Record<string, unknown>;
            assert.equal(points[0].name, 'total-calculated', 'First checkpoint: total');
            assert.equal(cp0.total, 200, 'Checkpoint total value');
            assert.equal(cp0.itemCount, 2, 'Checkpoint item count');

            const cp1 = points[1].data as Record<string, unknown>;
            assert.equal(points[1].name, 'discount-applied', 'Second checkpoint: discount');
            assert.equal(cp1.discount, 0.1, 'Checkpoint discount rate');
            assert.equal(cp1.discountedTotal, 180, 'Checkpoint discounted total');

            const cp2 = points[2].data as Record<string, unknown>;
            assert.equal(points[2].name, 'order-created', 'Third checkpoint: created');
            assert.equal(cp2.status, 'PENDING', 'Checkpoint order status');
            assert.ok(cp2.orderId, 'Checkpoint has order ID');

            // Verify all checkpoints have timestamps
            for (const point of points) {
                assert.ok(point.timestamp > 0, `Checkpoint '${point.name}' has timestamp`);
            }

            // The discount is a branch, and the point it produced names it — which is
            // what a report groups by (PRD R26/R27).
            const [branch] = regionsOf($meta);
            assert.equal(branch?.discriminator, 'discount-tier', 'The discount branch was taken');
            assert.equal(branch?.chosen, 'standard', 'and the standard tier is what it chose');
            assert.deepEqual(
                points.filter(point => point.regions?.length === 1).map(point => point.name),
                ['discount-applied'],
                'with the point it produced inside it, and the others outside',
            );

            return result;
        },

        async function confirmOrder(
            assert: typeof Assert,
            {createOrder, $meta}: {createOrder: Promise<{orderId: string}>; $meta: IMeta},
        ) {
            const order = await createOrder;
            // Reset the invocation's progress for this handler call
            $meta.progress = [];

            const result = (await orderOrderConfirm(
                {orderId: order.orderId, paymentMethod: 'card'},
                $meta,
            )) as {orderId: string; status: string; confirmedAt: string};

            assert.equal(result.status, 'CONFIRMED', 'Order confirmed');
            assert.ok(result.confirmedAt, 'Confirmation timestamp set');

            // Verify the confirm handler's progress
            const points = pointsOf($meta);
            assert.equal(points.length, 3, 'Three confirm checkpoints');

            assert.equal(points[0].name, 'payment-validated', 'First: payment validated');
            assert.equal(points[1].name, 'payment-processing', 'Second: payment processing');
            assert.equal(points[2].name, 'order-confirmed', 'Third: order confirmed');

            return result;
        },
    ],
}));
