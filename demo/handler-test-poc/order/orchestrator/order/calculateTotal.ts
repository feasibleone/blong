import {library} from '@feasibleone/blong';

/**
 * Library function: calculates the total price for an array of order items.
 *
 * Demonstrates how library functions can use optional assertions
 * to validate invariants without production overhead.
 */
export default library(
    ({errors}) =>
        function calculateTotal(items: Array<{price: number; quantity: number}>) {
            if (!items.length) throw errors.orderInvalidItems();
            return items.reduce((sum, item) => {
                if (item.price < 0) throw errors.orderNegativePrice();
                return sum + item.price * item.quantity;
            }, 0);
        },
);
