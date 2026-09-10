import { handler, type IMeta } from '@feasibleone/blong';

interface OrderFlowParams {
    items: Array<{name: string; price: number; quantity: number}>;
    customerId: string;
    paymentMethod: string;
}

/**
 * Handler: orderFlowExecute
 *
 * Demonstrates handler composition with checkpoints.
 *
 * This handler was "graduated" from a test — it started as testOrderFlow
 * in the test layer, proved the workflow worked, and was promoted to
 * a production handler. The assertions became optional (assert?.),
 * the checkpoints provide production observability.
 *
 * Compare this with testOrderGraduate in the test layer to see
 * the before/after of graduation.
 */
export default handler(
    ({lib: {assert}, handler: {orderOrderCreate, orderOrderConfirm}}) =>
        async function orderFlowExecute(
            {items, customerId, paymentMethod}: OrderFlowParams,
            $meta: IMeta,
        ) {
            // Phase 1: Create order
            const order = await orderOrderCreate({items, customerId}, $meta) as {
                orderId: string;
                total: number;
                discountedTotal: number;
            };
            assert?.ok(order.orderId, 'Order created successfully');
            $meta.checkpoint?.('order-phase-complete', {orderId: order.orderId, total: order.total});

            // Phase 2: Confirm order
            const confirmed = await orderOrderConfirm(
                {orderId: order.orderId, paymentMethod},
                $meta,
            ) as {
                orderId: string;
                status: string;
                confirmedAt: string;
            };
            assert?.equal(confirmed.status, 'CONFIRMED', 'Order confirmed');
            $meta.checkpoint?.('confirm-phase-complete', {
                orderId: confirmed.orderId,
                status: confirmed.status,
            });

            return {
                orderId: confirmed.orderId,
                total: order.total,
                discountedTotal: order.discountedTotal,
                status: confirmed.status,
                confirmedAt: confirmed.confirmedAt,
            };
        },
);
