import {handler, type IMeta} from '@feasibleone/blong';

interface OrderItem {
    name: string;
    price: number;
    quantity: number;
}

interface OrderParams {
    items: OrderItem[];
    customerId: string;
}

interface OrderResult {
    orderId: string;
    total: number;
    discountedTotal: number;
    status: string;
}

/**
 * Handler: orderOrderCreate
 *
 * Demonstrates the unified handler-test concept:
 * - $meta.checkpoint?.() for progress tracing (no-op in production via optional chaining)
 * - assert?.() for optional assertions (no-op in production)
 * - Both become active in test/debug mode without code changes
 *
 * This handler can be tested by calling it from a test handler,
 * then verifying the checkpoints captured in $meta.checkpoints.
 */
export default handler(
    ({lib: {assert, calculateTotal}}) =>
        async function orderOrderCreate(
            {items, customerId}: OrderParams,
            $meta: IMeta,
        ): Promise<OrderResult> {
            // Step 1: Calculate total
            const total = calculateTotal(items) as number;
            assert?.ok(total > 0, 'Order total must be positive');
            $meta.checkpoint?.('total-calculated', {total, itemCount: items.length});

            // Step 2: Apply discount (10% for orders over 100)
            const discount = total > 100 ? 0.1 : 0;
            const discountedTotal = total * (1 - discount);
            assert?.ok(discountedTotal <= total, 'Discounted total must not exceed original');
            $meta.checkpoint?.('discount-applied', {discount, discountedTotal});

            // Step 3: Create order record
            const orderId = `ORD-${customerId}-${Date.now()}`;
            $meta.checkpoint?.('order-created', {orderId, status: 'PENDING'});

            return {
                orderId,
                total,
                discountedTotal,
                status: 'PENDING',
            };
        },
);
