import {library} from '@feasibleone/blong';

export default library(({lib: {error}}) => {
    error({
        orderInsufficientFunds: 'Insufficient funds: balance {balance} < amount {amount}',
        orderInvalidItems: 'Order must contain at least one item',
        orderNegativePrice: 'Item price must be non-negative',
    });
});
