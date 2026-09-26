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
 * then verifying the progress captured in $meta.progress.
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

            // Step 2: Apply discount (10% for orders over 100) — as a branch, not a ternary, so
            // the choice is a progress point of its own and the checkpoint the tier produces is
            // announced *inside* it. That nesting is what a report draws as a group (PRD
            // R26/R27). The fallback keeps the arithmetic identical where nothing prepared
            // `$meta`.
            const discount =
                $meta.decide?.('discount-tier', {total}, [
                    {
                        name: 'standard',
                        when: values => (values.total as number) > 100,
                        run: () => {
                            const rate = 0.1;
                            $meta.checkpoint?.('discount-applied', {
                                discount: rate,
                                discountedTotal: total * (1 - rate),
                            });
                            return rate;
                        },
                    },
                    {name: 'none', when: () => true, run: () => 0},
                ]) ?? (total > 100 ? 0.1 : 0);

            const discountedTotal = total * (1 - discount);
            assert?.ok(discountedTotal <= total, 'Discounted total must not exceed original');

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
