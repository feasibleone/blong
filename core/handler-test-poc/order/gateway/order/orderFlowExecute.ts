import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function orderFlowExecute() {
            return {
                params: type.Object({
                    items: type.Array(
                        type.Object({
                            name: type.String(),
                            price: type.Number(),
                            quantity: type.Number(),
                        }),
                    ),
                    customerId: type.String(),
                    paymentMethod: type.String(),
                }),
                result: type.Unknown(),
            };
        },
);
