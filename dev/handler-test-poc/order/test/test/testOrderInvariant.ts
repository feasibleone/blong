import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * Test: testOrderInvariant
 *
 * Demonstrates the invariant guard pattern.
 *
 * Invariants are structural properties that must always hold true.
 * Unlike assertions (which verify specific values), invariants verify
 * relationships between values. Using optional chaining, invariants
 * are zero-cost in production but catch logic errors in test/debug.
 *
 * This test verifies that the order handlers maintain their invariants:
 * - Total is always sum of (price × quantity) for all items
 * - Discounted total is always ≤ total
 * - Discount is 10% for orders > 100, 0% otherwise
 */
export default handler(
    ({lib: {group}, handler: {orderOrderCreate}}) => ({
        testOrderInvariant: ({name = 'invariant'}, $meta) =>
            group(name)([
                // Test invariant: discount boundary at 100
                async function belowThreshold(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const result = await orderOrderCreate(
                        {
                            items: [{name: 'Small item', price: 10, quantity: 5}],
                            customerId: 'inv-1',
                        },
                        $meta,
                    );

                    // Invariant: no discount below 100
                    assert.equal(result.total, 50, 'Total is 50');
                    assert.equal(
                        result.discountedTotal,
                        result.total,
                        'No discount: discountedTotal equals total',
                    );

                    return result;
                },

                // Test invariant: discount applied above 100
                async function aboveThreshold(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const result = await orderOrderCreate(
                        {
                            items: [{name: 'Large item', price: 60, quantity: 2}],
                            customerId: 'inv-2',
                        },
                        $meta,
                    );

                    // Invariant: 10% discount above 100
                    assert.equal(result.total, 120, 'Total is 120');
                    assert.equal(
                        result.discountedTotal,
                        result.total * 0.9,
                        'Discount: discountedTotal is 90% of total',
                    );
                    assert.ok(
                        result.discountedTotal <= result.total,
                        'Invariant: discountedTotal ≤ total',
                    );

                    return result;
                },

                // Test invariant: exact boundary at 100
                async function exactThreshold(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const result = await orderOrderCreate(
                        {
                            items: [{name: 'Boundary item', price: 100, quantity: 1}],
                            customerId: 'inv-3',
                        },
                        $meta,
                    );

                    // Invariant: at exactly 100, no discount (> 100 required)
                    assert.equal(result.total, 100, 'Total is exactly 100');
                    assert.equal(
                        result.discountedTotal,
                        result.total,
                        'No discount at exactly 100',
                    );

                    return result;
                },

                // Test invariant: error on invalid input
                async function invalidInput(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    await assert.rejects(
                        orderOrderCreate(
                            {items: [], customerId: 'inv-4'},
                            $meta,
                        ) as Promise<unknown>,
                        {type: 'orderInvalidItems'},
                        'Empty items array throws orderInvalidItems',
                    );

                    await assert.rejects(
                        orderOrderCreate(
                            {
                                items: [{name: 'Bad', price: -5, quantity: 1}],
                                customerId: 'inv-5',
                            },
                            $meta,
                        ) as Promise<unknown>,
                        {type: 'orderNegativePrice'},
                        'Negative price throws orderNegativePrice',
                    );
                },
            ]),
    }),
);
