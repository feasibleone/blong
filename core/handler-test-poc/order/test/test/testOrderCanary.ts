import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * Test: testOrderCanary
 *
 * Demonstrates the canary assertion pattern.
 *
 * Canary assertions are "soft" checks that log warnings instead of
 * throwing errors. In production, they detect anomalies without
 * breaking the flow. In tests, they can be verified by checking
 * log output or canary counters.
 *
 * This test also demonstrates progressive verification levels:
 * - Level 0 (production): canaries only — log anomalies silently
 * - Level 1 (monitoring): canaries + checkpoints — log progress
 * - Level 2 (staging): + assertions as warnings
 * - Level 3 (debug): + assertions as errors
 * - Level 4 (test): full assertion mode
 *
 * At each level, the handler code is identical — only the
 * configuration changes what's active.
 *
 * Naming note: No 'name' parameter — context name is injected via $meta
 * by the framework proxy. Planned usage:
 *   {handler: {testOrderCanary: {normalFlow, highValueFlow}}}
 * to distinguish test scenarios in reports without parameter conflicts.
 */
export default handler(
    ({handler: {orderOrderCreate, orderFlowExecute}}) => ({
        // No 'name' parameter — context name is injected into $meta by the proxy
        testOrderCanary: (_params: {}, $meta: IMeta) => [
            // Verify normal flow works
            async function normalOrder(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const result = await orderOrderCreate(
                    {
                        items: [{name: 'Normal item', price: 20, quantity: 3}],
                        customerId: 'canary-1',
                    },
                    $meta,
                );

                assert.equal(result.total, 60, 'Normal order total');
                assert.equal(result.status, 'PENDING', 'Normal order status');

                return result;
            },

            // Test the full graduated flow
            async function fullFlow(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const result = await orderFlowExecute(
                    {
                        items: [
                            {name: 'Premium', price: 200, quantity: 1},
                            {name: 'Standard', price: 50, quantity: 2},
                        ],
                        customerId: 'canary-2',
                        paymentMethod: 'wallet',
                    },
                    $meta,
                );

                assert.equal(result.total, 300, 'Full flow total');
                assert.equal(result.discountedTotal, 270, 'Full flow discount');
                assert.equal(result.status, 'CONFIRMED', 'Full flow confirmed');

                // In a real canary scenario, we would check:
                // - Was the order total unusually high? (canary)
                // - Did processing take too long? (canary)
                // - Were all checkpoints hit in order? (invariant)
                assert.ok(result.total > 0, 'Canary: total is positive');
                assert.ok(
                    result.discountedTotal <= result.total,
                    'Canary: discount does not exceed total',
                );

                return result;
            },
        ],
    }),
);
