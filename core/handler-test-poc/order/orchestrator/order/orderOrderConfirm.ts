import {handler, type IMeta} from '@feasibleone/blong';

interface OrderConfirmParams {
    orderId: string;
    paymentMethod: string;
}

interface OrderConfirmResult {
    orderId: string;
    status: string;
    confirmedAt: string;
}

/**
 * Handler: orderOrderConfirm
 *
 * Demonstrates checkpoint-driven progress tracking in a handler.
 * Each checkpoint records the handler's progress, enabling:
 * - Test assertions on intermediate states
 * - Structured logging in debug/staging
 * - Zero overhead in production via optional chaining
 */
export default handler(
    ({lib: {checkpoint}}) =>
        async function orderOrderConfirm(
            {orderId, paymentMethod}: OrderConfirmParams,
            $meta: IMeta,
            assert?: {
                ok: (value: unknown, message?: string) => void;
                equal: (actual: unknown, expected: unknown, message?: string) => void;
            },
        ): Promise<OrderConfirmResult> {
            // Step 1: Validate payment method
            const validMethods = ['card', 'bank', 'wallet'];
            const isValidPaymentMethod = validMethods.includes(paymentMethod);
            assert?.ok(isValidPaymentMethod, 'Valid payment method');
            if (!isValidPaymentMethod) {
                throw new Error(`Invalid payment method: ${paymentMethod}`);
            }
            checkpoint?.('payment-validated', {paymentMethod});

            // Step 2: Process payment (simulated)
            checkpoint?.('payment-processing', {orderId, paymentMethod});

            // Step 3: Confirm order
            const confirmedAt = new Date().toISOString();
            checkpoint?.('order-confirmed', {orderId, confirmedAt});

            return {
                orderId,
                status: 'CONFIRMED',
                confirmedAt,
            };
        },
);
