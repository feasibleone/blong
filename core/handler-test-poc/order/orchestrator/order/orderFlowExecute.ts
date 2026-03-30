import {handler, type IMeta} from '@feasibleone/blong';

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
    ({lib: {checkpoint}, handler: {orderOrderCreate, orderOrderConfirm}}) =>
        async function orderFlowExecute(
            {items, customerId, paymentMethod}: OrderFlowParams,
            $meta: IMeta,
            assert?: {
                ok: (value: unknown, message?: string) => void;
                equal: (actual: unknown, expected: unknown, message?: string) => void;
            },
        ) {
            // Phase 1: Create order
            const order = await orderOrderCreate({items, customerId}, $meta, assert);
            assert?.ok(order.orderId, 'Order created successfully');
            checkpoint?.('order-phase-complete', {orderId: order.orderId, total: order.total});

            // Phase 2: Confirm order
            const confirmed = await orderOrderConfirm(
                {orderId: order.orderId, paymentMethod},
                $meta,
                assert,
            );
            assert?.equal(confirmed.status, 'CONFIRMED', 'Order confirmed');
            checkpoint?.('confirm-phase-complete', {
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
