import {validation} from '@feasibleone/blong';

export default validation(({lib: {type}}) =>
    function orderOrderConfirm() {
        return {
            params: type.Object({
                orderId: type.String(),
                paymentMethod: type.String(),
            }),
            result: type.Any(),
        };
    },
);
